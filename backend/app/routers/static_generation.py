from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_db
from ..core.config import settings
from ..models.static_page import StaticPage
from ..schemas.static_page import (
    StaticPageResponse,
    GenerateRequest,
    GenerateResult,
    StaticSiteStats,
)
from ..services.static_generator import get_static_generator

router = APIRouter()


@router.post("/generate", response_model=GenerateResult)
async def generate_static_pages(
    data: GenerateRequest,
):
    generator = get_static_generator()
    return await generator.generate_pages(
        content_type_slug=data.content_type_slug,
        entry_id=data.entry_id,
        language_code=data.language_code,
        full_regeneration=data.full_regeneration,
    )


@router.post("/generate/full", response_model=GenerateResult)
async def generate_all_static_pages():
    generator = get_static_generator()
    return await generator.generate_pages(full_regeneration=True)


@router.get("/pages", response_model=List[StaticPageResponse])
async def list_static_pages(
    content_type_slug: Optional[str] = Query(None, description="Filter by content type slug"),
    page_type: Optional[str] = Query(None, description="Filter by page type: home, listing, detail"),
    language_code: Optional[str] = Query(None, description="Filter by language code"),
    is_generated: Optional[bool] = Query(None, description="Filter by generation status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    query = select(StaticPage).order_by(StaticPage.updated_at.desc())
    if content_type_slug:
        query = query.where(StaticPage.content_type_slug == content_type_slug)
    if page_type:
        query = query.where(StaticPage.page_type == page_type)
    if language_code:
        query = query.where(StaticPage.language_code == language_code)
    if is_generated is not None:
        query = query.where(StaticPage.is_generated == is_generated)

    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    return list(result.scalars().all())


@router.get("/pages/{page_id}", response_model=StaticPageResponse)
async def get_static_page(
    page_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(StaticPage).where(StaticPage.id == page_id))
    page = result.scalar_one_or_none()
    if not page:
        raise HTTPException(status_code=404, detail="Static page not found")
    return page


@router.delete("/pages/{page_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_static_page(
    page_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(StaticPage).where(StaticPage.id == page_id))
    page = result.scalar_one_or_none()
    if not page:
        raise HTTPException(status_code=404, detail="Static page not found")

    import os
    from pathlib import Path
    file_path = Path(settings.STATIC_SITE_OUTPUT_DIR) / page.page_path
    if file_path.exists():
        try:
            file_path.unlink()
        except OSError:
            pass

    await db.delete(page)
    await db.commit()
    return None


@router.get("/stats", response_model=StaticSiteStats)
async def get_static_site_stats(
    db: AsyncSession = Depends(get_db),
):
    total_result = await db.execute(select(func.count(StaticPage.id)))
    total_pages = total_result.scalar() or 0

    generated_result = await db.execute(
        select(func.count(StaticPage.id)).where(StaticPage.is_generated == True)
    )
    generated_pages = generated_result.scalar() or 0

    failed_result = await db.execute(
        select(func.count(StaticPage.id)).where(StaticPage.last_error.isnot(None))
    )
    failed_pages = failed_result.scalar() or 0

    pending_pages = total_pages - generated_pages

    langs_result = await db.execute(select(StaticPage.language_code).distinct())
    languages = sorted([row[0] for row in langs_result.all() if row[0]])

    cts_result = await db.execute(select(StaticPage.content_type_slug).distinct())
    content_types = sorted([row[0] for row in cts_result.all() if row[0]])

    last_gen_result = await db.execute(
        select(func.max(StaticPage.last_generated_at))
    )
    last_generated_at = last_gen_result.scalar()

    return StaticSiteStats(
        total_pages=total_pages,
        generated_pages=generated_pages,
        pending_pages=pending_pages,
        failed_pages=failed_pages,
        languages=languages,
        content_types=content_types,
        last_generated_at=last_generated_at,
        output_directory=settings.STATIC_SITE_OUTPUT_DIR,
    )


@router.get("/config")
async def get_static_generation_config():
    return {
        "enabled": settings.STATIC_SITE_ENABLED,
        "auto_generate": settings.STATIC_SITE_AUTO_GENERATE,
        "output_directory": settings.STATIC_SITE_OUTPUT_DIR,
        "base_url": settings.STATIC_SITE_BASE_URL,
        "supported_languages": settings.SUPPORTED_LANGUAGES,
    }
