import json
import asyncio
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    User,
    Document,
    DocumentContent,
    DocumentVersion,
    DocumentPermission,
    PermissionLevel,
)
from app.schemas import (
    DocumentContentResponse,
    DocumentContentUpdate,
    DocumentVersionResponse,
    DocumentVersionBrief,
    EditOperation,
)
from app.security import get_current_active_user, has_document_permission
from app.converter import is_editable, get_extension

router = APIRouter(prefix="/api/documents", tags=["collaboration"])


class EditConnectionManager:
    def __init__(self):
        self.active: dict[int, list[tuple[WebSocket, int, str]]] = {}

    async def connect(self, websocket: WebSocket, doc_id: int, user_id: int, username: str):
        await websocket.accept()
        if doc_id not in self.active:
            self.active[doc_id] = []
        self.active[doc_id].append((websocket, user_id, username))
        await self.broadcast_presence(doc_id)
        await self.send_user_joined(doc_id, user_id, username)

    def disconnect(self, websocket: WebSocket, doc_id: int):
        if doc_id in self.active:
            self.active[doc_id] = [
                (ws, uid, name) for ws, uid, name in self.active[doc_id] if ws != websocket
            ]
            if not self.active[doc_id]:
                del self.active[doc_id]

    async def broadcast(self, doc_id: int, message: dict, exclude_user_id: Optional[int] = None):
        if doc_id in self.active:
            for connection, user_id, _ in self.active[doc_id]:
                if exclude_user_id and user_id == exclude_user_id:
                    continue
                try:
                    await connection.send_text(json.dumps(message, default=str))
                except Exception:
                    pass

    async def broadcast_presence(self, doc_id: int):
        if doc_id in self.active:
            users = list({uid: name for _, uid, name in self.active[doc_id]}.items())
            msg = {
                "type": "presence",
                "users": [{"id": uid, "username": name} for uid, name in users],
            }
            for connection, _, _ in self.active[doc_id]:
                try:
                    await connection.send_text(json.dumps(msg, default=str))
                except Exception:
                    pass

    async def send_user_joined(self, doc_id: int, user_id: int, username: str):
        msg = {"type": "user_joined", "user": {"id": user_id, "username": username}}
        await self.broadcast(doc_id, msg, exclude_user_id=user_id)

    async def send_user_left(self, doc_id: int, user_id: int, username: str):
        msg = {"type": "user_left", "user": {"id": user_id, "username": username}}
        await self.broadcast(doc_id, msg)

    def get_online_users(self, doc_id: int) -> List[dict]:
        if doc_id not in self.active:
            return []
        seen = {}
        for _, uid, name in self.active[doc_id]:
            if uid not in seen:
                seen[uid] = name
        return [{"id": uid, "username": name} for uid, name in seen.items()]


edit_manager = EditConnectionManager()

AUTO_SAVE_INTERVAL = 5
MAX_VERSIONS = 100


def _get_or_create_content(db: Session, doc_id: int) -> DocumentContent:
    dc = db.query(DocumentContent).filter(DocumentContent.document_id == doc_id).first()
    if dc:
        return dc
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    initial_content = ""
    try:
        with open(doc.file_path, "r", encoding="utf-8", errors="replace") as f:
            initial_content = f.read()
    except Exception:
        pass
    dc = DocumentContent(
        document_id=doc_id,
        content=initial_content,
        version=1,
    )
    db.add(dc)
    db.commit()
    db.refresh(dc)
    if initial_content:
        ver = DocumentVersion(
            document_id=doc_id,
            version=1,
            content=initial_content,
            author_id=doc.owner_id,
            change_summary="Initial version",
        )
        db.add(ver)
        db.commit()
    return dc


