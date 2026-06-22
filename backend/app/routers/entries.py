from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, and_, func, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..core.database import get_db
from ..core.config import settings
from ..models.content import ContentEntry, EntryTranslation, ContentType, Field, ContentVersion
from ..schemas.content import (
    ContentEntryCreate,
    ContentEntryUpdate,
    ContentEntryResponse,
    EntryWithTranslationsResponse,
    EntryTranslationCreate,
    EntryTranslationUpdate,
    EntryTranslationResponse,
    ContentVersionResponse,
    PublishRequest,
    RollbackRequest,
    DraftPreviewResponse,
)

router = APIRouter()


def _has_draft_changes(translation: EntryTranslation) -> bool:
    if not translation.published_version:
        return bool(translation.draft_title or translation.draft_field_values)
    pub = translation.published_version
    if translation.draft_title != pub.title:
        return True
    if translation.draft_slug != pub.slug:
        return True
    if translation.draft_field_values != (pub.field_values or {}):
        return True
    return False


@router.get("/check-slug")
async def check_slug_availability(
    slug: str = Query(..., description="Slug to check"),
    exclude_entry_id: Optional[int] = Query(None, description="Exclude this entry ID from check"),
    db: AsyncSession = Depends(get_db),
):
    query = select(EntryTranslation).where(EntryTranslation.draft_slug == slug)
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
        if trans_data.draft_slug:
            slug_result = await db.execute(
                select(EntryTranslation).where(EntryTranslation.draft_slug == trans_data.draft_slug)
            )
            if slug_result.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Slug '{trans_data.draft_slug}' is already in use",
                )

    has_any_published = any(t.is_published for t in data.translations)
    entry_status = data.status if data.status else ("published" if has_any_published else "draft")

    entry = ContentEntry(
        content_type_id=data.content_type_id,
        status=entry_status,
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
            draft_field_values=trans_data.draft_field_values or {},
            draft_title=trans_data.draft_title,
            draft_slug=trans_data.draft_slug,
            is_published=trans_data.is_published or False,
        )
        db.add(translation)

    await db.commit()
    await db.refresh(entry)

    result = await db.execute(
        select(ContentEntry)
        .options(selectinload(ContentEntry.translations).selectinload(EntryTranslation.published_version))
        .where(ContentEntry.id == entry.id)
    )
    return result.scalar_one()


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
        .options(selectinload(ContentEntry.translations).selectinload(EntryTranslation.published_version))
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
        .options(selectinload(ContentEntry.translations).selectinload(EntryTranslation.published_version))
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
        .options(selectinload(ContentEntry.translations).selectinload(EntryTranslation.published_version))
        .where(ContentEntry.id == entry_id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(entry, key, value)

    await db.commit()

    result = await db.execute(
        select(ContentEntry)
        .options(selectinload(ContentEntry.translations).selectinload(EntryTranslation.published_version))
        .where(ContentEntry.id == entry_id)
    )
    return result.scalar_one()


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
    data: Optional[PublishRequest] = None,
    db: AsyncSession = Depends(get_db),
):
    if data is None:
        data = PublishRequest()

    result = await db.execute(
        select(ContentEntry)
        .options(selectinload(ContentEntry.translations).selectinload(EntryTranslation.published_version))
        .where(ContentEntry.id == entry_id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    new_version_number = entry.current_version_number + 1

    languages_to_publish = []
    for translation in entry.translations:
        if data.language_code is not None and translation.language_code != data.language_code:
            continue
        if not translation.draft_title:
            continue
        languages_to_publish.append(translation.language_code)

    if languages_to_publish:
        await db.execute(
            update(ContentVersion)
            .where(
                and_(
                    ContentVersion.entry_id == entry_id,
                    ContentVersion.language_code.in_(languages_to_publish),
                    ContentVersion.is_published == True,
                )
            )
            .values(is_published=False)
        )

    for translation in entry.translations:
        if data.language_code is not None and translation.language_code != data.language_code:
            continue

        if not translation.draft_title:
            continue

        existing_ver = await db.execute(
            select(ContentVersion).where(
                and_(
                    ContentVersion.entry_id == entry_id,
                    ContentVersion.language_code == translation.language_code,
                    ContentVersion.version_number == new_version_number,
                )
            )
        )
        if existing_ver.scalar_one_or_none():
            continue

        version = ContentVersion(
            entry_id=entry_id,
            language_code=translation.language_code,
            version_number=new_version_number,
            field_values=translation.draft_field_values or {},
            title=translation.draft_title,
            slug=translation.draft_slug,
            is_published=True,
            change_summary=data.change_summary,
        )
        db.add(version)
        await db.flush()

        translation.is_published = True
        translation.published_version_id = version.id

    entry.current_version_number = new_version_number
    entry.status = "published"
    if not entry.published_at:
        entry.published_at = datetime.utcnow()

    await db.commit()
    await db.refresh(entry)

    result = await db.execute(
        select(ContentEntry)
        .options(selectinload(ContentEntry.translations).selectinload(EntryTranslation.published_version))
        .where(ContentEntry.id == entry_id)
    )
    return result.scalar_one()


@router.post("/{entry_id}/unpublish", response_model=EntryWithTranslationsResponse)
async def unpublish_entry(
    entry_id: int,
    language_code: Optional[str] = Query(None, description="Unpublish specific language, or all if not specified"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ContentEntry)
        .options(selectinload(ContentEntry.translations).selectinload(EntryTranslation.published_version))
        .where(ContentEntry.id == entry_id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    for translation in entry.translations:
        if language_code is None or translation.language_code == language_code:
            translation.is_published = False

    unpublish_langs = []
    if language_code:
        unpublish_langs = [language_code]
    else:
        unpublish_langs = [t.language_code for t in entry.translations]

    if unpublish_langs:
        await db.execute(
            update(ContentVersion)
            .where(
                and_(
                    ContentVersion.entry_id == entry_id,
                    ContentVersion.language_code.in_(unpublish_langs),
                    ContentVersion.is_published == True,
                )
            )
            .values(is_published=False)
        )

    has_published = any(t.is_published for t in entry.translations)
    if not has_published:
        entry.status = "draft"

    await db.commit()
    await db.refresh(entry)

    result = await db.execute(
        select(ContentEntry)
        .options(selectinload(ContentEntry.translations).selectinload(EntryTranslation.published_version))
        .where(ContentEntry.id == entry_id)
    )
    return result.scalar_one()


@router.get("/{entry_id}/translations", response_model=List[EntryTranslationResponse])
async def list_entry_translations(
    entry_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ContentEntry)
        .options(selectinload(ContentEntry.translations).selectinload(EntryTranslation.published_version))
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
        select(EntryTranslation)
        .options(selectinload(EntryTranslation.published_version))
        .where(
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
    entry_result = await db.execute(select(ContentEntry).where(ContentEntry.id == entry_id))
    entry = entry_result.scalar_one_or_none()
    if not entry:
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

    if data.draft_slug:
        slug_result = await db.execute(
            select(EntryTranslation).where(EntryTranslation.draft_slug == data.draft_slug)
        )
        if slug_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Slug '{data.draft_slug}' is already in use",
            )

    translation = EntryTranslation(entry_id=entry_id, **data.model_dump())
    db.add(translation)

    if entry.current_version_number == 0 and entry.status != "draft":
        entry.status = "draft"

    await db.commit()
    await db.refresh(translation)

    result = await db.execute(
        select(EntryTranslation)
        .options(selectinload(EntryTranslation.published_version))
        .where(EntryTranslation.id == translation.id)
    )
    return result.scalar_one()


@router.put("/{entry_id}/translations/{language_code}", response_model=EntryTranslationResponse)
async def update_entry_translation(
    entry_id: int,
    language_code: str,
    data: EntryTranslationUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(EntryTranslation)
        .options(selectinload(EntryTranslation.published_version))
        .where(
            and_(
                EntryTranslation.entry_id == entry_id,
                EntryTranslation.language_code == language_code,
            )
        )
    )
    translation = result.scalar_one_or_none()
    if not translation:
        raise HTTPException(status_code=404, detail="Translation not found")

    update_data = data.model_dump(exclude_unset=True)

    if "draft_slug" in update_data and update_data["draft_slug"] and update_data["draft_slug"] != translation.draft_slug:
        slug_result = await db.execute(
            select(EntryTranslation).where(EntryTranslation.draft_slug == update_data["draft_slug"])
        )
        if slug_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Slug '{update_data['draft_slug']}' is already in use",
            )

    for key, value in update_data.items():
        setattr(translation, key, value)

    entry_result = await db.execute(select(ContentEntry).where(ContentEntry.id == entry_id))
    entry = entry_result.scalar_one_or_none()
    if entry and entry.current_version_number == 0 and entry.status != "draft":
        entry.status = "draft"

    await db.commit()

    result = await db.execute(
        select(EntryTranslation)
        .options(selectinload(EntryTranslation.published_version))
        .where(EntryTranslation.id == translation.id)
    )
    return result.scalar_one()


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


@router.get("/{entry_id}/versions", response_model=List[ContentVersionResponse])
async def list_entry_versions(
    entry_id: int,
    language_code: Optional[str] = Query(None, description="Filter by language code"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ContentEntry).where(ContentEntry.id == entry_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Entry not found")

    query = (
        select(ContentVersion)
        .where(ContentVersion.entry_id == entry_id)
        .order_by(ContentVersion.version_number.desc(), ContentVersion.created_at.desc())
    )
    if language_code:
        query = query.where(ContentVersion.language_code == language_code)

    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    return list(result.scalars().all())


@router.get("/{entry_id}/versions/{version_id}", response_model=ContentVersionResponse)
async def get_entry_version(
    entry_id: int,
    version_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ContentVersion).where(
            and_(
                ContentVersion.id == version_id,
                ContentVersion.entry_id == entry_id,
            )
        )
    )
    version = result.scalar_one_or_none()
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    return version


@router.post("/{entry_id}/rollback", response_model=EntryWithTranslationsResponse)
async def rollback_entry(
    entry_id: int,
    data: RollbackRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ContentEntry)
        .options(selectinload(ContentEntry.translations).selectinload(EntryTranslation.published_version))
        .where(ContentEntry.id == entry_id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    query = select(ContentVersion).where(
        and_(
            ContentVersion.entry_id == entry_id,
            ContentVersion.version_number == data.version_number,
        )
    )
    if data.language_code:
        query = query.where(ContentVersion.language_code == data.language_code)

    versions_result = await db.execute(query)
    versions = versions_result.scalars().all()

    if not versions:
        raise HTTPException(status_code=404, detail="Version not found")

    new_version_number = entry.current_version_number + 1

    rollback_languages = [v.language_code for v in versions]

    if rollback_languages:
        await db.execute(
            update(ContentVersion)
            .where(
                and_(
                    ContentVersion.entry_id == entry_id,
                    ContentVersion.language_code.in_(rollback_languages),
                    ContentVersion.is_published == True,
                )
            )
            .values(is_published=False)
        )

    for version in versions:
        translation = next(
            (t for t in entry.translations if t.language_code == version.language_code),
            None,
        )
        if not translation:
            continue

        translation.draft_field_values = version.field_values or {}
        translation.draft_title = version.title
        translation.draft_slug = version.slug

        new_version = ContentVersion(
            entry_id=entry_id,
            language_code=version.language_code,
            version_number=new_version_number,
            field_values=version.field_values or {},
            title=version.title,
            slug=version.slug,
            is_published=True,
            change_summary=data.change_summary or f"Rollback to version {data.version_number}",
        )
        db.add(new_version)
        await db.flush()

        translation.is_published = True
        translation.published_version_id = new_version.id

    entry.current_version_number = new_version_number
    entry.status = "published"

    await db.commit()

    result = await db.execute(
        select(ContentEntry)
        .options(selectinload(ContentEntry.translations).selectinload(EntryTranslation.published_version))
        .where(ContentEntry.id == entry_id)
    )
    return result.scalar_one()


@router.get("/{entry_id}/draft-preview", response_model=List[DraftPreviewResponse])
async def draft_preview(
    entry_id: int,
    language_code: Optional[str] = Query(None, description="Preview specific language"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ContentEntry)
        .options(selectinload(ContentEntry.translations).selectinload(EntryTranslation.published_version))
        .where(ContentEntry.id == entry_id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    previews = []
    for translation in entry.translations:
        if language_code and translation.language_code != language_code:
            continue

        pub_ver = None
        if translation.published_version:
            pub_ver = ContentVersionResponse.model_validate(translation.published_version)

        previews.append(DraftPreviewResponse(
            entry_id=entry_id,
            language_code=translation.language_code,
            draft_title=translation.draft_title,
            draft_slug=translation.draft_slug,
            draft_field_values=translation.draft_field_values or {},
            published_version=pub_ver,
            has_unpublished_changes=_has_draft_changes(translation),
        ))

    return previews
