from fastapi import FastAPI
from pydantic import BaseModel, Field
from typing import List, Optional
import random
import hashlib
import re

app = FastAPI(title="模拟ML内容审核模型服务", version="1.0.0")


class ReviewRequest(BaseModel):
    title: str
    body: str
    image_url: Optional[str] = None


class CategoryScore(BaseModel):
    category: str
    score: float = Field(ge=0, le=1)


class ReviewResponse(BaseModel):
    model_version: str
    overall_score: float = Field(ge=0, le=1)
    is_safe: bool
    confidence: float = Field(ge=0, le=1)
    category_scores: List[CategoryScore]
    detected_topics: List[str]
    processing_time_ms: int


SENSITIVE_KEYWORDS = {
    "ad": ["加微信", "加好友", "联系电话", "扫码关注", "赚钱", "兼职", "推广", "广告", "点击链接", "优惠活动"],
    "gambling": ["赌博", "博彩", "彩票", "赌场", "投注", "赔率", "六合彩"],
    "porn": ["色情", "黄色", "低俗", "裸聊", "成人", "性暗示", "约炮"],
    "violence": ["暴力", "血腥", "打砸", "斗殴", "杀人", "恐怖", "恐吓"],
    "drugs": ["毒品", "大麻", "可卡因", "吸毒", "贩毒", "摇头丸"],
    "politics": ["反动", "颠覆", "敏感政治", "抗议政府", "分裂国家"]
}

SAFE_TOPICS = ["学习", "分享", "交流", "讨论", "推荐", "你好", "谢谢", "科技", "生活", "美食", "旅行", "读书"]


def _compute_content_hash(title: str, body: str) -> int:
    content = f"{title}|{body}".encode("utf-8")
    hash_bytes = hashlib.md5(content).digest()
    return int.from_bytes(hash_bytes[:4], byteorder="big")


def _keyword_density(text: str, keywords: List[str]) -> float:
    if not text:
        return 0.0
    count = 0
    for kw in keywords:
        count += len(re.findall(re.escape(kw), text, re.IGNORECASE))
    return min(count * 0.15, 1.0)


def _detect_topics(text: str) -> List[str]:
    detected = []
    for topic in SAFE_TOPICS:
        if topic in text:
            detected.append(topic)
    return detected[:5]


@app.post("/api/v1/review", response_model=ReviewResponse, tags=["审核"])
async def review_content(request: ReviewRequest):
    import time
    start = time.time()

    content = f"{request.title}\n{request.body}"
    content_hash = _compute_content_hash(request.title, request.body)
    rng = random.Random(content_hash)

    category_scores = []
    total_weight = 0.0

    for cat, keywords in SENSITIVE_KEYWORDS.items():
        density = _keyword_density(content, keywords)
        noise = rng.uniform(-0.05, 0.05)
        score = max(0.0, min(1.0, density + noise))
        weight = {
            "porn": 1.5,
            "violence": 1.4,
            "drugs": 1.6,
            "politics": 1.3,
            "gambling": 1.3,
            "ad": 1.0
        }.get(cat, 1.0)
        category_scores.append(CategoryScore(category=cat, score=round(score, 4)))
        total_weight += score * weight

    if request.image_url:
        img_noise = rng.uniform(0, 0.15)
        total_weight += img_noise * 0.5
        category_scores.append(CategoryScore(category="image", score=round(img_noise, 4)))

    base_score = min(total_weight / 6.0, 1.0)
    final_score = round(base_score, 4)
    confidence = round(0.7 + rng.uniform(0, 0.28), 4)

    detected_topics = _detect_topics(content)

    threshold = 0.7
    is_safe = final_score < threshold

    elapsed = int((time.time() - start) * 1000) + rng.randint(15, 50)

    return ReviewResponse(
        model_version="ml-moderation-v1.2.0",
        overall_score=final_score,
        is_safe=is_safe,
        confidence=confidence,
        category_scores=category_scores,
        detected_topics=detected_topics,
        processing_time_ms=elapsed
    )


@app.get("/api/v1/health")
async def health():
    return {"status": "ok", "model": "ml-moderation-v1.2.0", "service": "content-classifier"}


@app.get("/api/v1/info")
async def model_info():
    return {
        "version": "ml-moderation-v1.2.0",
        "supported_categories": list(SENSITIVE_KEYWORDS.keys()) + ["image"],
        "score_range": "[0, 1]",
        "default_threshold": 0.7,
        "description": "基于关键词密度+噪声模拟的内容审核ML模型，输出各类别风险分和综合风险分"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=1113)
