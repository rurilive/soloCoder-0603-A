from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta
import asyncio
import random
import uuid
import logging
import hashlib
from jose import jwt, JWTError, ExpiredSignatureError

from database import engine, get_db, Base
from models import (
    Content, ReviewLog, AutoReviewRule,
    MLThresholdConfig, MLReviewRecord, SampleReview, SampleBatch, User
)
from schemas import (
    ContentSubmit, ContentResponse, ReviewAction, ReviewLogResponse,
    AutoReviewRuleCreate, AutoReviewRuleResponse, AutoReviewResult,
    ImageReviewResult, MLReviewResult,
    MLThresholdConfigCreate, MLThresholdConfigUpdate, MLThresholdConfigResponse,
    MLReviewRecordResponse, SampleReviewAction, SampleReviewResponse,
    SampleBatchResponse, SampleRequest,
    BatchReviewRequest, BatchReviewResult,
    AssignTaskRequest, AssignTaskResult,
    UserLogin, UserResponse, LoginResponse, ReviewerStats
)

SECRET_KEY = "moderation-secret-key-2024"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

PASSWORD_SALT = "moderation-salt-2024"

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def hash_password(password: str) -> str:
    return hashlib.sha256((PASSWORD_SALT + password).encode('utf-8')).hexdigest()


def verify_password(plain: str, hashed: str) -> bool:
    return hash_password(plain) == hashed
from auto_moderation import AutoModerationEngine, init_default_rules
from image_moderation import image_service
from websocket_manager import manager
from ml_client import get_ml_client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

Base.metadata.create_all(bind=engine)

app = FastAPI(title="内容审核系统", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


SAMPLE_TASK_INTERVAL = 60
_sample_task_running = False


def get_active_threshold_config(db: Session) -> MLThresholdConfig:
    config = db.query(MLThresholdConfig).filter(
        MLThresholdConfig.enabled == True
    ).order_by(MLThresholdConfig.updated_at.desc()).first()
    if not config:
        config = MLThresholdConfig(
            name="default",
            pass_threshold=0.3,
            reject_threshold=0.7,
            ml_weight=0.5,
            rule_weight=0.5,
            enabled=True,
            description="默认ML阈值配置"
        )
        db.add(config)
        db.commit()
        db.refresh(config)
    return config


def init_ml_threshold_config(db: Session):
    existing = db.query(MLThresholdConfig).first()
    if existing:
        return
    default = MLThresholdConfig(
        name="default",
        pass_threshold=0.3,
        reject_threshold=0.7,
        ml_weight=0.5,
        rule_weight=0.5,
        enabled=True,
        description="默认ML阈值配置"
    )
    db.add(default)
    db.commit()


def normalize_rule_score(score: int) -> float:
    clamped = max(-20, min(20, score))
    return (clamped + 20) / 40.0


def combine_scores(rule_score_norm: float, ml_score: float, ml_weight: float, rule_weight: float) -> float:
    total_w = ml_weight + rule_weight
    if total_w <= 0:
        return ml_score
    return (ml_score * ml_weight + rule_score_norm * rule_weight) / total_w


def determine_result(combined_score: float, pass_th: float, reject_th: float) -> str:
    if combined_score <= pass_th:
        return "auto_pass"
    elif combined_score >= reject_th:
        return "auto_reject"
    else:
        return "manual"


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="无效的认证凭证",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未提供认证令牌",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="认证令牌已过期，请重新登录",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except JWTError:
        raise credentials_exception
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="账号已被禁用",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要管理员权限",
        )
    return current_user


def init_default_users(db: Session):
    default_users = [
        {"username": "admin", "password": "admin123", "role": "admin", "display_name": "系统管理员"},
        {"username": "reviewer1", "password": "123456", "role": "reviewer", "display_name": "审核员张"},
        {"username": "reviewer2", "password": "123456", "role": "reviewer", "display_name": "审核员李"},
        {"username": "reviewer3", "password": "123456", "role": "reviewer", "display_name": "审核员王"},
    ]
    for u in default_users:
        existing = db.query(User).filter(User.username == u["username"]).first()
        if not existing:
            db_user = User(
                username=u["username"],
                password_hash=hash_password(u["password"]),
                role=u["role"],
                display_name=u["display_name"],
                is_active=True
            )
            db.add(db_user)
    db.commit()


