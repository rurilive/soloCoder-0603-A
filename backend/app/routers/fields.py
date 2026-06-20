from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_db
from ..models.content import Field, ContentType
from ..schemas.content import (
    FieldCreate,
    FieldUpdate,
    FieldResponse,
)

router = APIRouter()


@router.post("/", response_model=FieldResponse, status_code=status.HTTP_201_CREATED)
async def create_field(
    data: FieldCreate,
    content_type_id: int = Query(..., description="Content type ID"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ContentType).where(ContentType.id == content_type_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Content type not found")

    existing = await db.execute(select(Field).where(
        and_(Field.content_type_id == content_type_id, Field.name == data.name)
    ))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Field with this name already exists in this content type",
        )

    field = Field(content_type_id=content_type_id, **data.model_dump())
    db.add(field)
    await db.commit()
    await db.refresh(field)
    return field


@router.get("/", response_model=List[FieldResponse])
async def list_fields(
    content_type_id: Optional[int] = Query(None, description="Filter by content type ID"),
    skip: int = Query(0, ge=0),
    limit: int = Query(500, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
):
    query = select(Field).order_by(Field.sort_order.asc(), Field.created_at.asc())
    if content_type_id is not None:
        query = query.where(Field.content_type_id == content_type_id)
    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    return list(result.scalars().all())


@router.get("/{field_id}", response_model=FieldResponse)
async def get_field(
    field_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Field).where(Field.id == field_id))
    field = result.scalar_one_or_none()
    if not field:
        raise HTTPException(status_code=404, detail="Field not found")
    return field


@router.put("/{field_id}", response_model=FieldResponse)
async def update_field(
    field_id: int,
    data: FieldUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Field).where(Field.id == field_id))
    field = result.scalar_one_or_none()
    if not field:
        raise HTTPException(status_code=404, detail="Field not found")

    update_data = data.model_dump(exclude_unset=True)

    if "name" in update_data:
        existing = await db.execute(select(Field).where(
            and_(
                Field.content_type_id == field.content_type_id,
                Field.name == update_data["name"],
                Field.id != field_id,
            )
        ))
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Field with this name already exists in this content type",
            )

    for key, value in update_data.items():
        setattr(field, key, value)

    await db.commit()
    await db.refresh(field)
    return field


@router.delete("/{field_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_field(
    field_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Field).where(Field.id == field_id))
    field = result.scalar_one_or_none()
    if not field:
        raise HTTPException(status_code=404, detail="Field not found")

    await db.delete(field)
    await db.commit()
    return None
