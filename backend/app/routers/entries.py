from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..core.database import get_db
from ..core.config import settings
from ..models.content import ContentEntry, EntryTranslation, ContentType, Field
from ..schemas.content import (
    ContentEntryCreate,
    ContentEntryUpdate,
    ContentEntryResponse,
    EntryWithTranslationsResponse,
    EntryTranslationCreate,
    EntryTranslationUpdate,
    EntryTranslationResponse,
)

router = APIRouter()


@router.get("/check-slug")
async def check_slug_availability(
    slug: str = Query(..., description="Slug to check"),
    exclude_entry_id: Optional[int] = Query(None, description="Exclude this entry ID from check"),
    db: AsyncSession = Depends(get_db),
):
    query = select(EntryTranslation).where(EntryTranslation.slug == slug)
    if exclude_entry_id:
        query = query.where(EntryTranslation.entry_id != exclude_entry_id)
    result = await db.execute(query)
    existing = result.scalar_one_or_none()
    return {
        "slug": slug,
        "available": existing is None,
        "existing_entry_id": existing.entry_id if existing else None,
    }


@router.post("/", response_model=EntryWithTranslationsResponse, status_code=status.HTTP_201_CREATED)
async def create_entry(
    data: ContentEntryCreate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ContentType).where(ContentType.id == data.content_type_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Content type not found")

    for trans_data in data.translations:
        if trans_data.slug:
            slug_result = await db.execute(
                select(EntryTranslation).where(EntryTranslation.slug == trans_data.slug)
            )
            if slug_result.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Slug '{trans_data.slug}' is already in use",
                )

    entry = ContentEntry(
        content_type_id=data.content_type_id,
        status=data.status,
    )
    db.add(entry)
    await db.flush()

    for trans_data in data.translations:
        if trans_data.language_code not in settings.SUPPORTED_LANGUAGES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Language '{trans_data.language_code}' is not supported",
            )
        translation = EntryTranslation(
            entry_id=entry.id,
            language_code=trans_data.language_code,
            field_values=trans_data.field_values or {},
            title=trans_data.title,
            slug=trans_data.slug,
            is_published=trans_data.is_published,
        )
        db.add(translation)

    await db.commit()
    await db.refresh(entry)
    return entry