def migrate_add_assigned_columns(db: Session):
    try:
        from sqlalchemy import text
        db.execute(text("ALTER TABLE contents ADD COLUMN assigned_to VARCHAR(100)"))
        db.commit()
    except Exception:
        pass
    try:
        from sqlalchemy import text
        db.execute(text("ALTER TABLE contents ADD COLUMN assigned_at DATETIME"))
        db.commit()
    except Exception:
        pass
    try:
        from sqlalchemy import text
        db.execute(text("ALTER TABLE contents ADD COLUMN assigned_by VARCHAR(100)"))
        db.commit()
    except Exception:
        pass


@app.on_event("startup")
def startup_event():
    db = next(get_db())
    init_default_rules(db)
    init_ml_threshold_config(db)
    migrate_add_assigned_columns(db)
    init_default_users(db)
    db.close()
    asyncio.create_task(schedule_sampling_task())


async def schedule_sampling_task():
    global _sample_task_running
    if _sample_task_running:
        return
    _sample_task_running = True
    try:
        while True:
            try:
                await auto_run_sampling()
            except Exception as e:
                logger.error(f"抽样任务执行异常: {e}")
            await asyncio.sleep(SAMPLE_TASK_INTERVAL)
    finally:
        _sample_task_running = False


async def auto_run_sampling():
    db_gen = get_db()
    db = next(db_gen)
    try:
        recent_cutoff = datetime.utcnow() - timedelta(hours=1)
        recent_count = db.query(Content).filter(
            Content.created_at >= recent_cutoff,
            Content.status.in_(["approved", "rejected"])
        ).count()
        if recent_count < 5:
            return
        threshold_cfg = get_active_threshold_config(db)
        default_rate = 0.1
        sample_size = max(1, int(recent_count * default_rate))
        batch_id = f"auto-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
        do_sampling_internal(
            db=db,
            sample_rate=default_rate,
            batch_id=batch_id,
            max_samples=min(sample_size, 20),
            sample_reason="定时自动抽样复审"
        )
        db.commit()
        asyncio.create_task(manager.broadcast({
            "type": "sample_batch_created",
            "data": {"batch_id": batch_id}
        }))
        logger.info(f"自动抽样完成: batch_id={batch_id}, sample_size={sample_size}")
    except Exception as e:
        db.rollback()
        logger.error(f"自动抽样失败: {e}")
    finally:
        db_gen.close()


def do_sampling_internal(db: Session, sample_rate: float, batch_id: Optional[str],
                         max_samples: Optional[int], sample_reason: str) -> SampleBatch:
    if not batch_id:
        batch_id = f"manual-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"

    candidates = db.query(Content).filter(
        Content.status.in_(["approved", "rejected"])
    ).all()

    if not candidates:
        batch = SampleBatch(
            batch_id=batch_id,
            sample_count=0,
            sample_rate=sample_rate,
            status="completed",
            reviewed_count=0,
            consistent_count=0,
            inconsistent_count=0,
            consistency_rate=None,
            completed_at=datetime.utcnow()
        )
        db.add(batch)
        db.flush()
        return batch

    k = int(len(candidates) * sample_rate)
    k = max(1, k)
    if max_samples:
        k = min(k, max_samples)
    k = min(k, len(candidates))

    sampled = random.sample(candidates, k)

    existing = db.query(SampleBatch).filter(SampleBatch.batch_id == batch_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="批次ID已存在")

    batch = SampleBatch(
        batch_id=batch_id,
        sample_count=len(sampled),
        sample_rate=sample_rate,
        status="active",
        reviewed_count=0,
        consistent_count=0,
        inconsistent_count=0,
        consistency_rate=None
    )
    db.add(batch)
    db.flush()

    for content in sampled:
        sr = SampleReview(
            content_id=content.id,
            sample_batch_id=batch_id,
            original_status=content.status,
            original_reviewer=content.reviewed_by or "auto",
            sample_reason=sample_reason,
            review_status="pending"
        )
        db.add(sr)
    db.flush()
    return batch


