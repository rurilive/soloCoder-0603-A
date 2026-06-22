from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from pydantic import BaseModel

from ..core.database import get_db
from ..core.config import settings
from ..models.content import ContentEntry, EntryTranslation, ContentType, Field, ContentVersion

router = APIRouter()


class PublicEntryTranslationResponse(BaseModel):
    language_code: str
    title: Optional[str] = None
    slug: Optional[str] = None
    field_values: Dict[str, Any] = {}

    class Config:
        from_attributes = True


class PublicEntryResponse(BaseModel):
    id: int
    content_type_id: int
    content_type_slug: str
    status: str
    current_version_number: int = 0
    published_at: Optional[Any] = None
    translation: Optional[PublicEntryTranslationResponse] = None
    translations: Optional[List[PublicEntryTranslationResponse]] = None


class PublicContentTypeResponse(BaseModel):
    id: int
    name: str
    slug: str
    description: Optional[str] = None
    fields: List[Dict[str, Any]] = []


@router.get("/content-types", response_model=List[PublicContentTypeResponse])
async def public_list_content_types(
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ContentType)
        .options(selectinload(ContentType.fields))
        .where(ContentType.is_active == True)
        .order_by(ContentType.name.asc())
    )
    content_types = result.scalars().all()
    return [
        PublicContentTypeResponse(
            id=ct.id,
            name=ct.name,
            slug=ct.slug,
            description=ct.description,
            fields=[
                {
                    "id": f.id,
                    "name": f.name,
                    "label": f.label,
                    "field_type": f.field_type,
                    "is_required": f.is_required,
                    "is_translatable": f.is_translatable,
                    "options": f.options,
                    "description": f.description,
                    "sort_order": f.sort_order,
                }
                for f in sorted(ct.fields, key=lambda x: x.sort_order)
            ],
        )
        for ct in content_types
    ]


@router.get("/content-types/{slug}", response_model=PublicContentTypeResponse)
async def public_get_content_type(
    slug: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ContentType)
        .options(selectinload(ContentType.fields))
        .where(and_(ContentType.slug == slug, ContentType.is_active == True))
    )
    ct = result.scalar_one_or_none()
    if not ct:
        raise HTTPException(status_code=404, detail="Content type not found")

    return PublicContentTypeResponse(
        id=ct.id,
        name=ct.name,
        slug=ct.slug,
        description=ct.description,
        fields=[
            {
                "id": f.id,
                "name": f.name,
                "label": f.label,
                "field_type": f.field_type,
                "is_required": f.is_required,
                "is_translatable": f.is_translatable,
                "options": f.options,
                "description": f.description,
                "sort_order": f.sort_order,
            }
            for f in sorted(ct.fields, key=lambda x: x.sort_order)
        ],
    )


def _build_trans_response(translation: EntryTranslation) -> PublicEntryTranslationResponse:
    if translation.published_version:
        pv = translation.published_version
        return PublicEntryTranslationResponse(
            language_code=translation.language_code,
            title=pv.title,
            slug=pv.slug,
            field_values=pv.field_values or {},
        )
    return PublicEntryTranslationResponse(
        language_code=translation.language_code,
        title=translation.draft_title,
        slug=translation.draft_slug,
        field_values=translation.draft_field_values or {},
    )