@router.get("/{doc_id}/content", response_model=DocumentContentResponse)
def get_document_content(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not has_document_permission(db, current_user, doc, PermissionLevel.VIEW):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    dc = _get_or_create_content(db, doc_id)
    return DocumentContentResponse(
        document_id=dc.document_id,
        content=dc.content,
        version=dc.version,
        updated_at=dc.updated_at,
    )


@router.put("/{doc_id}/content", response_model=DocumentContentResponse)
async def update_document_content(
    doc_id: int,
    data: DocumentContentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not has_document_permission(db, current_user, doc, PermissionLevel.EDIT):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    if not is_editable(doc.original_filename):
        raise HTTPException(status_code=400, detail="Document is not editable")

    dc = _get_or_create_content(db, doc_id)

    if data.base_version != dc.version:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Version conflict",
                "current_version": dc.version,
                "current_content": dc.content,
            },
        )

    dc.content = data.content
    dc.version += 1
    db.commit()
    db.refresh(dc)

    with open(doc.file_path, "w", encoding="utf-8") as f:
        f.write(dc.content)

    ver = DocumentVersion(
        document_id=doc_id,
        version=dc.version,
        content=dc.content,
        author_id=current_user.id,
        change_summary=data.change_summary,
    )
    db.add(ver)
    db.commit()

    version_count = db.query(DocumentVersion).filter(DocumentVersion.document_id == doc_id).count()
    if version_count > MAX_VERSIONS:
        oldest = (
            db.query(DocumentVersion)
            .filter(DocumentVersion.document_id == doc_id)
            .order_by(DocumentVersion.version.asc())
            .first()
        )
        if oldest:
            db.delete(oldest)
            db.commit()

    return DocumentContentResponse(
        document_id=dc.document_id,
        content=dc.content,
        version=dc.version,
        updated_at=dc.updated_at,
    )