def update_sample_batch_stats(db: Session, batch_id: str):
    batch = db.query(SampleBatch).filter(SampleBatch.batch_id == batch_id).first()
    if not batch:
        return
    samples = db.query(SampleReview).filter(SampleReview.sample_batch_id == batch_id).all()
    reviewed = [s for s in samples if s.review_status == "reviewed"]
    batch.reviewed_count = len(reviewed)
    batch.consistent_count = sum(1 for s in reviewed if s.is_consistent)
    batch.inconsistent_count = sum(1 for s in reviewed if s.is_consistent is False)
    if reviewed:
        batch.consistency_rate = round(batch.consistent_count / len(reviewed), 4)
    if len(reviewed) == len(samples) and len(samples) > 0:
        batch.status = "completed"
        batch.completed_at = datetime.utcnow()


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

    threshold_cfg = get_active_threshold_config(db)
    pass_th = threshold_cfg.pass_threshold
    reject_th = threshold_cfg.reject_threshold
    ml_w = threshold_cfg.ml_weight
    rule_w = threshold_cfg.rule_weight

    ml_client = get_ml_client()
    ml_result: Optional[MLReviewResult] = None
    try:
        ml_result = await ml_client.review(content.title, content.body, content.image_url)
    except Exception as e:
        logger.warning(f"调用ML审核失败，降级为纯规则审核: {e}")

    ml_score = 0.5
    ml_conf = None
    ml_result_str = "unavailable"
    ml_model_ver = None
    ml_cats = None

    if ml_result:
        ml_score = ml_result.overall_score
        ml_conf = ml_result.confidence
        ml_model_ver = ml_result.model_version
        ml_cats = [{"category": c.category, "score": c.score} for c in ml_result.category_scores]
        if ml_score <= pass_th:
            ml_result_str = "auto_pass"
        elif ml_score >= reject_th:
            ml_result_str = "auto_reject"
        else:
            ml_result_str = "manual"

        ml_record = MLReviewRecord(
            content_id=db_content.id,
            model_version=ml_result.model_version,
            overall_score=ml_result.overall_score,
            confidence=ml_result.confidence,
            is_safe=ml_result.is_safe,
            category_scores=ml_cats,
            detected_topics=ml_result.detected_topics,
            processing_time_ms=ml_result.processing_time_ms,
            threshold_pass=pass_th,
            threshold_reject=reject_th
        )
        db.add(ml_record)

    db_content.ml_score = ml_score
    db_content.ml_confidence = ml_conf
    db_content.ml_result = ml_result_str
    db_content.ml_model_version = ml_model_ver
    db_content.ml_category_scores = ml_cats

    rule_score_norm = normalize_rule_score(text_result.score)

    force_reject = False
    combined_reasons = []

    if img_result:
        img_desc = {"safe": "图片审核正常", "unsafe": "图片审核不通过", "uncertain": "图片审核不确定需人工"}
        combined_reasons.append(f"{img_desc[img_result.result]}: {img_result.reason}")
        if img_result.result == "unsafe":
            force_reject = True

    ml_desc_map = {"auto_pass": "通过", "auto_reject": "拒绝", "manual": "转人工", "unavailable": "不可用"}
    combined_reasons.append(f"文字规则审核[{text_result.score}分]: {text_result.reason}")
    combined_reasons.append(
        f"ML审核[score={ml_score:.3f},conf={(ml_conf or 0):.3f}]: {ml_desc_map.get(ml_result_str, ml_result_str)}"
    )

    final_reason = "; ".join(combined_reasons)

    if force_reject:
        final_score = 1.0
        final_result = "auto_reject"
    else:
        final_score = combine_scores(rule_score_norm, ml_score, ml_w, rule_w)
        final_result = determine_result(final_score, pass_th, reject_th)

    final_score_int = int(round((final_score - 0.5) * 40))

    db_content.combined_score = final_score
    db_content.auto_review_score = final_score_int
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
    assigned_to: Optional[str] = None,
    reviewer: Optional[str] = None,
    unassigned_only: Optional[bool] = False,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Content)
    if status:
        query = query.filter(Content.status == status)
    if current_user.role == "admin":
        if assigned_to:
            query = query.filter(Content.assigned_to == assigned_to)
        if reviewer:
            query = query.filter(Content.reviewed_by == reviewer)
        if unassigned_only:
            query = query.filter(Content.assigned_to == None)
    else:
        query = query.filter(Content.assigned_to == current_user.username)
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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    content = db.query(Content).filter(Content.id == content_id).first()
    if not content:
        raise HTTPException(status_code=404, detail="内容不存在")

    if current_user.role != "admin" and content.assigned_to != current_user.username:
        raise HTTPException(status_code=403, detail="无权审核该内容")

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

    reviewer_name = current_user.display_name or current_user.username

    content.reviewed_at = datetime.utcnow()
    content.reviewed_by = reviewer_name
    content.review_note = action.note

    log = ReviewLog(
        content_id=content_id,
        action=action.action,
        reviewer=reviewer_name,
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
            "reviewer": reviewer_name
        }
    }))

    return content


