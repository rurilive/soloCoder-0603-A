from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
import requests
from bs4 import BeautifulSoup

from ..database import get_db
from ..models import VisualCrawlConfig, SpiderScript
from ..schemas import (
    VisualCrawlConfigCreate,
    VisualCrawlConfigUpdate,
    VisualCrawlConfig as VisualCrawlConfigSchema,
    GenerateScriptRequest,
    SelectorTestRequest,
)
from ..services.script_generator import ScriptGenerator

router = APIRouter(prefix="/api/visual-config", tags=["visual-config"])


@router.get("", response_model=List[VisualCrawlConfigSchema])
async def list_configs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(VisualCrawlConfig).order_by(VisualCrawlConfig.updated_at.desc())
    )
    return result.scalars().all()


@router.get("/{config_id}", response_model=VisualCrawlConfigSchema)
async def get_config(config_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(VisualCrawlConfig).where(VisualCrawlConfig.id == config_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")
    return config


@router.post("", response_model=VisualCrawlConfigSchema)
async def create_config(
    data: VisualCrawlConfigCreate, db: AsyncSession = Depends(get_db)
):
    config = VisualCrawlConfig(
        name=data.name,
        description=data.description,
        crawl_type=data.crawl_type,
        list_config=data.list_config.model_dump(),
        detail_config=data.detail_config.model_dump(),
        common_config=data.common_config.model_dump(),
    )
    db.add(config)
    await db.commit()
    await db.refresh(config)
    return config


@router.put("/{config_id}", response_model=VisualCrawlConfigSchema)
async def update_config(
    config_id: int,
    data: VisualCrawlConfigUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(VisualCrawlConfig).where(VisualCrawlConfig.id == config_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if hasattr(value, "model_dump"):
            setattr(config, key, value.model_dump())
        else:
            setattr(config, key, value)

    await db.commit()
    await db.refresh(config)
    return config


@router.delete("/{config_id}")
async def delete_config(config_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(VisualCrawlConfig).where(VisualCrawlConfig.id == config_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")

    await db.delete(config)
    await db.commit()
    return {"message": "Config deleted successfully"}


@router.post("/{config_id}/generate-script")
async def generate_script(
    config_id: int, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(VisualCrawlConfig).where(VisualCrawlConfig.id == config_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")

    config_schema = VisualCrawlConfigSchema(
        id=config.id,
        name=config.name,
        description=config.description,
        crawl_type=config.crawl_type,
        list_config=config.list_config,
        detail_config=config.detail_config,
        common_config=config.common_config,
        generated_script_id=config.generated_script_id,
        created_at=config.created_at,
        updated_at=config.updated_at,
    )

    try:
        generated_code = ScriptGenerator.generate_script(config_schema)
        scrape_rules = ScriptGenerator.generate_scrape_rules(config_schema)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to generate script: {e}")

    script = SpiderScript(
        name=f"{config.name} (自动生成)",
        description=config.description,
        code=generated_code,
    )
    db.add(script)
    await db.commit()
    await db.refresh(script)

    config.generated_script_id = script.id
    await db.commit()

    return {
        "script_id": script.id,
        "script_name": script.name,
        "code": generated_code,
        "scrape_rules": scrape_rules,
    }


@router.post("/{config_id}/preview-script")
async def preview_script(config_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(VisualCrawlConfig).where(VisualCrawlConfig.id == config_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")

    config_schema = VisualCrawlConfigSchema(
        id=config.id,
        name=config.name,
        description=config.description,
        crawl_type=config.crawl_type,
        list_config=config.list_config,
        detail_config=config.detail_config,
        common_config=config.common_config,
        generated_script_id=config.generated_script_id,
        created_at=config.created_at,
        updated_at=config.updated_at,
    )

    try:
        generated_code = ScriptGenerator.generate_script(config_schema)
        scrape_rules = ScriptGenerator.generate_scrape_rules(config_schema)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to generate script: {e}")

    return {
        "code": generated_code,
        "scrape_rules": scrape_rules,
    }


@router.post("/test-selector")
async def test_selector(data: SelectorTestRequest):
    try:
        headers = {"User-Agent": "Mozilla/5.0 (compatible; SpiderPlatform/1.0)"}
        headers.update(data.headers)

        response = requests.get(data.url, headers=headers, timeout=30)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, "lxml")
        elements = soup.select(data.selector)

        results = []
        for idx, elem in enumerate(elements[:10]):
            if data.attribute == "text":
                value = elem.get_text(strip=True)
            else:
                value = elem.get(data.attribute, "")
            results.append(
                {
                    "index": idx,
                    "value": value,
                    "html": str(elem)[:500],
                }
            )

        return {
            "success": True,
            "url": data.url,
            "selector": data.selector,
            "attribute": data.attribute,
            "matches": len(elements),
            "results": results,
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "matches": 0,
            "results": [],
        }