@router.get("/{doc_id}/versions", response_model=List[DocumentVersionBrief])
def list_versions(
    doc_id: int,
    skip: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not has_document_permission(db, current_user, doc, PermissionLevel.VIEW):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    versions = (
        db.query(DocumentVersion)
        .filter(DocumentVersion.document_id == doc_id)
        .order_by(DocumentVersion.version.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return [
        DocumentVersionBrief(
            id=v.id,
            version=v.version,
            author=v.author,
            change_summary=v.change_summary,
            created_at=v.created_at,
        )
        for v in versions
    ]


@router.get("/{doc_id}/versions/{version_id}", response_model=DocumentVersionResponse)
def get_version(
    doc_id: int,
    version_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not has_document_permission(db, current_user, doc, PermissionLevel.VIEW):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    ver = db.query(DocumentVersion).filter(
        DocumentVersion.id == version_id,
        DocumentVersion.document_id == doc_id,
    ).first()
    if not ver:
        raise HTTPException(status_code=404, detail="Version not found")
    return DocumentVersionResponse(
        id=ver.id,
        document_id=ver.document_id,
        version=ver.version,
        content=ver.content,
        author=ver.author,
        change_summary=ver.change_summary,
        created_at=ver.created_at,
    )


@router.post("/{doc_id}/versions/{version_id}/restore", response_model=DocumentContentResponse)
async def restore_version(
    doc_id: int,
    version_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not has_document_permission(db, current_user, doc, PermissionLevel.EDIT):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    ver = db.query(DocumentVersion).filter(
        DocumentVersion.id == version_id,
        DocumentVersion.document_id == doc_id,
    ).first()
    if not ver:
        raise HTTPException(status_code=404, detail="Version not found")

    dc = _get_or_create_content(db, doc_id)
    dc.content = ver.content
    dc.version += 1
    db.commit()
    db.refresh(dc)

    with open(doc.file_path, "w", encoding="utf-8") as f:
        f.write(dc.content)

    new_ver = DocumentVersion(
        document_id=doc_id,
        version=dc.version,
        content=dc.content,
        author_id=current_user.id,
        change_summary=f"Restored from version {ver.version}",
    )
    db.add(new_ver)
    db.commit()

    await edit_manager.broadcast(doc_id, {
        "type": "content_updated",
        "content": dc.content,
        "version": dc.version,
        "updated_by": {"id": current_user.id, "username": current_user.username},
    })

    return DocumentContentResponse(
        document_id=dc.document_id,
        content=dc.content,
        version=dc.version,
        updated_at=dc.updated_at,
    )


@router.get("/{doc_id}/editors")
def get_online_editors(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not has_document_permission(db, current_user, doc, PermissionLevel.VIEW):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return edit_manager.get_online_users(doc_id)


async def _get_ws_user(token: str, db: Session) -> Optional[User]:
    from app.config import get_settings
    from jose import JWTError, jwt
    from app.schemas import TokenData

    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        username: str = payload.get("sub")
        if username is None:
            return None
        user = db.query(User).filter(User.username == username).first()
        if user and user.is_active:
            return user
    except JWTError:
        return None
    return None


@router.websocket("/{doc_id}/edit/ws")
async def edit_websocket_endpoint(
    websocket: WebSocket,
    doc_id: int,
    token: Optional[str] = None,
):
    from app.database import SessionLocal

    user_id: Optional[int] = None
    username: Optional[str] = None

    db = SessionLocal()
    try:
        if not token:
            await websocket.close(code=1008, reason="Missing token")
            return
        user = await _get_ws_user(token, db)
        if not user:
            await websocket.close(code=1008, reason="Invalid token")
            return

        doc = db.query(Document).filter(Document.id == doc_id).first()
        if not doc:
            await websocket.close(code=1008, reason="Document not found")
            return
        if not has_document_permission(db, user, doc, PermissionLevel.VIEW):
            await websocket.close(code=1008, reason="No permission")
            return
        if not is_editable(doc.original_filename):
            await websocket.close(code=1008, reason="Document not editable")
            return

        user_id = user.id
        username = user.username
    finally:
        db.close()

    if user_id is None or username is None:
        return

    await edit_manager.connect(websocket, doc_id, user_id, username)

    dirty_content: Optional[str] = None
    dirty_version: Optional[int] = None
    save_lock = asyncio.Lock()
    save_task: Optional[asyncio.Task] = None

    async def _auto_save():
        nonlocal dirty_content, dirty_version, save_task
        await asyncio.sleep(AUTO_SAVE_INTERVAL)
        async with save_lock:
            if dirty_content is not None:
                save_db = SessionLocal()
                try:
                    dc = save_db.query(DocumentContent).filter(
                        DocumentContent.document_id == doc_id
                    ).first()
                    if dc and dc.version == dirty_version:
                        dc.content = dirty_content
                        dc.version += 1
                        save_db.commit()
                        doc_row = save_db.query(Document).filter(Document.id == doc_id).first()
                        if doc_row:
                            with open(doc_row.file_path, "w", encoding="utf-8") as f:
                                f.write(dc.content)
                        dirty_content = None
                        dirty_version = None
                        await edit_manager.broadcast(doc_id, {
                            "type": "auto_saved",
                            "version": dc.version,
                        }, exclude_user_id=user_id)
                except Exception:
                    save_db.rollback()
                finally:
                    save_db.close()
            save_task = None

    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                msg_type = msg.get("type")

                if msg_type == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))

                elif msg_type == "edit":
                    perm_db = SessionLocal()
                    try:
                        perm_user = perm_db.query(User).filter(User.id == user_id).first()
                        perm_doc = perm_db.query(Document).filter(Document.id == doc_id).first()
                        if not perm_user or not perm_doc or not has_document_permission(perm_db, perm_user, perm_doc, PermissionLevel.EDIT):
                            continue
                    finally:
                        perm_db.close()

                    await edit_manager.broadcast(doc_id, {
                        "type": "edit",
                        "operation": msg.get("operation"),
                        "user_id": user_id,
                        "username": username,
                    }, exclude_user_id=user_id)

                    async with save_lock:
                        dirty_content = msg.get("full_content")
                        dirty_version = msg.get("base_version")
                        if save_task is None or save_task.done():
                            save_task = asyncio.create_task(_auto_save())

                elif msg_type == "save":
                    full_content = msg.get("content")
                    base_version = msg.get("base_version")
                    change_summary = msg.get("change_summary")

                    save_db = SessionLocal()
                    try:
                        dc = save_db.query(DocumentContent).filter(
                            DocumentContent.document_id == doc_id
                        ).first()
                        if dc and dc.version == base_version:
                            dc.content = full_content
                            dc.version += 1
                            save_db.commit()

                            doc_row = save_db.query(Document).filter(Document.id == doc_id).first()
                            if doc_row:
                                with open(doc_row.file_path, "w", encoding="utf-8") as f:
                                    f.write(dc.content)

                            ver = DocumentVersion(
                                document_id=doc_id,
                                version=dc.version,
                                content=dc.content,
                                author_id=user_id,
                                change_summary=change_summary,
                            )
                            save_db.add(ver)
                            save_db.commit()

                            async with save_lock:
                                dirty_content = None
                                dirty_version = None

                            await websocket.send_text(json.dumps({
                                "type": "save_ack",
                                "version": dc.version,
                            }))

                            await edit_manager.broadcast(doc_id, {
                                "type": "content_saved",
                                "version": dc.version,
                                "saved_by": {"id": user_id, "username": username},
                            }, exclude_user_id=user_id)
                        else:
                            await websocket.send_text(json.dumps({
                                "type": "save_conflict",
                                "current_version": dc.version if dc else 0,
                            }))
                    except Exception:
                        save_db.rollback()
                    finally:
                        save_db.close()

            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        edit_manager.disconnect(websocket, doc_id)
        await edit_manager.send_user_left(doc_id, user_id, username)
        await edit_manager.broadcast_presence(doc_id)
    except Exception:
        edit_manager.disconnect(websocket, doc_id)
        await edit_manager.send_user_left(doc_id, user_id, username)
        await edit_manager.broadcast_presence(doc_id)