@app.get("/api/contents/{content_id}/logs", response_model=List[ReviewLogResponse], tags=["审核"])
def get_content_logs(content_id: int, db: Session = Depends(get_db)):
    content = db.query(Content).filter(Content.id == content_id).first()
    if not content:
        raise HTTPException(status_code=404, detail="内容不存在")
    return db.query(ReviewLog).filter(ReviewLog.content_id == content_id).order_by(ReviewLog.created_at.desc()).all()


@app.get("/api/contents/{content_id}/ml-record", response_model=Optional[MLReviewRecordResponse], tags=["ML审核"])
def get_content_ml_record(content_id: int, db: Session = Depends(get_db)):
    content = db.query(Content).filter(Content.id == content_id).first()
    if not content:
        raise HTTPException(status_code=404, detail="内容不存在")
    return db.query(MLReviewRecord).filter(MLReviewRecord.content_id == content_id).order_by(MLReviewRecord.created_at.desc()).first()


@app.get("/api/stats", tags=["统计"])
def get_stats(db: Session = Depends(get_db)):
    total = db.query(Content).count()
    pending = db.query(Content).filter(Content.status == "pending").count()
    approved = db.query(Content).filter(Content.status == "approved").count()
    rejected = db.query(Content).filter(Content.status == "rejected").count()
    auto_passed = db.query(Content).filter(Content.auto_review_result == "auto_pass").count()
    auto_rejected = db.query(Content).filter(Content.auto_review_result == "auto_reject").count()
    manual_count = db.query(Content).filter(Content.auto_review_result == "manual").count()
    ml_processed = db.query(MLReviewRecord).count()

    sample_batches = db.query(SampleBatch).all()
    total_sampled = sum(b.sample_count for b in sample_batches)
    total_reviewed_samples = sum(b.reviewed_count for b in sample_batches)
    total_consistent = sum(b.consistent_count for b in sample_batches)
    overall_consistency = None
    if total_reviewed_samples > 0:
        overall_consistency = round(total_consistent / total_reviewed_samples, 4)

    return {
        "total": total,
        "pending": pending,
        "approved": approved,
        "rejected": rejected,
        "auto_passed": auto_passed,
        "auto_rejected": auto_rejected,
        "manual": manual_count,
        "ml_processed": ml_processed,
        "sample_batches": len(sample_batches),
        "total_sampled": total_sampled,
        "reviewed_samples": total_reviewed_samples,
        "sample_consistency_rate": overall_consistency
    }


@app.get("/api/rules", response_model=List[AutoReviewRuleResponse], tags=["规则"])
async def get_rules(db: Session = Depends(get_db)):
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
async def delete_rule(rule_id: int, db: Session = Depends(get_db)):
    db_rule = db.query(AutoReviewRule).filter(AutoReviewRule.id == rule_id).first()
    if not db_rule:
        raise HTTPException(status_code=404, detail="规则不存在")
    db.delete(db_rule)
    db.commit()
    return {"message": "规则已删除"}


@app.get("/api/ml/thresholds", response_model=List[MLThresholdConfigResponse], tags=["ML阈值"])
async def list_ml_thresholds(db: Session = Depends(get_db)):
    return db.query(MLThresholdConfig).order_by(MLThresholdConfig.updated_at.desc()).all()


@app.get("/api/ml/thresholds/active", response_model=MLThresholdConfigResponse, tags=["ML阈值"])
async def get_active_ml_threshold(db: Session = Depends(get_db)):
    return get_active_threshold_config(db)


