import re
import unicodedata

import jieba
from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import User, get_current_user
from app.database import get_db
from app.models import KnowledgeBase, Ticket, TicketStatus
from app.schemas import RecommendationRequest, RecommendationResponse, RecommendedKBOut, RecommendedTicketOut

router = APIRouter()

STOP_WORDS = {
    "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一", "一个",
    "上", "也", "很", "到", "说", "要", "去", "你", "会", "着", "没有", "看", "好",
    "自己", "这", "他", "她", "它", "们", "那", "些", "什么", "怎么", "如何",
    "请问", "您好", "你好", "谢谢", "麻烦", "请问一下", "一下", "可以", "能",
    "应该", "可能", "我想", "帮忙", "帮助", "解决", "问题", "一下",
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "dare", "ought",
    "and", "or", "but", "if", "of", "at", "by", "for", "with", "about",
    "to", "from", "in", "on", "it", "its", "i", "me", "my", "we", "our",
    "please", "help", "issue", "problem", "question", "how", "what", "why",
}


def _extract_keywords(query: str) -> list[str]:
    cleaned = unicodedata.normalize("NFKC", query.lower())
    cleaned = re.sub(r"[^\w\u4e00-\u9fff\s]", " ", cleaned)
    words = jieba.lcut(cleaned)
    keywords = []
    seen = set()
    for w in words:
        w = w.strip()
        if not w:
            continue
        if len(w) < 2:
            continue
        if w in STOP_WORDS:
            continue
        if w in seen:
            continue
        seen.add(w)
        keywords.append(w)
    return keywords


def _compute_score(text: str, keywords: list[str]) -> float:
    text_lower = text.lower()
    score = 0.0
    for kw in keywords:
        kw_lower = kw.lower()
        count = text_lower.count(kw_lower)
        if count > 0:
            score += count * len(kw)
    return score


@router.post("/", response_model=RecommendationResponse)
async def get_recommendations(
    body: RecommendationRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    keywords = _extract_keywords(body.query)
    if not keywords:
        return RecommendationResponse()

    limit = body.limit
    kb_results = await _search_knowledge_base(db, keywords, body.category, limit)
    ticket_results = await _search_resolved_tickets(db, keywords, body.category, limit)

    return RecommendationResponse(
        knowledge_articles=kb_results,
        similar_tickets=ticket_results,
    )


async def _search_knowledge_base(
    db: AsyncSession,
    keywords: list[str],
    category: str | None,
    limit: int,
) -> list[RecommendedKBOut]:
    conditions = []
    for kw in keywords[:8]:
        pattern = f"%{kw}%"
        conditions.append(KnowledgeBase.title.ilike(pattern))
        conditions.append(KnowledgeBase.content.ilike(pattern))
        conditions.append(KnowledgeBase.tags.ilike(pattern))

    query = select(KnowledgeBase).where(or_(*conditions))
    if category:
        query = query.where(KnowledgeBase.category == category)

    result = await db.execute(query)
    articles = result.scalars().all()

    scored = []
    for article in articles:
        text_blob = f"{article.title} {article.content} {article.tags or ''}"
        score = _compute_score(text_blob, keywords)
        if score > 0:
            scored.append((article, score))

    scored.sort(key=lambda x: x[1], reverse=True)
    scored = scored[:limit]

    return [
        RecommendedKBOut(
            id=article.id,
            title=article.title,
            content=article.content,
            category=article.category,
            tags=article.tags,
            score=float(score),
        )
        for article, score in scored
    ]


async def _search_resolved_tickets(
    db: AsyncSession,
    keywords: list[str],
    category: str | None,
    limit: int,
) -> list[RecommendedTicketOut]:
    conditions = []
    for kw in keywords[:8]:
        pattern = f"%{kw}%"
        conditions.append(Ticket.title.ilike(pattern))
        conditions.append(Ticket.description.ilike(pattern))

    query = select(Ticket).where(
        or_(*conditions),
        Ticket.status.in_([TicketStatus.resolved, TicketStatus.closed]),
    )
    if category:
        query = query.where(Ticket.category == category)

    result = await db.execute(query)
    tickets = result.scalars().all()

    scored = []
    for ticket in tickets:
        text_blob = f"{ticket.title} {ticket.description}"
        score = _compute_score(text_blob, keywords)
        if score > 0:
            scored.append((ticket, score))

    scored.sort(key=lambda x: x[1], reverse=True)
    scored = scored[:limit]

    return [
        RecommendedTicketOut(
            id=ticket.id,
            title=ticket.title,
            description=ticket.description,
            category=ticket.category,
            status=ticket.status,
            score=float(score),
        )
        for ticket, score in scored
    ]
