from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, and_, or_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..core.database import get_db
from ..core.config import settings
from ..core.deps import require_current_user, RequireRole
from ..models.user import User, Role
from ..models.content import ContentEntry, EntryTranslation
from ..models.translation import (
    TranslationTask,
    TranslationTaskHistory,
    TranslationReview,
    TranslationComment,
)
from ..schemas.user import (
    TranslationTaskCreate,
    TranslationTaskUpdate,
    TranslationTaskAssign,
    TranslationTaskStatusUpdate,
    TranslationTaskResponse,
    TranslationTaskDetailResponse,
    TranslationTaskHistoryResponse,
    TranslationReviewCreate,
    TranslationReviewUpdate,
    TranslationReviewResponse,
    TranslationCommentCreate,
    TranslationCommentResponse,
    TranslationTaskStats,
    UserResponse,
)

router = APIRouter()

VALID_STATUSES = [
    "pending",
    "assigned",
    "in_progress",
    "completed",
    "reviewing",
    "approved",
    "rejected",
]


async def add_task_history(
    db: AsyncSession,
    task_id: int,
    user_id: int,
    action: str,
    old_status: Optional[str] = None,
    new_status: Optional[str] = None,
    comment: Optional[str] = None,
    changes: Optional[Dict[str, Any]] = None,
):
    history = TranslationTaskHistory(
        task_id=task_id,
        user_id=user_id,
        action=action,
        old_status=old_status,
        new_status=new_status,
        comment=comment,
        changes=changes or {},
    )
    db.add(history)
    await db.flush()


async def get_source_field_values(
    db: AsyncSession,
    entry_id: int,
    source_language: str,
) -> Dict[str, Any]:
    result = await db.execute(
        select(EntryTranslation).where(
            and_(
                EntryTranslation.entry_id == entry_id,
                EntryTranslation.language_code == source_language,
            )
        )
    )
    translation = result.scalar_one_or_none()
    if not translation:
        return {}
    return translation.field_values or {}


@router.post("/", response_model=List[TranslationTaskResponse], status_code=status.HTTP_201_CREATED)
async def create_translation_tasks(
    data: TranslationTaskCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(RequireRole("admin", "editor")),
):
    entry_result = await db.execute(select(ContentEntry).where(ContentEntry.id == data.entry_id))
    if not entry_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="内容条目不存在")

    if data.source_language not in settings.SUPPORTED_LANGUAGES:
        raise HTTPException(status_code=400, detail=f"不支持的源语言: {data.source_language}")

    target_languages = data.target_languages or [data.target_language]
    target_languages = [lang for lang in target_languages if lang != data.source_language]

    for lang in target_languages:
        if lang not in settings.SUPPORTED_LANGUAGES:
            raise HTTPException(status_code=400, detail=f"不支持的目标语言: {lang}")

    source_field_values = await get_source_field_values(db, data.entry_id, data.source_language)
    created_tasks = []

    for target_lang in target_languages:
        existing = await db.execute(
            select(TranslationTask).where(
                and_(
                    TranslationTask.entry_id == data.entry_id,
                    TranslationTask.source_language == data.source_language,
                    TranslationTask.target_language == target_lang,
                    TranslationTask.status.in_(["pending", "assigned", "in_progress", "reviewing"]),
                )
            )
        )
        if existing.scalar_one_or_none():
            continue

        task = TranslationTask(
            entry_id=data.entry_id,
            source_language=data.source_language,
            target_language=target_lang,
            status="pending",
            priority=data.priority,
            deadline=data.deadline,
            description=data.description,
            source_field_values=source_field_values,
            translated_field_values={},
            created_by_id=current_user.id,
        )
        db.add(task)
        await db.flush()
        await add_task_history(
            db, task.id, current_user.id, "create", new_status="pending",
            comment=f"创建翻译任务: {data.source_language} → {target_lang}"
        )
        created_tasks.append(task)

    await db.commit()

    for task in created_tasks:
        await db.refresh(task)

    return created_tasks