@app.post("/api/ml/thresholds", response_model=MLThresholdConfigResponse, tags=["ML阈值"])
async def create_ml_threshold(config: MLThresholdConfigCreate, db: Session = Depends(get_db)):
    if config.reject_threshold <= config.pass_threshold:
        raise HTTPException(status_code=400, detail="拒绝阈值必须大于通过阈值")
    existing = db.query(MLThresholdConfig).filter(MLThresholdConfig.name == config.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="配置名称已存在")

    db_cfg = MLThresholdConfig(**config.model_dump())
    db.add(db_cfg)
    db.commit()
    db.refresh(db_cfg)

    asyncio.create_task(manager.broadcast({
        "type": "ml_threshold_updated",
        "data": {"id": db_cfg.id, "name": db_cfg.name}
    }))

    return db_cfg


@app.put("/api/ml/thresholds/{config_id}", response_model=MLThresholdConfigResponse, tags=["ML阈值"])
async def update_ml_threshold(config_id: int, update: MLThresholdConfigUpdate, db: Session = Depends(get_db)):
    db_cfg = db.query(MLThresholdConfig).filter(MLThresholdConfig.id == config_id).first()
    if not db_cfg:
        raise HTTPException(status_code=404, detail="配置不存在")

    update_data = update.model_dump(exclude_unset=True)

    new_pass = update_data.get("pass_threshold", db_cfg.pass_threshold)
    new_reject = update_data.get("reject_threshold", db_cfg.reject_threshold)
    if new_reject <= new_pass:
        raise HTTPException(status_code=400, detail="拒绝阈值必须大于通过阈值")

    for key, value in update_data.items():
        setattr(db_cfg, key, value)
    db_cfg.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(db_cfg)

    asyncio.create_task(manager.broadcast({
        "type": "ml_threshold_updated",
        "data": {"id": db_cfg.id, "name": db_cfg.name}
    }))

    return db_cfg


@app.delete("/api/ml/thresholds/{config_id}", tags=["ML阈值"])
async def delete_ml_threshold(config_id: int, db: Session = Depends(get_db)):
    db_cfg = db.query(MLThresholdConfig).filter(MLThresholdConfig.id == config_id).first()
    if not db_cfg:
        raise HTTPException(status_code=404, detail="配置不存在")
    active_count = db.query(MLThresholdConfig).filter(MLThresholdConfig.enabled == True).count()
    if db_cfg.enabled and active_count <= 1:
        raise HTTPException(status_code=400, detail="至少保留一个启用的配置")
    db.delete(db_cfg)
    db.commit()
    return {"message": "配置已删除"}


@app.put("/api/ml/thresholds/{config_id}/activate", response_model=MLThresholdConfigResponse, tags=["ML阈值"])
async def activate_ml_threshold(config_id: int, db: Session = Depends(get_db)):
    target = db.query(MLThresholdConfig).filter(MLThresholdConfig.id == config_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="配置不存在")
    others = db.query(MLThresholdConfig).filter(MLThresholdConfig.id != config_id).all()
    for o in others:
        o.enabled = False
    target.enabled = True
    target.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(target)

    asyncio.create_task(manager.broadcast({
        "type": "ml_threshold_activated",
        "data": {"id": target.id, "name": target.name}
    }))

    return target