@router.get("/", response_model=List[EntryWithTranslationsResponse])
async def list_entries(
    content_type_id: Optional[int] = Query(None, description="Filter by content type ID"),
    content_type_slug: Optional[str] = Query(None, description="Filter by content type slug"),
    status: Optional[str] = Query(None, description="Filter by status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(ContentEntry)
        .options(selectinload(ContentEntry.translations))
        .order_by(ContentEntry.updated_at.desc())
    )

    if content_type_slug:
        ct_result = await db.execute(select(ContentType).where(ContentType.slug == content_type_slug))
        ct = ct_result.scalar_one_or_none()
        if not ct:
            raise HTTPException(status_code=404, detail="Content type not found")
        query = query.where(ContentEntry.content_type_id == ct.id)
    elif content_type_id:
        query = query.where(ContentEntry.content_type_id == content_type_id)

    if status:
        query = query.where(ContentEntry.status == status)

    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    return list(result.scalars().all())


@router.get("/{entry_id}", response_model=EntryWithTranslationsResponse)
async def get_entry(
    entry_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ContentEntry)
        .options(selectinload(ContentEntry.translations))
        .where(ContentEntry.id == entry_id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    return entry


@router.put("/{entry_id}", response_model=EntryWithTranslationsResponse)
async def update_entry(
    entry_id: int,
    data: ContentEntryUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ContentEntry)
        .options(selectinload(ContentEntry.translations))
        .where(ContentEntry.id == entry_id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(entry, key, value)

    await db.commit()
    await db.refresh(entry)
    return entry


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_entry(
    entry_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ContentEntry).where(ContentEntry.id == entry_id))
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    await db.delete(entry)
    await db.commit()
    return None


@router.post("/{entry_id}/publish", response_model=EntryWithTranslationsResponse)
async def publish_entry(
    entry_id: int,
    language_code: Optional[str] = Query(None, description="Publish specific language, or all if not specified"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ContentEntry)
        .options(selectinload(ContentEntry.translations))
        .where(ContentEntry.id == entry_id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    for translation in entry.translations:
        if language_code is None or translation.language_code == language_code:
            translation.is_published = True

    entry.status = "published"
    if not entry.published_at:
        entry.published_at = datetime.utcnow()

    await db.commit()
    await db.refresh(entry)
    return entry


@router.post("/{entry_id}/unpublish", response_model=EntryWithTranslationsResponse)
async def unpublish_entry(
    entry_id: int,
    language_code: Optional[str] = Query(None, description="Unpublish specific language, or all if not specified"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ContentEntry)
        .options(selectinload(ContentEntry.translations))
        .where(ContentEntry.id == entry_id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    for translation in entry.translations:
        if language_code is None or translation.language_code == language_code:
            translation.is_published = False

    has_published = any(t.is_published for t in entry.translations)
    if not has_published:
        entry.status = "draft"

    await db.commit()
    await db.refresh(entry)
    return entry


@router.get("/{entry_id}/translations", response_model=List[EntryTranslationResponse])
async def list_entry_translations(
    entry_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ContentEntry)
        .options(selectinload(ContentEntry.translations))
        .where(ContentEntry.id == entry_id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    return entry.translations


@router.get("/{entry_id}/translations/{language_code}", response_model=EntryTranslationResponse)
async def get_entry_translation(
    entry_id: int,
    language_code: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(EntryTranslation).where(
            and_(
                EntryTranslation.entry_id == entry_id,
                EntryTranslation.language_code == language_code,
            )
        )
    )
    translation = result.scalar_one_or_none()
    if not translation:
        raise HTTPException(status_code=404, detail="Translation not found")
    return translation


@router.post("/{entry_id}/translations", response_model=EntryTranslationResponse, status_code=status.HTTP_201_CREATED)
async def create_entry_translation(
    entry_id: int,
    data: EntryTranslationCreate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ContentEntry).where(ContentEntry.id == entry_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Entry not found")

    if data.language_code not in settings.SUPPORTED_LANGUAGES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Language '{data.language_code}' is not supported",
        )

    existing = await db.execute(select(EntryTranslation).where(
        and_(
            EntryTranslation.entry_id == entry_id,
            EntryTranslation.language_code == data.language_code,
        )
    ))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Translation for language '{data.language_code}' already exists",
        )

    if data.slug:
        slug_result = await db.execute(
            select(EntryTranslation).where(EntryTranslation.slug == data.slug)
        )
        if slug_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Slug '{data.slug}' is already in use",
            )

    translation = EntryTranslation(entry_id=entry_id, **data.model_dump())
    db.add(translation)
    await db.commit()
    await db.refresh(translation)
    return translation


@router.put("/{entry_id}/translations/{language_code}", response_model=EntryTranslationResponse)
async def update_entry_translation(
    entry_id: int,
    language_code: str,
    data: EntryTranslationUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(EntryTranslation).where(
        and_(
            EntryTranslation.entry_id == entry_id,
            EntryTranslation.language_code == language_code,
        )
    ))
    translation = result.scalar_one_or_none()
    if not translation:
        raise HTTPException(status_code=404, detail="Translation not found")

    update_data = data.model_dump(exclude_unset=True)

    if "slug" in update_data and update_data["slug"] and update_data["slug"] != translation.slug:
        slug_result = await db.execute(
            select(EntryTranslation).where(EntryTranslation.slug == update_data["slug"])
        )
        if slug_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Slug '{update_data['slug']}' is already in use",
            )

    for key, value in update_data.items():
        setattr(translation, key, value)

    await db.commit()
    await db.refresh(translation)
    return translation


@router.delete("/{entry_id}/translations/{language_code}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_entry_translation(
    entry_id: int,
    language_code: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(EntryTranslation).where(
        and_(
            EntryTranslation.entry_id == entry_id,
            EntryTranslation.language_code == language_code,
        )
    ))
    translation = result.scalar_one_or_none()
    if not translation:
        raise HTTPException(status_code=404, detail="Translation not found")

    await db.delete(translation)
    await db.commit()
    return None
