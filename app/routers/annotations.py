import json
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    User,
    Document,
    DocumentPermission,
    PermissionLevel,
    Annotation,
    AnnotationReply,
)
from app.schemas import (
    AnnotationCreate,
    AnnotationUpdate,
    AnnotationResponse,
    AnnotationReplyCreate,
    AnnotationReplyUpdate,
    AnnotationReplyResponse,
)
from app.security import (
    get_current_active_user,
    has_document_permission,
)

router = APIRouter(prefix="/api/documents", tags=["annotations"])


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[int, list[tuple[WebSocket, int]]] = {}

    async def connect(self, websocket: WebSocket, doc_id: int, user_id: int):
        await websocket.accept()
        if doc_id not in self.active_connections:
            self.active_connections[doc_id] = []
        self.active_connections[doc_id].append((websocket, user_id))

    def disconnect(self, websocket: WebSocket, doc_id: int):
        if doc_id in self.active_connections:
            self.active_connections[doc_id] = [
                (ws, uid) for ws, uid in self.active_connections[doc_id] if ws != websocket
            ]
            if not self.active_connections[doc_id]:
                del self.active_connections[doc_id]

    async def broadcast(self, doc_id: int, message: dict, exclude_user_id: Optional[int] = None):
        if doc_id in self.active_connections:
            for connection, user_id in self.active_connections[doc_id]:
                if exclude_user_id and user_id == exclude_user_id:
                    continue
                try:
                    await connection.send_text(json.dumps(message, default=str))
                except Exception:
                    pass


manager = ConnectionManager()


def _annotation_to_response(ann: Annotation) -> AnnotationResponse:
    return AnnotationResponse(
        id=ann.id,
        document_id=ann.document_id,
        page=ann.page,
        position_x=ann.position_x,
        position_y=ann.position_y,
        selected_text=ann.selected_text,
        content=ann.content,
        color=ann.color,
        is_resolved=ann.is_resolved,
        author=ann.author,
        created_at=ann.created_at,
        updated_at=ann.updated_at,
        replies=[
            AnnotationReplyResponse(
                id=r.id,
                annotation_id=r.annotation_id,
                content=r.content,
                author=r.author,
                created_at=r.created_at,
                updated_at=r.updated_at,
            )
            for r in ann.replies
        ],
    )


