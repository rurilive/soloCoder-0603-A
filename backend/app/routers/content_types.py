from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..core.database import get_db
from ..models.content import ContentType, Field
from ..schemas.content import (
    ContentTypeCreate,
    ContentTypeUpdate,
    ContentTypeResponse,
    FieldCreate,
)

router = APIRouter()


@router.post("/", response_model=ContentTypeResponse, status_code=status.HTTP_201_CREATED)
async def create_content_type(
    data: ContentTypeCreate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ContentType).where(
        (ContentType.name == data.name) | (ContentType.slug == data.slug)
    ))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Content type with this name or slug already exists",
        )

    ct = ContentType(**data.model_dump())
    db.add(ct)
    await db.commit()
    await db.refresh(ct)
    return ct


@router.get("/", response_model=List[ContentTypeResponse])
async def list_content_types(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    is_active: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(ContentType).options(selectinload(ContentType.fields)).order_by(ContentType.created_at.desc())
    if is_active is not None:
        query = query.where(ContentType.is_active == is_active)
    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    return list(result.scalars().all())


@router.get("/{content_type_id}", response_model=ContentTypeResponse)
async def get_content_type(
    content_type_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ContentType)
        .options(selectinload(ContentType.fields))
        .where(ContentType.id == content_type_id)
    )
    ct = result.scalar_one_or_none()
    if not ct:
        raise HTTPException(status_code=404, detail="Content type not found")
    return ct


@router.get("/slug/{slug}", response_model=ContentTypeResponse)
async def get_content_type_by_slug(
    slug: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ContentType)
        .options(selectinload(ContentType.fields))
        .where(ContentType.slug == slug)
    )
    ct = result.scalar_one_or_none()
    if not ct:
        raise HTTPException(status_code=404, detail="Content type not found")
    return ct


@router.put("/{content_type_id}", response_model=ContentTypeResponse)
async def update_content_type(
    content_type_id: int,
    data: ContentTypeUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ContentType).where(ContentType.id == content_type_id))
    ct = result.scalar_one_or_none()
    if not ct:
        raise HTTPException(status_code=404, detail="Content type not found")

    update_data = data.model_dump(exclude_unset=True)

    if "name" in update_data or "slug" in update_data:
        check_query = select(ContentType).where(ContentType.id != content_type_id)
        if "name" in update_data:
            check_query = check_query.where(ContentType.name == update_data["name"])
        if "slug" in update_data:
            check_query = check_query.where(ContentType.slug == update_data["slug"])
        check_result = await db.execute(check_query)
        if check_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Content type with this name or slug already exists",
            )

    for key, value in update_data.items():
        setattr(ct, key, value)

    await db.commit()
    await db.refresh(ct)
    return ct


@router.delete("/{content_type_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_content_type(
    content_type_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ContentType).where(ContentType.id == content_type_id))
    ct = result.scalar_one_or_none()
    if not ct:
        raise HTTPException(status_code=404, detail="Content type not found")

    await db.delete(ct)
    await db.commit()
    return None
