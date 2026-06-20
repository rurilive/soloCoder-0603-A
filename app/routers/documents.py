import os
import logging
import mimetypes
import asyncio
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Query
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    User,
    Document,
    DocumentStatus,
    DocumentPermission,
    PermissionLevel,
    ConvertTask,
    ConvertTaskStatus,
)
from app.schemas import (
    DocumentResponse,
    DocumentUpdate,
    PermissionCreate,
    PermissionResponse,
    ConvertTaskResponse,
    PdfSearchResponse,
    PdfSearchResult,
)
from app.security import get_current_active_user, has_document_permission, is_admin, get_optional_current_user
from app.config import get_settings
from app.converter import (
    is_allowed_file,
    get_file_type,
    save_upload_file,
    get_pdf_page_count,
)
from app.converter_client import submit_convert_task, get_convert_task_status, search_pdf_text

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/documents", tags=["documents"])
settings = get_settings()


@router.post("/upload", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    watermark_enabled: bool = Form(False),
    watermark_text: Optional[str] = Form(None),
    is_public: bool = Form(False),
    auto_convert: bool = Form(True),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    if not is_allowed_file(file.filename):
        raise HTTPException(status_code=400, detail="File type not allowed")
    content = await file.read()
    if len(content) > settings.max_file_size:
        raise HTTPException(status_code=400, detail="File too large")
    filename, file_path = save_upload_file(content, file.filename)
    file_type = get_file_type(file.filename)
    mime_type = file.content_type or mimetypes.guess_type(file.filename)[0]
    doc = Document(
        filename=filename,
        original_filename=file.filename,
        file_path=file_path,
        file_size=len(content),
        file_type=file_type,
        mime_type=mime_type,
        status=DocumentStatus.UPLOADED,
        watermark_enabled=watermark_enabled,
        watermark_text=watermark_text if watermark_enabled else None,
        owner_id=current_user.id,
        is_public=is_public,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    if auto_convert:
        _start_async_convert(doc, db, current_user)
    return doc


@router.get("", response_model=List[DocumentResponse])
def list_documents(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    if is_admin(current_user):
        docs = db.query(Document).order_by(Document.created_at.desc()).offset(skip).limit(limit).all()
    else:
        doc_ids_with_perm = [p.document_id for p in db.query(DocumentPermission).filter(DocumentPermission.user_id == current_user.id).all()]
        docs = (
            db.query(Document)
            .filter(
                (Document.owner_id == current_user.id)
                | (Document.is_public == True)
                | (Document.id.in_(doc_ids_with_perm))
            )
            .order_by(Document.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )
    return docs


@router.get("/{doc_id}", response_model=DocumentResponse)
def get_document(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not has_document_permission(db, current_user, doc, PermissionLevel.VIEW):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return doc


@router.put("/{doc_id}", response_model=DocumentResponse)
def update_document(
    doc_id: int,
    update_data: DocumentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not has_document_permission(db, current_user, doc, PermissionLevel.EDIT):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    data = update_data.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(doc, key, value)
    db.commit()
    db.refresh(doc)
    return doc


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not has_document_permission(db, current_user, doc, PermissionLevel.OWNER):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    if os.path.exists(doc.file_path):
        os.remove(doc.file_path)
    if doc.preview_path and os.path.exists(doc.preview_path):
        if os.path.isdir(doc.preview_path):
            import shutil
            shutil.rmtree(doc.preview_path)
        else:
            os.remove(doc.preview_path)
    db.query(ConvertTask).filter(ConvertTask.document_id == doc_id).delete()
    db.delete(doc)
    db.commit()
    return None


def _determine_preview_type(file_type: str, use_pdf_native: bool) -> str:
    if file_type == "document":
        return "html"
    elif file_type == "pdf":
        return "pdf_native" if use_pdf_native else "pdf_images"
    elif file_type == "image":
        return "image"
    elif file_type == "text":
        return "html"
    return "unknown"


def _start_async_convert(doc: Document, db: Session, current_user: User,
                         watermark_text: Optional[str] = None,
                         watermark_enabled: bool = False,
                         use_pdf_native: Optional[bool] = None):
    if doc.status == DocumentStatus.CONVERTING:
        return
    doc.status = DocumentStatus.CONVERTING
    db.commit()
    final_watermark = None
    if watermark_enabled or doc.watermark_enabled:
        final_watermark = watermark_text or doc.watermark_text or current_user.username
    effective_use_pdf_native = use_pdf_native if use_pdf_native is not None else (settings.pdf_native_enabled and doc.file_type == "pdf")
    task = ConvertTask(
        document_id=doc.id,
        status=ConvertTaskStatus.PENDING,
        progress=0,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    asyncio.create_task(
        _async_convert_runner(
            task_id=task.id,
            doc_id=doc.id,
            file_path=doc.file_path,
            file_type=doc.file_type,
            filename=doc.original_filename,
            watermark_text=final_watermark,
            use_pdf_native=effective_use_pdf_native,
            watermark_enabled=watermark_enabled,
        )
    )


async def _async_convert_runner(
    task_id: int,
    doc_id: int,
    file_path: str,
    file_type: str,
    filename: str,
    watermark_text: Optional[str],
    use_pdf_native: bool,
    watermark_enabled: bool,
):
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        task = db.query(ConvertTask).filter(ConvertTask.id == task_id).first()
        if not task:
            return
        task.status = ConvertTaskStatus.RUNNING
        task.started_at = datetime.utcnow()
        db.commit()
        try:
            result = await submit_convert_task(
                file_path=file_path,
                file_type=file_type,
                filename=filename,
                watermark_text=watermark_text,
                use_pdf_native=use_pdf_native,
            )
            converter_task_id = result.get("task_id")
            while True:
                status_data = await get_convert_task_status(converter_task_id)
                task_status = status_data.get("status")
                task_progress = status_data.get("progress", 0)
                task.progress = task_progress
                db.commit()
                if task_status == "completed":
                    task.status = ConvertTaskStatus.COMPLETED
                    task.progress = 100
                    task.preview_name = status_data.get("preview_name")
                    task.preview_path = status_data.get("preview_path")
                    task.preview_type = status_data.get("preview_type")
                    task.completed_at = datetime.utcnow()
                    doc = db.query(Document).filter(Document.id == doc_id).first()
                    if doc:
                        doc.preview_path = status_data.get("preview_path")
                        doc.preview_type = status_data.get("preview_type") or _determine_preview_type(file_type, use_pdf_native)
                        doc.status = DocumentStatus.READY
                        if watermark_enabled:
                            doc.watermark_enabled = True
                            doc.watermark_text = watermark_text
                    db.commit()
                    break
                elif task_status == "failed":
                    task.status = ConvertTaskStatus.FAILED
                    task.error_message = status_data.get("error_message", "Conversion failed")
                    task.completed_at = datetime.utcnow()
                    doc = db.query(Document).filter(Document.id == doc_id).first()
                    if doc:
                        doc.status = DocumentStatus.FAILED
                    db.commit()
                    break
                await asyncio.sleep(1)
        except Exception as e:
            logger.error(f"Async conversion error for doc {doc_id}: {e}")
            task.status = ConvertTaskStatus.FAILED
            task.error_message = str(e)
            task.completed_at = datetime.utcnow()
            doc = db.query(Document).filter(Document.id == doc_id).first()
            if doc:
                doc.status = DocumentStatus.FAILED
            db.commit()
    finally:
        db.close()


@router.post("/{doc_id}/convert", response_model=ConvertTaskResponse)
async def convert_document_endpoint(
    doc_id: int,
    watermark_text: Optional[str] = Form(None),
    watermark_enabled: bool = Form(False),
    use_pdf_native: Optional[bool] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not has_document_permission(db, current_user, doc, PermissionLevel.EDIT):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    if not os.path.exists(doc.file_path):
        raise HTTPException(status_code=400, detail="Source file not found")
    _start_async_convert(doc, db, current_user, watermark_text, watermark_enabled, use_pdf_native)
    db.refresh(doc)
    task = db.query(ConvertTask).filter(ConvertTask.document_id == doc_id).order_by(ConvertTask.created_at.desc()).first()
    if task:
        return task
    raise HTTPException(status_code=500, detail="Failed to create convert task")


@router.get("/{doc_id}/convert/status", response_model=ConvertTaskResponse)
def get_convert_status(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not has_document_permission(db, current_user, doc, PermissionLevel.VIEW):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    task = db.query(ConvertTask).filter(ConvertTask.document_id == doc_id).order_by(ConvertTask.created_at.desc()).first()
    if not task:
        raise HTTPException(status_code=404, detail="No conversion task found")
    return task


@router.get("/{doc_id}/preview")
def preview_document(
    doc_id: int,
    page: int = Query(1, ge=1),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not has_document_permission(db, current_user, doc, PermissionLevel.VIEW):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    if doc.status != DocumentStatus.READY or not doc.preview_path or not os.path.exists(doc.preview_path):
        raise HTTPException(status_code=400, detail="Document not ready for preview")
    if doc.preview_type == "html":
        return FileResponse(doc.preview_path, media_type="text/html")
    elif doc.preview_type == "image":
        return FileResponse(doc.preview_path, media_type="image/png")
    elif doc.preview_type == "pdf_images":
        total_pages = get_pdf_page_count(doc.preview_path)
        if page > total_pages:
            raise HTTPException(status_code=404, detail="Page not found")
        page_path = os.path.join(doc.preview_path, f"page_{page}.png")
        if not os.path.exists(page_path):
            raise HTTPException(status_code=404, detail="Page not found")
        return FileResponse(page_path, media_type="image/png")
    else:
        raise HTTPException(status_code=400, detail="Unknown preview type")


@router.get("/{doc_id}/preview/info")
def preview_info(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not has_document_permission(db, current_user, doc, PermissionLevel.VIEW):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    info = {
        "id": doc.id,
        "preview_type": doc.preview_type,
        "status": doc.status.value,
        "total_pages": None,
        "progress": None,
    }
    if doc.preview_type == "pdf_images" and doc.preview_path:
        info["total_pages"] = get_pdf_page_count(doc.preview_path)
    elif doc.preview_type == "pdf_native":
        try:
            import fitz
            pdf_doc = fitz.open(doc.preview_path if doc.preview_path and os.path.exists(doc.preview_path) else doc.file_path)
            info["total_pages"] = pdf_doc.page_count
            pdf_doc.close()
        except Exception:
            info["total_pages"] = 0
    if doc.status == DocumentStatus.CONVERTING:
        task = db.query(ConvertTask).filter(ConvertTask.document_id == doc_id).order_by(ConvertTask.created_at.desc()).first()
        if task:
            info["progress"] = task.progress
    return JSONResponse(content=info)


@router.get("/{doc_id}/pdf/file")
def get_pdf_file(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not has_document_permission(db, current_user, doc, PermissionLevel.VIEW):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    if doc.preview_type != "pdf_native":
        raise HTTPException(status_code=400, detail="Document is not in pdf_native mode")
    pdf_path = doc.preview_path if doc.preview_path and os.path.exists(doc.preview_path) else doc.file_path
    if not os.path.exists(pdf_path):
        raise HTTPException(status_code=400, detail="PDF file not found")
    return FileResponse(pdf_path, media_type="application/pdf", filename=doc.original_filename)


@router.get("/{doc_id}/pdf/search", response_model=PdfSearchResponse)
async def search_pdf(
    doc_id: int,
    q: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not has_document_permission(db, current_user, doc, PermissionLevel.VIEW):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    if doc.preview_type != "pdf_native":
        raise HTTPException(status_code=400, detail="Search is only supported in pdf_native mode")
    pdf_path = doc.preview_path if doc.preview_path and os.path.exists(doc.preview_path) else doc.file_path
    if not os.path.exists(pdf_path):
        raise HTTPException(status_code=400, detail="PDF file not found")
    try:
        result = await search_pdf_text(pdf_path, q)
        return PdfSearchResponse(
            query=q,
            total_matches=result["total_matches"],
            results=[PdfSearchResult(**r) for r in result["results"]],
        )
    except Exception as e:
        logger.error(f"PDF search error: {e}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


@router.post("/{doc_id}/permissions", response_model=PermissionResponse, status_code=status.HTTP_201_CREATED)
def add_permission(
    doc_id: int,
    perm_data: PermissionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not has_document_permission(db, current_user, doc, PermissionLevel.OWNER):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    if doc_id != perm_data.document_id:
        raise HTTPException(status_code=400, detail="Document ID mismatch")
    existing = (
        db.query(DocumentPermission)
        .filter(
            DocumentPermission.document_id == doc_id,
            DocumentPermission.user_id == perm_data.user_id,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Permission already exists")
    perm = DocumentPermission(**perm_data.model_dump())
    db.add(perm)
    db.commit()
    db.refresh(perm)
    return perm


@router.get("/{doc_id}/permissions", response_model=List[PermissionResponse])
def list_permissions(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not has_document_permission(db, current_user, doc, PermissionLevel.VIEW):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    perms = (
        db.query(DocumentPermission)
        .filter(DocumentPermission.document_id == doc_id)
        .all()
    )
    return perms


@router.delete("/{doc_id}/permissions/{perm_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_permission(
    doc_id: int,
    perm_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not has_document_permission(db, current_user, doc, PermissionLevel.OWNER):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    perm = (
        db.query(DocumentPermission)
        .filter(
            DocumentPermission.id == perm_id,
            DocumentPermission.document_id == doc_id,
        )
        .first()
    )
    if not perm:
        raise HTTPException(status_code=404, detail="Permission not found")
    db.delete(perm)
    db.commit()
    return None
