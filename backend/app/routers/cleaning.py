from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from typing import List, Optional

from ..database import get_db
from ..models import CleaningPipeline, CleaningRule
from ..schemas import (
    CleaningPipeline as PipelineSchema,
    CleaningPipelineCreate,
    CleaningPipelineUpdate,
    CleaningRule as RuleSchema,
    CleaningRuleCreate,
    CleaningPreviewRequest,
    CleaningPreviewResponse,
    RuleTypeInfo,
)
from ..services.cleaning_engine import CleaningEngine, get_available_rule_types

router = APIRouter(prefix="/api/cleaning", tags=["cleaning"])


@router.get("/rule-types", response_model=List[RuleTypeInfo])
async def list_rule_types():
    return get_available_rule_types()


@router.get("/pipelines", response_model=List[PipelineSchema])
async def list_pipelines(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db)
):
    query = select(CleaningPipeline)\
        .options(joinedload(CleaningPipeline.rules))\
        .order_by(CleaningPipeline.updated_at.desc())\
        .offset(offset).limit(limit)
    result = await db.execute(query)
    return result.scalars().unique().all()


@router.get("/pipelines/{pipeline_id}", response_model=PipelineSchema)
async def get_pipeline(pipeline_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CleaningPipeline)
        .options(joinedload(CleaningPipeline.rules))
        .where(CleaningPipeline.id == pipeline_id)
    )
    pipeline = result.scalar_one_or_none()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Cleaning pipeline not found")
    return pipeline


@router.post("/pipelines", response_model=PipelineSchema)
async def create_pipeline(
    data: CleaningPipelineCreate,
    db: AsyncSession = Depends(get_db)
):
    pipeline = CleaningPipeline(
        name=data.name,
        description=data.description,
    )
    db.add(pipeline)
    await db.flush()

    for i, rule_data in enumerate(data.rules):
        rule = CleaningRule(
            pipeline_id=pipeline.id,
            rule_type=rule_data.rule_type,
            field_name=rule_data.field_name,
            params=rule_data.params,
            order_index=rule_data.order_index if rule_data.order_index else i,
        )
        db.add(rule)

    await db.commit()

    result = await db.execute(
        select(CleaningPipeline)
        .options(joinedload(CleaningPipeline.rules))
        .where(CleaningPipeline.id == pipeline.id)
    )
    return result.scalars().unique().one()


@router.put("/pipelines/{pipeline_id}", response_model=PipelineSchema)
async def update_pipeline(
    pipeline_id: int,
    data: CleaningPipelineUpdate,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(CleaningPipeline)
        .options(joinedload(CleaningPipeline.rules))
        .where(CleaningPipeline.id == pipeline_id)
    )
    pipeline = result.scalar_one_or_none()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Cleaning pipeline not found")

    if data.name is not None:
        pipeline.name = data.name
    if data.description is not None:
        pipeline.description = data.description

    if data.rules is not None:
        for rule in pipeline.rules:
            await db.delete(rule)
        await db.flush()

        for i, rule_data in enumerate(data.rules):
            rule = CleaningRule(
                pipeline_id=pipeline.id,
                rule_type=rule_data.rule_type,
                field_name=rule_data.field_name,
                params=rule_data.params,
                order_index=rule_data.order_index if rule_data.order_index else i,
            )
            db.add(rule)

    await db.commit()

    result = await db.execute(
        select(CleaningPipeline)
        .options(joinedload(CleaningPipeline.rules))
        .where(CleaningPipeline.id == pipeline_id)
    )
    return result.scalars().unique().one()


@router.delete("/pipelines/{pipeline_id}")
async def delete_pipeline(pipeline_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CleaningPipeline).where(CleaningPipeline.id == pipeline_id)
    )
    pipeline = result.scalar_one_or_none()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Cleaning pipeline not found")

    await db.delete(pipeline)
    await db.commit()
    return {"message": "Pipeline deleted successfully"}


@router.post("/preview", response_model=CleaningPreviewResponse)
async def preview_cleaning(data: CleaningPreviewRequest):
    rules_dicts = [rule.model_dump() for rule in data.rules]
    engine = CleaningEngine(rules_dicts)

    original = [dict(item) for item in data.sample_data]
    cleaned = engine.clean_items(original)

    return CleaningPreviewResponse(
        original=original,
        cleaned=cleaned,
        rule_count=len(data.rules)
    )


@router.post("/pipelines/{pipeline_id}/preview", response_model=CleaningPreviewResponse)
async def preview_pipeline(
    pipeline_id: int,
    sample_data: List[dict],
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(CleaningPipeline)
        .options(joinedload(CleaningPipeline.rules))
        .where(CleaningPipeline.id == pipeline_id)
    )
    pipeline = result.scalar_one_or_none()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Cleaning pipeline not found")

    rules_dicts = [
        {
            "rule_type": rule.rule_type,
            "field_name": rule.field_name,
            "params": rule.params,
            "order_index": rule.order_index,
        }
        for rule in pipeline.rules
    ]
    engine = CleaningEngine(rules_dicts)

    original = [dict(item) for item in sample_data]
    cleaned = engine.clean_items(original)

    return CleaningPreviewResponse(
        original=original,
        cleaned=cleaned,
        rule_count=len(pipeline.rules)
    )


@router.get("/pipelines/{pipeline_id}/rules", response_model=List[RuleSchema])
async def list_pipeline_rules(
    pipeline_id: int,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(CleaningRule)
        .where(CleaningRule.pipeline_id == pipeline_id)
        .order_by(CleaningRule.order_index, CleaningRule.id)
    )
    return result.scalars().all()


@router.post("/pipelines/{pipeline_id}/rules", response_model=RuleSchema)
async def add_rule(
    pipeline_id: int,
    rule_data: CleaningRuleCreate,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(CleaningPipeline).where(CleaningPipeline.id == pipeline_id)
    )
    pipeline = result.scalar_one_or_none()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Cleaning pipeline not found")

    rule = CleaningRule(
        pipeline_id=pipeline_id,
        rule_type=rule_data.rule_type,
        field_name=rule_data.field_name,
        params=rule_data.params,
        order_index=rule_data.order_index,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


@router.put("/rules/{rule_id}", response_model=RuleSchema)
async def update_rule(
    rule_id: int,
    rule_data: dict,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(CleaningRule).where(CleaningRule.id == rule_id)
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Cleaning rule not found")

    if "rule_type" in rule_data:
        rule.rule_type = rule_data["rule_type"]
    if "field_name" in rule_data:
        rule.field_name = rule_data["field_name"]
    if "params" in rule_data:
        rule.params = rule_data["params"]
    if "order_index" in rule_data:
        rule.order_index = rule_data["order_index"]

    await db.commit()
    await db.refresh(rule)
    return rule


@router.delete("/rules/{rule_id}")
async def delete_rule(rule_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CleaningRule).where(CleaningRule.id == rule_id)
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Cleaning rule not found")

    await db.delete(rule)
    await db.commit()
    return {"message": "Rule deleted successfully"}