@router.get("/{doc_id}/annotations", response_model=List[AnnotationResponse])
def list_annotations(
    doc_id: int,
    page: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not has_document_permission(db, current_user, doc, PermissionLevel.VIEW):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    query = db.query(Annotation).filter(Annotation.document_id == doc_id)
    if page is not None:
        query = query.filter(Annotation.page == page)
    annotations = query.order_by(Annotation.created_at.desc()).all()
    return [_annotation_to_response(ann) for ann in annotations]


@router.post("/{doc_id}/annotations", response_model=AnnotationResponse, status_code=status.HTTP_201_CREATED)
async def create_annotation(
    doc_id: int,
    data: AnnotationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not has_document_permission(db, current_user, doc, PermissionLevel.EDIT):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    if doc_id != data.document_id:
        raise HTTPException(status_code=400, detail="Document ID mismatch")
    if not data.content or not data.content.strip():
        raise HTTPException(status_code=400, detail="Content cannot be empty")

    ann = Annotation(
        document_id=data.document_id,
        author_id=current_user.id,
        page=data.page,
        position_x=data.position_x,
        position_y=data.position_y,
        selected_text=data.selected_text,
        content=data.content.strip(),
        color=data.color or "#fef3c7",
        is_resolved=False,
    )
    db.add(ann)
    db.commit()
    db.refresh(ann)

    response = _annotation_to_response(ann)
    await manager.broadcast(
        doc_id,
        {
            "type": "annotation_created",
            "data": response.model_dump(mode="json"),
        },
        exclude_user_id=current_user.id,
    )
    return response


@router.put("/{doc_id}/annotations/{ann_id}", response_model=AnnotationResponse)
async def update_annotation(
    doc_id: int,
    ann_id: int,
    data: AnnotationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    ann = db.query(Annotation).filter(
        Annotation.id == ann_id, Annotation.document_id == doc_id
    ).first()
    if not ann:
        raise HTTPException(status_code=404, detail="Annotation not found")
    if ann.author_id != current_user.id and not has_document_permission(
        db, current_user, doc, PermissionLevel.EDIT
    ):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    update_data = data.model_dump(exclude_unset=True)
    if "content" in update_data:
        if not update_data["content"] or not update_data["content"].strip():
            raise HTTPException(status_code=400, detail="Content cannot be empty")
        update_data["content"] = update_data["content"].strip()
    for key, value in update_data.items():
        setattr(ann, key, value)
    db.commit()
    db.refresh(ann)

    response = _annotation_to_response(ann)
    await manager.broadcast(
        doc_id,
        {
            "type": "annotation_updated",
            "data": response.model_dump(mode="json"),
        },
        exclude_user_id=current_user.id,
    )
    return response


@router.delete("/{doc_id}/annotations/{ann_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_annotation(
    doc_id: int,
    ann_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    ann = db.query(Annotation).filter(
        Annotation.id == ann_id, Annotation.document_id == doc_id
    ).first()
    if not ann:
        raise HTTPException(status_code=404, detail="Annotation not found")
    if ann.author_id != current_user.id and not has_document_permission(
        db, current_user, doc, PermissionLevel.EDIT
    ):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    db.delete(ann)
    db.commit()

    await manager.broadcast(
        doc_id,
        {
            "type": "annotation_deleted",
            "data": {"id": ann_id},
        },
        exclude_user_id=current_user.id,
    )
    return None


@router.post(
    "/{doc_id}/annotations/{ann_id}/replies",
    response_model=AnnotationReplyResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_reply(
    doc_id: int,
    ann_id: int,
    data: AnnotationReplyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not has_document_permission(db, current_user, doc, PermissionLevel.VIEW):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    ann = db.query(Annotation).filter(
        Annotation.id == ann_id, Annotation.document_id == doc_id
    ).first()
    if not ann:
        raise HTTPException(status_code=404, detail="Annotation not found")
    if not data.content or not data.content.strip():
        raise HTTPException(status_code=400, detail="Content cannot be empty")

    reply = AnnotationReply(
        annotation_id=ann_id,
        author_id=current_user.id,
        content=data.content.strip(),
    )
    db.add(reply)
    db.commit()
    db.refresh(reply)

    response = AnnotationReplyResponse(
        id=reply.id,
        annotation_id=reply.annotation_id,
        content=reply.content,
        author=reply.author,
        created_at=reply.created_at,
        updated_at=reply.updated_at,
    )
    await manager.broadcast(
        doc_id,
        {
            "type": "reply_created",
            "data": {"annotation_id": ann_id, "reply": response.model_dump(mode="json")},
        },
        exclude_user_id=current_user.id,
    )
    return response


@router.put("/{doc_id}/annotations/{ann_id}/replies/{reply_id}", response_model=AnnotationReplyResponse)
async def update_reply(
    doc_id: int,
    ann_id: int,
    reply_id: int,
    data: AnnotationReplyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    reply = db.query(AnnotationReply).filter(
        AnnotationReply.id == reply_id, AnnotationReply.annotation_id == ann_id
    ).first()
    if not reply:
        raise HTTPException(status_code=404, detail="Reply not found")
    if reply.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    update_data = data.model_dump(exclude_unset=True)
    if "content" in update_data:
        if not update_data["content"] or not update_data["content"].strip():
            raise HTTPException(status_code=400, detail="Content cannot be empty")
        update_data["content"] = update_data["content"].strip()
    for key, value in update_data.items():
        setattr(reply, key, value)
    db.commit()
    db.refresh(reply)

    response = AnnotationReplyResponse(
        id=reply.id,
        annotation_id=reply.annotation_id,
        content=reply.content,
        author=reply.author,
        created_at=reply.created_at,
        updated_at=reply.updated_at,
    )
    await manager.broadcast(
        doc_id,
        {
            "type": "reply_updated",
            "data": {"annotation_id": ann_id, "reply": response.model_dump(mode="json")},
        },
        exclude_user_id=current_user.id,
    )
    return response


@router.delete(
    "/{doc_id}/annotations/{ann_id}/replies/{reply_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_reply(
    doc_id: int,
    ann_id: int,
    reply_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    reply = db.query(AnnotationReply).filter(
        AnnotationReply.id == reply_id, AnnotationReply.annotation_id == ann_id
    ).first()
    if not reply:
        raise HTTPException(status_code=404, detail="Reply not found")
    if reply.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    db.delete(reply)
    db.commit()

    await manager.broadcast(
        doc_id,
        {
            "type": "reply_deleted",
            "data": {"annotation_id": ann_id, "id": reply_id},
        },
        exclude_user_id=current_user.id,
    )
    return None


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


@router.websocket("/{doc_id}/annotations/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    doc_id: int,
    token: Optional[str] = None,
):
    from app.database import SessionLocal

    user_id: Optional[int] = None

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
        if not doc or not has_document_permission(db, user, doc, PermissionLevel.VIEW):
            await websocket.close(code=1008, reason="No permission")
            return

        user_id = user.id
    finally:
        db.close()

    if user_id is None:
        return

    await manager.connect(websocket, doc_id, user_id)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
            except json.JSONDecodeError:
                pass
    except Exception:
        manager.disconnect(websocket, doc_id)
        raise
