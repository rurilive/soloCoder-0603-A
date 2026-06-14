from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from ..database import get_db
from ..models import SpiderScript
from ..schemas import SpiderScriptCreate, SpiderScriptUpdate, SpiderScript as ScriptSchema

router = APIRouter(prefix="/api/scripts", tags=["scripts"])


@router.get("", response_model=List[ScriptSchema])
async def list_scripts(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SpiderScript).order_by(SpiderScript.updated_at.desc()))
    return result.scalars().all()


@router.get("/{script_id}", response_model=ScriptSchema)
async def get_script(script_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SpiderScript).where(SpiderScript.id == script_id))
    script = result.scalar_one_or_none()
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")
    return script


@router.post("", response_model=ScriptSchema)
async def create_script(data: SpiderScriptCreate, db: AsyncSession = Depends(get_db)):
    script = SpiderScript(**data.model_dump())
    db.add(script)
    await db.commit()
    await db.refresh(script)
    return script


@router.put("/{script_id}", response_model=ScriptSchema)
async def update_script(script_id: int, data: SpiderScriptUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SpiderScript).where(SpiderScript.id == script_id))
    script = result.scalar_one_or_none()
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(script, key, value)

    await db.commit()
    await db.refresh(script)
    return script


@router.delete("/{script_id}")
async def delete_script(script_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SpiderScript).where(SpiderScript.id == script_id))
    script = result.scalar_one_or_none()
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")

    await db.delete(script)
    await db.commit()
    return {"message": "Script deleted successfully"}
