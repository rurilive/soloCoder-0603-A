from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import asyncio

from database import engine, get_db, Base
from models import Content, ReviewLog, AutoReviewRule
from schemas import (
    ContentSubmit, ContentResponse, ReviewAction, ReviewLogResponse,
    AutoReviewRuleCreate, AutoReviewRuleResponse, AutoReviewResult,
    ImageReviewResult
)
from auto_moderation import AutoModerationEngine, init_default_rules
from image_moderation import image_service
from websocket_manager import manager

Base.metadata.create_all(bind=engine)

app = FastAPI(title="内容审核系统", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup_event():
    db = next(get_db())
    init_default_rules(db)
    db.close()


@app.post("/api/contents", response_model=ContentResponse, tags=["内容"])
async def submit_content(content: ContentSubmit, db: Session = Depends(get_db)):
    db_content = Content(
        title=content.title,
        body=content.body,
        image_url=content.image_url,
        author=content.author,
        source=content.source,
        status="pending",
        tags=[]
    )
    db.add(db_content)
    db.flush()

    img_result = image_service.review(content.image_url)
    if img_result:
        db_content.image_review_result = img_result.result
        db_content.image_review_confidence = img_result.confidence

    text_engine = AutoModerationEngine(db)
    text_result = text_engine.review(content.title, content.body)

    db_content.auto_review_score = text_result.score

    final_result = text_result.result
    final_reason = text_result.reason

    if img_result:
        img_desc = {
            "safe": "图片审核正常",
            "unsafe": "图片审核不通过",
            "uncertain": "图片审核不确定需人工"
        }
        final_reason = f"{img_desc[img_result.result]}: {img_result.reason}; 文字审核: {final_reason}"

        if img_result.result == "unsafe":
            final_result = "auto_reject"
        elif img_result.result == "uncertain" and final_result == "auto_pass":
            final_result = "manual"

    db_content.auto_review_result = final_result
    db_content.auto_review_reason = final_reason
    if final_result == "auto_pass":
        db_content.status = "approved"
        db_content.reviewed_at = datetime.utcnow()
        db_content.reviewed_by = "auto"
        log = ReviewLog(
            content_id=db_content.id,
            action="auto_approve",
            reviewer="auto",
            note=f"自动审核通过: {final_reason}",
            tags=[]
        )
        db.add(log)
    elif final_result == "auto_reject":
        db_content.status = "rejected"
        db_content.reviewed_at = datetime.utcnow()
        db_content.reviewed_by = "auto"
        log = ReviewLog(
            content_id=db_content.id,
            action="auto_reject",
            reviewer="auto",
            note=f"自动审核拒绝: {final_reason}",
            tags=[]
        )
        db.add(log)
    else:
        db_content.status = "pending"

    db.commit()
    db.refresh(db_content)

    asyncio.create_task(manager.broadcast({
        "type": "content_update",
        "data": {
            "id": db_content.id,
            "status": db_content.status,
            "title": db_content.title
        }
    }))

    return db_content


@app.get("/api/contents", response_model=List[ContentResponse], tags=["内容"])
def get_contents(
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    query = db.query(Content)
    if status:
        query = query.filter(Content.status == status)
    return query.order_by(Content.created_at.desc()).offset(skip).limit(limit).all()


@app.get("/api/contents/{content_id}", response_model=ContentResponse, tags=["内容"])
def get_content(content_id: int, db: Session = Depends(get_db)):
    content = db.query(Content).filter(Content.id == content_id).first()
    if not content:
        raise HTTPException(status_code=404, detail="内容不存在")
    return content


@app.post("/api/contents/{content_id}/review", response_model=ContentResponse, tags=["审核"])
async def review_content(
    content_id: int,
    action: ReviewAction,
    db: Session = Depends(get_db)
):
    content = db.query(Content).filter(Content.id == content_id).first()
    if not content:
        raise HTTPException(status_code=404, detail="内容不存在")

    if action.action not in ["approve", "reject", "tag"]:
        raise HTTPException(status_code=400, detail="无效的审核操作")

    if action.action == "approve":
        content.status = "approved"
    elif action.action == "reject":
        content.status = "rejected"

    if action.tags:
        existing_tags = content.tags or []
        for tag in action.tags:
            if tag not in existing_tags:
                existing_tags.append(tag)
        content.tags = existing_tags

    content.reviewed_at = datetime.utcnow()
    content.reviewed_by = action.reviewer
    content.review_note = action.note

    log = ReviewLog(
        content_id=content_id,
        action=action.action,
        reviewer=action.reviewer,
        note=action.note,
        tags=action.tags or []
    )
    db.add(log)
    db.commit()
    db.refresh(content)

    asyncio.create_task(manager.broadcast({
        "type": "content_reviewed",
        "data": {
            "id": content.id,
            "status": content.status,
            "title": content.title,
            "reviewer": action.reviewer
        }
    }))

    return content


@app.get("/api/contents/{content_id}/logs", response_model=List[ReviewLogResponse], tags=["审核"])
def get_content_logs(content_id: int, db: Session = Depends(get_db)):
    content = db.query(Content).filter(Content.id == content_id).first()
    if not content:
        raise HTTPException(status_code=404, detail="内容不存在")
    return db.query(ReviewLog).filter(ReviewLog.content_id == content_id).order_by(ReviewLog.created_at.desc()).all()


@app.get("/api/stats", tags=["统计"])
def get_stats(db: Session = Depends(get_db)):
    total = db.query(Content).count()
    pending = db.query(Content).filter(Content.status == "pending").count()
    approved = db.query(Content).filter(Content.status == "approved").count()
    rejected = db.query(Content).filter(Content.status == "rejected").count()
    auto_passed = db.query(Content).filter(Content.auto_review_result == "auto_pass").count()
    auto_rejected = db.query(Content).filter(Content.auto_review_result == "auto_reject").count()
    manual_count = db.query(Content).filter(Content.auto_review_result == "manual").count()

    return {
        "total": total,
        "pending": pending,
        "approved": approved,
        "rejected": rejected,
        "auto_passed": auto_passed,
        "auto_rejected": auto_rejected,
        "manual": manual_count
    }


@app.get("/api/rules", response_model=List[AutoReviewRuleResponse], tags=["规则"])
def get_rules(db: Session = Depends(get_db)):
    return db.query(AutoReviewRule).order_by(AutoReviewRule.created_at.desc()).all()


@app.post("/api/rules", response_model=AutoReviewRuleResponse, tags=["规则"])
async def create_rule(rule: AutoReviewRuleCreate, db: Session = Depends(get_db)):
    if rule.rule_type not in ["keyword", "regex", "length_min", "length_max"]:
        raise HTTPException(status_code=400, detail="无效的规则类型")
    if rule.action not in ["pass", "reject", "manual"]:
        raise HTTPException(status_code=400, detail="无效的规则动作")

    db_rule = AutoReviewRule(
        name=rule.name,
        rule_type=rule.rule_type,
        pattern=rule.pattern,
        action=rule.action,
        score=rule.score,
        enabled=rule.enabled,
        description=rule.description
    )
    db.add(db_rule)
    db.commit()
    db.refresh(db_rule)

    asyncio.create_task(manager.broadcast({
        "type": "rule_updated",
        "data": {"id": db_rule.id, "name": db_rule.name}
    }))

    return db_rule


@app.put("/api/rules/{rule_id}", response_model=AutoReviewRuleResponse, tags=["规则"])
async def update_rule(rule_id: int, rule: AutoReviewRuleCreate, db: Session = Depends(get_db)):
    db_rule = db.query(AutoReviewRule).filter(AutoReviewRule.id == rule_id).first()
    if not db_rule:
        raise HTTPException(status_code=404, detail="规则不存在")

    db_rule.name = rule.name
    db_rule.rule_type = rule.rule_type
    db_rule.pattern = rule.pattern
    db_rule.action = rule.action
    db_rule.score = rule.score
    db_rule.enabled = rule.enabled
    db_rule.description = rule.description

    db.commit()
    db.refresh(db_rule)

    asyncio.create_task(manager.broadcast({
        "type": "rule_updated",
        "data": {"id": db_rule.id, "name": db_rule.name}
    }))

    return db_rule


@app.delete("/api/rules/{rule_id}", tags=["规则"])
def delete_rule(rule_id: int, db: Session = Depends(get_db)):
    db_rule = db.query(AutoReviewRule).filter(AutoReviewRule.id == rule_id).first()
    if not db_rule:
        raise HTTPException(status_code=404, detail="规则不存在")
    db.delete(db_rule)
    db.commit()
    return {"message": "规则已删除"}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            await manager.send_personal_message({"type": "echo", "data": data}, websocket)
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@app.get("/api/health")
def health_check():
    return {"status": "ok", "message": "内容审核系统运行正常"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=1111)
