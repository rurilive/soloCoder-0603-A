import re
import unicodedata

from fastapi import APIRouter, Depends, status
from sqlalchemy import func, literal_column, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import User, get_current_user
from app.database import get_db
from app.models import KnowledgeBase, Ticket, TicketStatus
from app.schemas import RecommendationRequest, RecommendationResponse, RecommendedKBOut, RecommendedTicketOut

router = APIRouter()


def _extract_keywords(query: str) -> list[str]:
    cleaned = unicodedata.normalize("NFKC", query.lower())
    cleaned = re.sub(r"[^\w\s]", " ", cleaned)
    parts = cleaned.split()
    stop_words = {
        "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一", "一个",
        "上", "也", "很", "到", "说", "要", "去", "你", "会", "着", "没有", "看", "好",
        "自己", "这", "他", "她", "它", "们", "那", "些", "什么", "怎么", "如何",
        "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
        "have", "has", "had", "do", "does", "did", "will", "would", "could",
        "should", "may", "might", "shall", "can", "need", "dare", "ought",
        "and", "or", "but", "if", "of", "at", "by", "for", "with", "about",
        "to", "from", "in", "on", "it", "its", "i", "me", "my", "we", "our",
    }
    keywords = [p for p in parts if p not in stop_words and len(p) >= 2]
    return keywords


def _build_tsquery(keywords: list[str]) -> str:
    if not keywords:
        return ""
    parts = [kw for kw in keywords if kw]
    if not parts:
        return ""
    return " | ".join(parts)


@router.post("/recommendations", response_model=RecommendationResponse)
async def get_recommendations(
    body: RecommendationRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    keywords = _extract_keywords(body.query)
    if not keywords:
        return RecommendationResponse()

    ts_query_str = _build_tsquery(keywords)
    limit = body.limit

    kb_results = await _search_knowledge_base(db, keywords, ts_query_str, body.category, limit)
    ticket_results = await _search_resolved_tickets(db, keywords, ts_query_str, body.category, limit)

    return RecommendationResponse(
        knowledge_articles=kb_results,
        similar_tickets=ticket_results,
    )


async def _search_knowledge_base(
    db: AsyncSession,
    keywords: list[str],
    ts_query_str: str,
    category: str | None,
    limit: int,
) -> list[RecommendedKBOut]:
    ts_vector = func.to_tsvector("simple", KnowledgeBase.title + " " + KnowledgeBase.content + " " + func.coalesce(KnowledgeBase.tags, ""))
    ts_query = func.to_tsquery("simple", ts_query_str)
    rank_expr = func.ts_rank(ts_vector, ts_query).label("rank")

    query = select(
        KnowledgeBase.id,
        KnowledgeBase.title,
        KnowledgeBase.content,
        KnowledgeBase.category,
        KnowledgeBase.tags,
        rank_expr,
    ).where(ts_vector.op("@@")(ts_query))

    if category:
        query = query.where(KnowledgeBase.category == category)

    query = query.order_by(rank_expr.desc()).limit(limit)
    result = await db.execute(query)
    rows = result.all()

    if not rows:
        return await _fallback_search_knowledge_base(db, keywords, category, limit)

    return [
        RecommendedKBOut(
            id=row.id,
            title=row.title,
            content=row.content,
            category=row.category,
            tags=row.tags,
            score=float(row.rank),
        )
        for row in rows
    ]


async def _fallback_search_knowledge_base(
    db: AsyncSession,
    keywords: list[str],
    category: str | None,
    limit: int,
) -> list[RecommendedKBOut]:
    conditions = []
    for kw in keywords[:5]:
        pattern = f"%{kw}%"
        conditions.append(KnowledgeBase.title.ilike(pattern))
        conditions.append(KnowledgeBase.content.ilike(pattern))
        conditions.append(KnowledgeBase.tags.ilike(pattern))

    from sqlalchemy import or_

    query = select(KnowledgeBase).where(or_(*conditions))
    if category:
        query = query.where(KnowledgeBase.category == category)
    query = query.limit(limit)

    result = await db.execute(query)
    articles = result.scalars().all()

    scored = []
    for article in articles:
        text_blob = f"{article.title} {article.content} {article.tags or ''}".lower()
        match_count = sum(1 for kw in keywords if kw.lower() in text_blob)
        scored.append((article, match_count))

    scored.sort(key=lambda x: x[1], reverse=True)

    return [
        RecommendedKBOut(
            id=article.id,
            title=article.title,
            content=article.content,
            category=article.category,
            tags=article.tags,
            score=float(match_count),
        )
        for article, match_count in scored
    ]


async def _search_resolved_tickets(
    db: AsyncSession,
    keywords: list[str],
    ts_query_str: str,
    category: str | None,
    limit: int,
) -> list[RecommendedTicketOut]:
    ts_vector = func.to_tsvector("simple", Ticket.title + " " + Ticket.description)
    ts_query = func.to_tsquery("simple", ts_query_str)
    rank_expr = func.ts_rank(ts_vector, ts_query).label("rank")

    query = select(
        Ticket.id,
        Ticket.title,
        Ticket.description,
        Ticket.category,
        Ticket.status,
        rank_expr,
    ).where(
        ts_vector.op("@@")(ts_query),
        Ticket.status.in_([TicketStatus.resolved, TicketStatus.closed]),
    )

    if category:
        query = query.where(Ticket.category == category)

    query = query.order_by(rank_expr.desc()).limit(limit)
    result = await db.execute(query)
    rows = result.all()

    if not rows:
        return await _fallback_search_resolved_tickets(db, keywords, category, limit)

    return [
        RecommendedTicketOut(
            id=row.id,
            title=row.title,
            description=row.description,
            category=row.category,
            status=row.status,
            score=float(row.rank),
        )
        for row in rows
    ]


async def _fallback_search_resolved_tickets(
    db: AsyncSession,
    keywords: list[str],
    category: str | None,
    limit: int,
) -> list[RecommendedTicketOut]:
    conditions = []
    for kw in keywords[:5]:
        pattern = f"%{kw}%"
        conditions.append(Ticket.title.ilike(pattern))
        conditions.append(Ticket.description.ilike(pattern))

    from sqlalchemy import or_

    query = select(Ticket).where(
        or_(*conditions),
        Ticket.status.in_([TicketStatus.resolved, TicketStatus.closed]),
    )
    if category:
        query = query.where(Ticket.category == category)
    query = query.limit(limit)

    result = await db.execute(query)
    tickets = result.scalars().all()

    scored = []
    for ticket in tickets:
        text_blob = f"{ticket.title} {ticket.description}".lower()
        match_count = sum(1 for kw in keywords if kw.lower() in text_blob)
        scored.append((ticket, match_count))

    scored.sort(key=lambda x: x[1], reverse=True)

    return [
        RecommendedTicketOut(
            id=ticket.id,
            title=ticket.title,
            description=ticket.description,
            category=ticket.category,
            status=ticket.status,
            score=float(match_count),
        )
        for ticket, match_count in scored
    ]