@router.get("/stats", response_model=TranslationTaskStats)
async def get_translation_stats(
    entry_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_current_user),
):
    query = select(func.count(TranslationTask.id), TranslationTask.status)
    if entry_id:
        query = query.where(TranslationTask.entry_id == entry_id)
    query = query.group_by(TranslationTask.status)
    result = await db.execute(query)
    rows = result.all()

    stats = TranslationTaskStats()
    total = 0
    for count, status_val in rows:
        total += count
        if hasattr(stats, status_val):
            setattr(stats, status_val, count)
    stats.total = total
    return stats


@router.get("/", response_model=List[TranslationTaskDetailResponse])
async def list_translation_tasks(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    status: Optional[str] = Query(None),
    entry_id: Optional[int] = Query(None),
    source_language: Optional[str] = Query(None),
    target_language: Optional[str] = Query(None),
    assignee_id: Optional[int] = Query(None),
    created_by_id: Optional[int] = Query(None),
    priority: Optional[str] = Query(None),
    mine_only: bool = Query(False, description="只看分配给我的任务"),
    created_by_me: bool = Query(False, description="只看我创建的任务"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_current_user),
):
    query = (
        select(TranslationTask)
        .options(
            selectinload(TranslationTask.created_by).selectinload(User.roles),
            selectinload(TranslationTask.assignee).selectinload(User.roles),
            selectinload(TranslationTask.reviews).selectinload(TranslationReview.reviewer).selectinload(User.roles),
            selectinload(TranslationTask.comments).selectinload(TranslationComment.user).selectinload(User.roles),
            selectinload(TranslationTask.history).selectinload(TranslationTaskHistory.user).selectinload(User.roles),
        )
        .order_by(TranslationTask.updated_at.desc())
    )

    if status and status in VALID_STATUSES:
        query = query.where(TranslationTask.status == status)
    if entry_id:
        query = query.where(TranslationTask.entry_id == entry_id)
    if source_language:
        query = query.where(TranslationTask.source_language == source_language)
    if target_language:
        query = query.where(TranslationTask.target_language == target_language)
    if assignee_id:
        query = query.where(TranslationTask.assignee_id == assignee_id)
    if created_by_id:
        query = query.where(TranslationTask.created_by_id == created_by_id)
    if priority:
        query = query.where(TranslationTask.priority == priority)
    if mine_only:
        query = query.where(TranslationTask.assignee_id == current_user.id)
    if created_by_me:
        query = query.where(TranslationTask.created_by_id == current_user.id)

    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    return list(result.scalars().all())