@app.get("/api/ml/records", response_model=List[MLReviewRecordResponse], tags=["ML审核"])
async def list_ml_records(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(MLReviewRecord).order_by(MLReviewRecord.created_at.desc()).offset(skip).limit(limit).all()


@app.get("/api/ml/health", tags=["ML审核"])
async def check_ml_health():
    client = get_ml_client()
    healthy = await client.health()
    return {
        "ml_api_available": healthy,
        "ml_api_url": "http://127.0.0.1:1113"
    }


@app.post("/api/sampling/run", response_model=SampleBatchResponse, tags=["抽样复审"])
async def run_sampling(request: SampleRequest, db: Session = Depends(get_db)):
    batch = do_sampling_internal(
        db=db,
        sample_rate=request.sample_rate,
        batch_id=request.batch_id,
        max_samples=request.max_samples,
        sample_reason="手动触发抽样复审"
    )
    db.commit()
    db.refresh(batch)
    asyncio.create_task(manager.broadcast({
        "type": "sample_batch_created",
        "data": {"batch_id": batch.batch_id}
    }))
    return batch


@app.get("/api/sampling/batches", response_model=List[SampleBatchResponse], tags=["抽样复审"])
async def list_sample_batches(status: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(SampleBatch)
    if status:
        q = q.filter(SampleBatch.status == status)
    return q.order_by(SampleBatch.created_at.desc()).all()


@app.get("/api/sampling/batches/{batch_id}", response_model=SampleBatchResponse, tags=["抽样复审"])
async def get_sample_batch(batch_id: str, db: Session = Depends(get_db)):
    batch = db.query(SampleBatch).filter(SampleBatch.batch_id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="批次不存在")
    return batch


@app.get("/api/sampling/batches/{batch_id}/reviews", response_model=List[SampleReviewResponse], tags=["抽样复审"])
async def get_batch_sample_reviews(batch_id: str, include_content: bool = True, db: Session = Depends(get_db)):
    batch = db.query(SampleBatch).filter(SampleBatch.batch_id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="批次不存在")
    reviews = db.query(SampleReview).filter(SampleReview.sample_batch_id == batch_id).order_by(SampleReview.created_at.desc()).all()
    result = []
    for r in reviews:
        resp = SampleReviewResponse.model_validate(r)
        if include_content:
            resp.content = ContentResponse.model_validate(r.content) if r.content else None
        result.append(resp)
    return result


@app.get("/api/sampling/reviews/pending", response_model=List[SampleReviewResponse], tags=["抽样复审"])
async def list_pending_sample_reviews(include_content: bool = True, db: Session = Depends(get_db)):
    reviews = db.query(SampleReview).filter(SampleReview.review_status == "pending").order_by(SampleReview.created_at.desc()).all()
    result = []
    for r in reviews:
        resp = SampleReviewResponse.model_validate(r)
        if include_content:
            resp.content = ContentResponse.model_validate(r.content) if r.content else None
        result.append(resp)
    return result


@app.post("/api/sampling/reviews/{review_id}", response_model=SampleReviewResponse, tags=["抽样复审"])
async def review_sample(review_id: int, action: SampleReviewAction, db: Session = Depends(get_db)):
    sr = db.query(SampleReview).filter(SampleReview.id == review_id).first()
    if not sr:
        raise HTTPException(status_code=404, detail="抽样复审记录不存在")
    if sr.review_status == "reviewed":
        raise HTTPException(status_code=400, detail="该抽样已完成复审")

    if action.result not in ["approve", "reject"]:
        raise HTTPException(status_code=400, detail="无效的复审结果")

    final_status = "approved" if action.result == "approve" else "rejected"
    is_consistent = final_status == sr.original_status

    sr.review_status = "reviewed"
    sr.review_result = action.result
    sr.reviewed_by = action.reviewer
    sr.review_note = action.note
    sr.is_consistent = is_consistent
    sr.reviewed_at = datetime.utcnow()

    log = ReviewLog(
        content_id=sr.content_id,
        action="sample_review_" + action.result,
        reviewer=action.reviewer,
        note=f"抽样复审: {'一致' if is_consistent else '不一致'}; 原结果: {sr.original_status}; 备注: {action.note or ''}",
        tags=[]
    )
    db.add(log)

    if sr.sample_batch_id:
        update_sample_batch_stats(db, sr.sample_batch_id)

    db.commit()
    db.refresh(sr)

    asyncio.create_task(manager.broadcast({
        "type": "sample_review_completed",
        "data": {"id": sr.id, "is_consistent": is_consistent, "batch_id": sr.sample_batch_id}
    }))

    return sr


@app.post("/api/contents/batch-review", response_model=BatchReviewResult, tags=["审核"])
async def batch_review_contents(
    request: BatchReviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if request.action not in ["approve", "reject", "tag"]:
        raise HTTPException(status_code=400, detail="无效的审核操作")
    if not request.content_ids:
        raise HTTPException(status_code=400, detail="content_ids不能为空")

    reviewer_name = current_user.display_name or current_user.username
    success_count = 0
    failed_ids = []

    for cid in request.content_ids:
        try:
            content = db.query(Content).filter(Content.id == cid).first()
            if not content:
                failed_ids.append(cid)
                continue
            if current_user.role != "admin" and content.assigned_to != current_user.username:
                failed_ids.append(cid)
                continue
            if request.action == "approve":
                content.status = "approved"
            elif request.action == "reject":
                content.status = "rejected"
            if request.tags:
                existing_tags = content.tags or []
                for tag in request.tags:
                    if tag not in existing_tags:
                        existing_tags.append(tag)
                content.tags = existing_tags
            content.reviewed_at = datetime.utcnow()
            content.reviewed_by = reviewer_name
            content.review_note = request.note
            log = ReviewLog(
                content_id=cid,
                action=request.action,
                reviewer=reviewer_name,
                note=request.note,
                tags=request.tags or []
            )
            db.add(log)
            success_count += 1
        except Exception:
            failed_ids.append(cid)

    db.commit()

    asyncio.create_task(manager.broadcast({
        "type": "batch_reviewed",
        "data": {
            "action": request.action,
            "count": success_count,
            "reviewer": reviewer_name
        }
    }))

    return BatchReviewResult(
        success=success_count,
        failed=len(failed_ids),
        failed_ids=failed_ids
    )


@app.post("/api/contents/assign", response_model=AssignTaskResult, tags=["任务分配"])
async def assign_tasks(
    request: AssignTaskRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    if not request.content_ids:
        raise HTTPException(status_code=400, detail="content_ids不能为空")
    if not request.assigned_to:
        raise HTTPException(status_code=400, detail="assigned_to不能为空")

    target_user = db.query(User).filter(User.username == request.assigned_to).first()
    if not target_user or not target_user.is_active:
        raise HTTPException(status_code=400, detail="目标审核员不存在或已禁用")

    assigner_name = current_user.display_name or current_user.username
    success_count = 0
    failed_ids = []

    for cid in request.content_ids:
        try:
            content = db.query(Content).filter(Content.id == cid).first()
            if not content:
                failed_ids.append(cid)
                continue
            content.assigned_to = request.assigned_to
            content.assigned_at = datetime.utcnow()
            content.assigned_by = assigner_name

            log = ReviewLog(
                content_id=cid,
                action="assign",
                reviewer=assigner_name,
                note=f"分配给 {target_user.display_name or target_user.username}",
                tags=[]
            )
            db.add(log)
            success_count += 1
        except Exception:
            failed_ids.append(cid)

    db.commit()

    asyncio.create_task(manager.broadcast({
        "type": "tasks_assigned",
        "data": {
            "assigned_to": target_user.display_name or target_user.username,
            "count": success_count
        }
    }))

    return AssignTaskResult(
        success=success_count,
        failed=len(failed_ids),
        failed_ids=failed_ids
    )


@app.post("/api/auth/login", response_model=LoginResponse, tags=["用户认证"])
def login(login_data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == login_data.username).first()
    if not user:
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    if not user.is_active:
        raise HTTPException(status_code=401, detail="账号已禁用")
    if not verify_password(login_data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    token = create_access_token({
        "sub": user.username,
        "role": user.role,
        "user_id": user.id
    })

    return LoginResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse.model_validate(user)
    )


@app.get("/api/users/reviewers", response_model=List[UserResponse], tags=["用户"])
def list_reviewers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return db.query(User).filter(
        User.role == "reviewer",
        User.is_active == True
    ).order_by(User.username).all()


@app.get("/api/users/reviewers/stats", response_model=List[ReviewerStats], tags=["用户"])
def get_reviewer_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    reviewers = db.query(User).filter(
        User.role == "reviewer",
        User.is_active == True
    ).all()
    result = []
    for r in reviewers:
        pending_count = db.query(Content).filter(
            Content.assigned_to == r.username,
            Content.status == "pending"
        ).count()
        total_reviewed = db.query(Content).filter(
            Content.reviewed_by == r.username
        ).count()
        result.append(ReviewerStats(
            username=r.username,
            display_name=r.display_name,
            pending_count=pending_count,
            total_reviewed=total_reviewed
        ))
    return result


@app.get("/api/users/me", response_model=UserResponse, tags=["用户"])
def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user)


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
