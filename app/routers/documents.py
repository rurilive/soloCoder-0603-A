import os
import mimetypes
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Query
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, Document, DocumentStatus, DocumentPermission, PermissionLevel
from app.schemas import DocumentResponse, DocumentUpdate, PermissionCreate, PermissionResponse
from app.security import get_current_active_user, has_document_permission, is_admin, get_optional_current_user
from app.config import get_settings
from app.converter import (
    is_allowed_file,
    get_file_type,
    save_upload_file,
    convert_document,
    get_pdf_page_count,
)

router = APIRouter(prefix="/api/documents", tags=["documents"])
settings = get_settings()


@router.post("/upload", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    watermark_enabled: bool = Form(False),
    watermark_text: Optional[str] = Form(None),
    is_public: bool = Form(False),
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
    db.delete(doc)
    db.commit()
    return None


@router.post("/{doc_id}/convert", response_model=DocumentResponse)
def convert_document_endpoint(
    doc_id: int,
    watermark_text: Optional[str] = Form(None),
    watermark_enabled: bool = Form(False),
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
    doc.status = DocumentStatus.CONVERTING
    db.commit()
    try:
        final_watermark = None
        if watermark_enabled or doc.watermark_enabled:
            final_watermark = watermark_text or doc.watermark_text or current_user.username
        preview_name, preview_path = convert_document(doc.file_path, doc.file_type, final_watermark)
        doc.preview_path = preview_path
        if doc.file_type == "document":
            doc.preview_type = "html"
        elif doc.file_type == "pdf":
            doc.preview_type = "pdf_images"
        elif doc.file_type == "image":
            doc.preview_type = "image"
        doc.status = DocumentStatus.READY
        if watermark_enabled:
            doc.watermark_enabled = True
            doc.watermark_text = final_watermark
    except Exception as e:
        doc.status = DocumentStatus.FAILED
        db.commit()
        raise HTTPException(status_code=500, detail=f"Conversion failed: {str(e)}")
    db.commit()
    db.refresh(doc)
    return doc


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
    }
    if doc.preview_type == "pdf_images" and doc.preview_path:
        info["total_pages"] = get_pdf_page_count(doc.preview_path)
    return JSONResponse(content=info)


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