@router.get("/{task_id}", response_model=TranslationTaskDetailResponse)
async def get_translation_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_current_user),
):
    result = await db.execute(
        select(TranslationTask)
        .options(
            selectinload(TranslationTask.created_by).selectinload(User.roles),
            selectinload(TranslationTask.assignee).selectinload(User.roles),
            selectinload(TranslationTask.reviews).selectinload(TranslationReview.reviewer).selectinload(User.roles),
            selectinload(TranslationTask.comments).selectinload(TranslationComment.user).selectinload(User.roles),
            selectinload(TranslationTask.history).selectinload(TranslationTaskHistory.user).selectinload(User.roles),
        )
        .where(TranslationTask.id == task_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="翻译任务不存在")

    is_admin = current_user.has_role("admin")
    is_creator = task.created_by_id == current_user.id
    is_assignee = task.assignee_id == current_user.id
    is_editor = current_user.has_role("editor")

    if not (is_admin or is_creator or is_assignee or is_editor):
        raise HTTPException(status_code=403, detail="无权查看此任务")

    return task


@router.put("/{task_id}", response_model=TranslationTaskDetailResponse)
async def update_translation_task(
    task_id: int,
    data: TranslationTaskUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_current_user),
):
    result = await db.execute(
        select(TranslationTask)
        .options(
            selectinload(TranslationTask.created_by).selectinload(User.roles),
            selectinload(TranslationTask.assignee).selectinload(User.roles),
            selectinload(TranslationTask.reviews).selectinload(TranslationReview.reviewer).selectinload(User.roles),
            selectinload(TranslationTask.comments).selectinload(TranslationComment.user).selectinload(User.roles),
            selectinload(TranslationTask.history).selectinload(TranslationTaskHistory.user).selectinload(User.roles),
        )
        .where(TranslationTask.id == task_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="翻译任务不存在")

    is_admin = current_user.has_role("admin")
    is_creator = task.created_by_id == current_user.id
    is_assignee = task.assignee_id == current_user.id
    is_editor = current_user.has_role("editor")

    update_data = data.model_dump(exclude_unset=True)
    changes = {}

    if "translated_field_values" in update_data or "progress" in update_data:
        if not (is_admin or is_assignee):
            raise HTTPException(status_code=403, detail="只有翻译人员或管理员可以更新翻译内容")
        if task.status not in ["assigned", "in_progress", "rejected"]:
            raise HTTPException(status_code=400, detail=f"当前状态 {task.status} 不允许更新翻译内容")

    if "priority" in update_data or "deadline" in update_data or "description" in update_data:
        if not (is_admin or is_creator or is_editor):
            raise HTTPException(status_code=403, detail="无权修改任务属性")

    for key, value in update_data.items():
        old_value = getattr(task, key)
        if old_value != value:
            changes[key] = {"old": str(old_value), "new": str(value)}
            setattr(task, key, value)

    if "translated_field_values" in update_data:
        if task.status == "assigned":
            task.status = "in_progress"
            task.started_at = task.started_at or datetime.utcnow()
            changes["status"] = {"old": "assigned", "new": "in_progress"}

    await add_task_history(
        db, task_id, current_user.id, "update",
        changes=changes,
        comment="更新任务信息" if changes else None,
    )

    await db.commit()
    await db.refresh(task)
    return task


@router.post("/{task_id}/assign", response_model=TranslationTaskDetailResponse)
async def assign_translation_task(
    task_id: int,
    data: TranslationTaskAssign,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(RequireRole("admin", "editor")),
):
    result = await db.execute(
        select(TranslationTask)
        .options(
            selectinload(TranslationTask.created_by).selectinload(User.roles),
            selectinload(TranslationTask.assignee).selectinload(User.roles),
            selectinload(TranslationTask.reviews).selectinload(TranslationReview.reviewer).selectinload(User.roles),
            selectinload(TranslationTask.comments).selectinload(TranslationComment.user).selectinload(User.roles),
            selectinload(TranslationTask.history).selectinload(TranslationTaskHistory.user).selectinload(User.roles),
        )
        .where(TranslationTask.id == task_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="翻译任务不存在")

    if task.status not in ["pending", "assigned", "rejected"]:
        raise HTTPException(
            status_code=400,
            detail=f"当前状态 {task.status} 不允许重新分配",
        )

    user_result = await db.execute(
        select(User)
        .options(selectinload(User.roles))
        .where(User.id == data.assignee_id, User.is_active == True)
    )
    assignee = user_result.scalar_one_or_none()
    if not assignee:
        raise HTTPException(status_code=404, detail="指定的翻译人员不存在或已被禁用")

    if not (assignee.has_role("translator") or assignee.has_role("admin")):
        raise HTTPException(status_code=400, detail="该用户没有翻译权限")

    old_status = task.status
    old_assignee = task.assignee_id
    task.assignee_id = data.assignee_id
    task.status = "assigned"
    task.assigned_at = datetime.utcnow()

    await add_task_history(
        db, task_id, current_user.id, "assign",
        old_status=old_status, new_status="assigned",
        comment=f"分配给翻译人员: {assignee.full_name or assignee.username}",
        changes={"assignee_id": {"old": str(old_assignee), "new": str(data.assignee_id)}},
    )

    await db.commit()
    await db.refresh(task)
    return task


@router.post("/{task_id}/status", response_model=TranslationTaskDetailResponse)
async def update_task_status(
    task_id: int,
    data: TranslationTaskStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_current_user),
):
    if data.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"无效的状态: {data.status}")

    result = await db.execute(
        select(TranslationTask)
        .options(
            selectinload(TranslationTask.created_by).selectinload(User.roles),
            selectinload(TranslationTask.assignee).selectinload(User.roles),
            selectinload(TranslationTask.reviews).selectinload(TranslationReview.reviewer).selectinload(User.roles),
            selectinload(TranslationTask.comments).selectinload(TranslationComment.user).selectinload(User.roles),
            selectinload(TranslationTask.history).selectinload(TranslationTaskHistory.user).selectinload(User.roles),
        )
        .where(TranslationTask.id == task_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="翻译任务不存在")

    is_admin = current_user.has_role("admin")
    is_creator = task.created_by_id == current_user.id
    is_assignee = task.assignee_id == current_user.id
    is_reviewer = current_user.has_role("reviewer")
    is_editor = current_user.has_role("editor")

    old_status = task.status
    new_status = data.status

    if new_status in ["in_progress"]:
        if not (is_admin or is_assignee):
            raise HTTPException(status_code=403, detail="只有翻译人员可以开始翻译")
        if old_status not in ["assigned", "rejected"]:
            raise HTTPException(status_code=400, detail=f"无法从 {old_status} 转为 {new_status}")
        task.started_at = task.started_at or datetime.utcnow()

    elif new_status == "completed":
        if not (is_admin or is_assignee):
            raise HTTPException(status_code=403, detail="只有翻译人员可以标记完成")
        if old_status not in ["in_progress"]:
            raise HTTPException(status_code=400, detail=f"无法从 {old_status} 转为 {new_status}")
        task.completed_at = datetime.utcnow()

    elif new_status == "reviewing":
        if not (is_admin or is_creator or is_editor):
            raise HTTPException(status_code=403, detail="只有创建者或编辑可以提交审校")
        if old_status not in ["completed"]:
            raise HTTPException(status_code=400, detail=f"无法从 {old_status} 转为 {new_status}")

    elif new_status == "approved":
        if not (is_admin or is_reviewer or is_creator or is_editor):
            raise HTTPException(status_code=403, detail="没有审校权限")
        if old_status not in ["reviewing", "rejected"]:
            raise HTTPException(status_code=400, detail=f"无法从 {old_status} 转为 {new_status}")
        task.reviewed_at = datetime.utcnow()

        review = TranslationReview(
            task_id=task_id,
            reviewer_id=current_user.id,
            status="approved",
            comment=data.comment or "审校通过",
            reviewed_field_values=task.translated_field_values,
        )
        db.add(review)

        entry_result = await db.execute(
            select(EntryTranslation).where(
                and_(
                    EntryTranslation.entry_id == task.entry_id,
                    EntryTranslation.language_code == task.target_language,
                )
            )
        )
        translation_entry = entry_result.scalar_one_or_none()
        if translation_entry:
            translation_entry.field_values = task.translated_field_values
        else:
            new_translation = EntryTranslation(
                entry_id=task.entry_id,
                language_code=task.target_language,
                field_values=task.translated_field_values,
            )
            db.add(new_translation)

    elif new_status == "rejected":
        if not (is_admin or is_reviewer or is_creator or is_editor):
            raise HTTPException(status_code=403, detail="没有审校权限")
        if old_status not in ["reviewing"]:
            raise HTTPException(status_code=400, detail=f"无法从 {old_status} 转为 {new_status}")
        task.reviewed_at = datetime.utcnow()

        review = TranslationReview(
            task_id=task_id,
            reviewer_id=current_user.id,
            status="rejected",
            comment=data.comment or "审校驳回",
            reviewed_field_values=task.translated_field_values,
        )
        db.add(review)

    elif new_status == "assigned":
        if not (is_admin or is_creator or is_editor):
            raise HTTPException(status_code=403, detail="无权重新分配")
        if old_status not in ["pending", "rejected"]:
            raise HTTPException(status_code=400, detail=f"无法从 {old_status} 转为 {new_status}")
        task.assigned_at = task.assigned_at or datetime.utcnow()

    elif new_status == "pending":
        if not is_admin:
            raise HTTPException(status_code=403, detail="只有管理员可以重置为待分配")

    task.status = new_status

    await add_task_history(
        db, task_id, current_user.id, "status_change",
        old_status=old_status, new_status=new_status,
        comment=data.comment,
    )

    await db.commit()
    await db.refresh(task)
    return task


@router.post("/{task_id}/comments", response_model=TranslationCommentResponse, status_code=status.HTTP_201_CREATED)
async def add_task_comment(
    task_id: int,
    data: TranslationCommentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_current_user),
):
    result = await db.execute(select(TranslationTask).where(TranslationTask.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="翻译任务不存在")

    comment = TranslationComment(
        task_id=task_id,
        user_id=current_user.id,
        content=data.content,
        field_name=data.field_name,
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    return comment


@router.get("/{task_id}/comments", response_model=List[TranslationCommentResponse])
async def list_task_comments(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_current_user),
):
    result = await db.execute(
        select(TranslationComment)
        .options(selectinload(TranslationComment.user))
        .where(TranslationComment.task_id == task_id)
        .order_by(TranslationComment.created_at.desc())
    )
    return list(result.scalars().all())


@router.get("/{task_id}/history", response_model=List[TranslationTaskHistoryResponse])
async def list_task_history(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_current_user),
):
    result = await db.execute(
        select(TranslationTaskHistory)
        .options(selectinload(TranslationTaskHistory.user))
        .where(TranslationTaskHistory.task_id == task_id)
        .order_by(TranslationTaskHistory.created_at.asc())
    )
    return list(result.scalars().all())