@router.get("/entries/{content_type_slug}", response_model=List[PublicEntryResponse])
async def public_list_entries(
    content_type_slug: str,
    language: str = Query(..., description="Language code"),
    all_languages: bool = Query(False, description="Include all languages"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
):
    if language not in settings.SUPPORTED_LANGUAGES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Language '{language}' is not supported",
        )

    ct_result = await db.execute(
        select(ContentType).where(
            and_(ContentType.slug == content_type_slug, ContentType.is_active == True)
        )
    )
    ct = ct_result.scalar_one_or_none()
    if not ct:
        raise HTTPException(status_code=404, detail="Content type not found")

    result = await db.execute(
        select(ContentEntry)
        .options(selectinload(ContentEntry.translations).selectinload(EntryTranslation.published_version))
        .where(
            and_(
                ContentEntry.content_type_id == ct.id,
                ContentEntry.status == "published",
            )
        )
        .order_by(ContentEntry.published_at.desc(), ContentEntry.updated_at.desc())
        .offset(skip)
        .limit(limit)
    )
    entries = result.scalars().all()

    response = []
    for entry in entries:
        published_translations = [t for t in entry.translations if t.is_published]
        target_translation = next(
            (t for t in published_translations if t.language_code == language),
            None,
        )
        if not target_translation:
            target_translation = published_translations[0] if published_translations else None

        if not target_translation:
            continue

        trans_response = _build_trans_response(target_translation)

        all_trans_response = (
            [_build_trans_response(t) for t in published_translations]
            if all_languages
            else None
        )

        response.append(
            PublicEntryResponse(
                id=entry.id,
                content_type_id=entry.content_type_id,
                content_type_slug=ct.slug,
                status=entry.status,
                current_version_number=entry.current_version_number,
                published_at=entry.published_at,
                translation=trans_response,
                translations=all_trans_response,
            )
        )

    return response