@router.get("/{task_id}/reviews", response_model=List[TranslationReviewResponse])
async def list_task_reviews(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_current_user),
):
    result = await db.execute(
        select(TranslationReview)
        .options(selectinload(TranslationReview.reviewer))
        .where(TranslationReview.task_id == task_id)
        .order_by(TranslationReview.created_at.desc())
    )
    return list(result.scalars().all())


@router.post("/reviews", response_model=TranslationReviewResponse, status_code=status.HTTP_201_CREATED)
async def create_review(
    data: TranslationReviewCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(RequireRole("admin", "reviewer", "editor")),
):
    task_result = await db.execute(select(TranslationTask).where(TranslationTask.id == data.task_id))
    task = task_result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="翻译任务不存在")

    if data.status not in ["pending", "approved", "rejected"]:
        raise HTTPException(status_code=400, detail=f"无效的审校状态: {data.status}")

    review = TranslationReview(
        task_id=data.task_id,
        reviewer_id=data.reviewer_id,
        status=data.status,
        comment=data.comment,
        reviewed_field_values=data.reviewed_field_values,
    )
    db.add(review)
    await db.commit()
    await db.refresh(review)
    return review


@router.put("/reviews/{review_id}", response_model=TranslationReviewResponse)
async def update_review(
    review_id: int,
    data: TranslationReviewUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_current_user),
):
    result = await db.execute(
        select(TranslationReview)
        .options(selectinload(TranslationReview.reviewer))
        .where(TranslationReview.id == review_id)
    )
    review = result.scalar_one_or_none()
    if not review:
        raise HTTPException(status_code=404, detail="审校记录不存在")

    if not (current_user.has_role("admin") or review.reviewer_id == current_user.id):
        raise HTTPException(status_code=403, detail="无权修改此审校记录")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(review, key, value)

    await db.commit()
    await db.refresh(review)
    return review


@router.get("/reviews/pending", response_model=List[TranslationTaskDetailResponse])
async def list_pending_reviews(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(RequireRole("admin", "reviewer", "editor")),
):
    result = await db.execute(
        select(TranslationTask)
        .options(
            selectinload(TranslationTask.created_by).selectinload(User.roles),
            selectinload(TranslationTask.assignee).selectinload(User.roles),
            selectinload(TranslationTask.reviews).selectinload(TranslationReview.reviewer).selectinload(User.roles),
            selectinload(TranslationTask.comments).selectinload(TranslationComment.user).selectinload(User.roles),
            selectinload(TranslationTask.history).selectinload(TranslationTaskHistory.user).selectinload(User.roles),
        )
        .where(TranslationTask.status == "reviewing")
        .order_by(TranslationTask.updated_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return list(result.scalars().all())