@router.get("/entries/{content_type_slug}/by-id/{entry_id}", response_model=PublicEntryResponse)
async def public_get_entry_by_id(
    content_type_slug: str,
    entry_id: int,
    language: str = Query(..., description="Language code"),
    all_languages: bool = Query(False, description="Include all languages"),
    db: AsyncSession = Depends(get_db),
):
    if language not in settings.SUPPORTED_LANGUAGES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Language '{language}' is not supported",
        )

    ct_result = await db.execute(
        select(ContentType).where(
            and_(ContentType.slug == content_type_slug, ContentType.is_active == True)
        )
    )
    ct = ct_result.scalar_one_or_none()
    if not ct:
        raise HTTPException(status_code=404, detail="Content type not found")

    result = await db.execute(
        select(ContentEntry)
        .options(selectinload(ContentEntry.translations).selectinload(EntryTranslation.published_version))
        .where(
            and_(
                ContentEntry.id == entry_id,
                ContentEntry.content_type_id == ct.id,
                ContentEntry.status == "published",
            )
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    published_translations = [t for t in entry.translations if t.is_published]
    target_translation = next(
        (t for t in published_translations if t.language_code == language),
        None,
    )
    if not target_translation:
        target_translation = published_translations[0] if published_translations else None

    if not target_translation:
        raise HTTPException(status_code=404, detail="No published translation found")

    trans_response = _build_trans_response(target_translation)

    all_trans_response = (
        [_build_trans_response(t) for t in published_translations]
        if all_languages
        else None
    )

    return PublicEntryResponse(
        id=entry.id,
        content_type_id=entry.content_type_id,
        content_type_slug=ct.slug,
        status=entry.status,
        current_version_number=entry.current_version_number,
        published_at=entry.published_at,
        translation=trans_response,
        translations=all_trans_response,
    )


@router.get("/entries/{content_type_slug}/by-slug/{slug}", response_model=PublicEntryResponse)
async def public_get_entry_by_slug(
    content_type_slug: str,
    slug: str,
    language: str = Query(..., description="Language code"),
    all_languages: bool = Query(False, description="Include all languages"),
    db: AsyncSession = Depends(get_db),
):
    if language not in settings.SUPPORTED_LANGUAGES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Language '{language}' is not supported",
        )

    ct_result = await db.execute(
        select(ContentType).where(
            and_(ContentType.slug == content_type_slug, ContentType.is_active == True)
        )
    )
    ct = ct_result.scalar_one_or_none()
    if not ct:
        raise HTTPException(status_code=404, detail="Content type not found")

    version_result = await db.execute(
        select(ContentVersion)
        .join(EntryTranslation, and_(
            EntryTranslation.published_version_id == ContentVersion.id,
            EntryTranslation.entry_id == ContentVersion.entry_id,
            EntryTranslation.language_code == ContentVersion.language_code,
        ))
        .join(ContentEntry, ContentEntry.id == ContentVersion.entry_id)
        .where(
            and_(
                ContentVersion.slug == slug,
                ContentVersion.language_code == language,
                ContentEntry.content_type_id == ct.id,
                ContentEntry.status == "published",
                EntryTranslation.is_published == True,
            )
        )
    )
    version = version_result.scalars().first()

    if not version:
        version_result = await db.execute(
            select(ContentVersion)
            .join(EntryTranslation, and_(
                EntryTranslation.published_version_id == ContentVersion.id,
                EntryTranslation.entry_id == ContentVersion.entry_id,
                EntryTranslation.language_code == ContentVersion.language_code,
            ))
            .join(ContentEntry, ContentEntry.id == ContentVersion.entry_id)
            .where(
                and_(
                    ContentVersion.slug == slug,
                    ContentEntry.content_type_id == ct.id,
                    ContentEntry.status == "published",
                    EntryTranslation.is_published == True,
                )
            )
        )
        version = version_result.scalars().first()

    if not version:
        translation_result = await db.execute(
            select(EntryTranslation)
            .join(ContentEntry, ContentEntry.id == EntryTranslation.entry_id)
            .where(
                and_(
                    EntryTranslation.draft_slug == slug,
                    EntryTranslation.is_published == True,
                    ContentEntry.content_type_id == ct.id,
                    ContentEntry.status == "published",
                )
            )
        )
        fallback_trans = translation_result.scalars().first()
        if fallback_trans:
            entry_result = await db.execute(
                select(ContentEntry)
                .options(selectinload(ContentEntry.translations).selectinload(EntryTranslation.published_version))
                .where(
                    and_(
                        ContentEntry.id == fallback_trans.entry_id,
                        ContentEntry.content_type_id == ct.id,
                        ContentEntry.status == "published",
                    )
                )
            )
            entry = entry_result.scalar_one_or_none()
            if not entry:
                raise HTTPException(status_code=404, detail="Entry not found")

            published_translations = [t for t in entry.translations if t.is_published]
            target_translation = next(
                (t for t in published_translations if t.language_code == language),
                None,
            )
            if not target_translation:
                target_translation = fallback_trans

            trans_response = _build_trans_response(target_translation)
            all_trans_response = (
                [_build_trans_response(t) for t in published_translations]
                if all_languages
                else None
            )

            return PublicEntryResponse(
                id=entry.id,
                content_type_id=entry.content_type_id,
                content_type_slug=ct.slug,
                status=entry.status,
                current_version_number=entry.current_version_number,
                published_at=entry.published_at,
                translation=trans_response,
                translations=all_trans_response,
            )

        raise HTTPException(status_code=404, detail="Entry not found")

    entry_result = await db.execute(
        select(ContentEntry)
        .options(selectinload(ContentEntry.translations).selectinload(EntryTranslation.published_version))
        .where(
            and_(
                ContentEntry.id == version.entry_id,
                ContentEntry.content_type_id == ct.id,
                ContentEntry.status == "published",
            )
        )
    )
    entry = entry_result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    published_translations = [t for t in entry.translations if t.is_published]
    target_translation = next(
        (t for t in published_translations if t.language_code == language),
        None,
    )
    if not target_translation:
        target_translation = next(
            (t for t in published_translations if t.language_code == version.language_code),
            None,
        )
    if not target_translation and published_translations:
        target_translation = published_translations[0]

    if not target_translation:
        trans_response = PublicEntryTranslationResponse(
            language_code=version.language_code,
            title=version.title,
            slug=version.slug,
            field_values=version.field_values or {},
        )
        return PublicEntryResponse(
            id=entry.id,
            content_type_id=entry.content_type_id,
            content_type_slug=ct.slug,
            status=entry.status,
            current_version_number=entry.current_version_number,
            published_at=entry.published_at,
            translation=trans_response,
            translations=None,
        )

    trans_response = _build_trans_response(target_translation)

    all_trans_response = (
        [_build_trans_response(t) for t in published_translations]
        if all_languages
        else None
    )

    return PublicEntryResponse(
        id=entry.id,
        content_type_id=entry.content_type_id,
        content_type_slug=ct.slug,
        status=entry.status,
        current_version_number=entry.current_version_number,
        published_at=entry.published_at,
        translation=trans_response,
        translations=all_trans_response,
    )


@router.get("/languages")
async def public_get_supported_languages():
    return {
        "supported_languages": settings.SUPPORTED_LANGUAGES,
        "default_language": settings.DEFAULT_LANGUAGE,
    }
