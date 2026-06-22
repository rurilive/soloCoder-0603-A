import re
import shutil
import json
from datetime import datetime
from html import unescape
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from jinja2 import Environment, FileSystemLoader, select_autoescape

from ..core.config import settings
from ..core.database import AsyncSessionLocal
from ..models.content import ContentType, ContentEntry, EntryTranslation
from ..models.static_page import StaticPage
from ..schemas.static_page import GenerateResult


LANG_NAMES = {
    "zh": "中文",
    "en": "English",
    "ja": "日本語",
    "ko": "한국어",
    "fr": "Français",
    "de": "Deutsch",
    "es": "Español",
}


UI_TEXT = {
    "zh": {
        "home": "首页",
        "view_all": "查看全部",
        "read_more": "阅读更多",
        "recent_updates": "最近更新",
        "no_entries": "暂无内容",
        "prev": "上一页",
        "next": "下一页",
        "other_languages": "其他语言版本",
    },
    "en": {
        "home": "Home",
        "view_all": "View All",
        "read_more": "Read More",
        "recent_updates": "Recent Updates",
        "no_entries": "No entries yet",
        "prev": "Previous",
        "next": "Next",
        "other_languages": "Other Languages",
    },
    "ja": {
        "home": "ホーム",
        "view_all": "すべて表示",
        "read_more": "続きを読む",
        "recent_updates": "最新の更新",
        "no_entries": "コンテンツがありません",
        "prev": "前へ",
        "next": "次へ",
        "other_languages": "他の言語",
    },
    "ko": {
        "home": "홈",
        "view_all": "전체 보기",
        "read_more": "더 읽기",
        "recent_updates": "최근 업데이트",
        "no_entries": "내용이 없습니다",
        "prev": "이전",
        "next": "다음",
        "other_languages": "다른 언어",
    },
    "fr": {
        "home": "Accueil",
        "view_all": "Voir tout",
        "read_more": "Lire la suite",
        "recent_updates": "Mises à jour récentes",
        "no_entries": "Aucun contenu",
        "prev": "Précédent",
        "next": "Suivant",
        "other_languages": "Autres langues",
    },
    "de": {
        "home": "Startseite",
        "view_all": "Alle anzeigen",
        "read_more": "Mehr lesen",
        "recent_updates": "Letzte Aktualisierungen",
        "no_entries": "Keine Inhalte",
        "prev": "Zurück",
        "next": "Weiter",
        "other_languages": "Andere Sprachen",
    },
    "es": {
        "home": "Inicio",
        "view_all": "Ver todo",
        "read_more": "Leer más",
        "recent_updates": "Actualizaciones recientes",
        "no_entries": "Sin contenido",
        "prev": "Anterior",
        "next": "Siguiente",
        "other_languages": "Otros idiomas",
    },
}


ENTRIES_PER_PAGE = 20


def _get_ui_text(lang: str) -> Dict[str, str]:
    return UI_TEXT.get(lang, UI_TEXT["en"])


def _strip_html_tags(html_text: str) -> str:
    if not html_text:
        return ""
    text = re.sub(r"<script[^>]*>.*?</script>", "", html_text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<style[^>]*>.*?</style>", "", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<p[^>]*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"</p>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<li[^>]*>", "\n• ", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = unescape(text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def _extract_text_filter(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return _strip_html_tags(value)
    if isinstance(value, dict):
        text_parts = []
        for v in value.values():
            if isinstance(v, str) and v:
                cleaned = _strip_html_tags(v)
                if cleaned and len(cleaned) > 1:
                    text_parts.append(cleaned)
        return " ".join(text_parts)
    if isinstance(value, list):
        text_parts = []
        for item in value:
            if isinstance(item, str):
                cleaned = _strip_html_tags(item)
                if cleaned:
                    text_parts.append(cleaned)
            elif isinstance(item, dict):
                for v in item.values():
                    if isinstance(v, str):
                        cleaned = _strip_html_tags(v)
                        if cleaned and len(cleaned) > 1:
                            text_parts.append(cleaned)
        return " ".join(text_parts)
    return str(value)


class StaticSiteGenerator:
    def __init__(self):
        self.output_dir = Path(settings.STATIC_SITE_OUTPUT_DIR)
        self.templates_dir = Path(__file__).parent.parent / "templates"
        self.assets_src = self.templates_dir / "assets"
        self.jinja_env = Environment(
            loader=FileSystemLoader(str(self.templates_dir)),
            autoescape=select_autoescape(["html", "xml"]),
        )
        self.jinja_env.filters["extract_text"] = _extract_text_filter

    def _url_for_lang(self, lang: str, suffix: str) -> str:
        base = settings.STATIC_SITE_BASE_URL.rstrip("/")
        suffix = suffix.lstrip("/")
        if suffix:
            return f"{base}/{lang}/{suffix}"
        return f"{base}/{lang}/"

    def _ensure_output_dir(self):
        self.output_dir.mkdir(parents=True, exist_ok=True)
        for lang in settings.SUPPORTED_LANGUAGES:
            (self.output_dir / lang).mkdir(exist_ok=True)
        assets_dst = self.output_dir / "assets"
        if assets_dst.exists():
            shutil.rmtree(assets_dst)
        if self.assets_src.exists():
            shutil.copytree(self.assets_src, assets_dst)

    def _asset_prefix(self) -> str:
        base = settings.STATIC_SITE_BASE_URL.rstrip("/")
        return f"{base}/assets"

    def _api_base_url(self) -> str:
        return settings.API_V1_PREFIX

    def _write_html(self, relative_path: str, html: str):
        full_path = self.output_dir / relative_path
        full_path.parent.mkdir(parents=True, exist_ok=True)
        full_path.write_text(html, encoding="utf-8")

    def _build_common_context(
        self,
        lang: str,
        content_types: List[Dict[str, Any]],
        page_path_suffix: str = "",
        lang_slug_map: Optional[Dict[str, str]] = None,
        content_type_slug: Optional[str] = None,
    ) -> Dict[str, Any]:
        def _get_lang_switch_path(target_lang: str) -> str:
            if lang_slug_map and content_type_slug:
                if target_lang in lang_slug_map:
                    return self._url_for_lang(target_lang, f"{content_type_slug}/{lang_slug_map[target_lang]}.html")
                else:
                    if content_type_slug:
                        return self._url_for_lang(target_lang, f"{content_type_slug}/")
                    return self._url_for_lang(target_lang, "")
            return self._url_for_lang(target_lang, page_path_suffix)

        return {
            "site_name": settings.PROJECT_NAME,
            "lang": lang,
            "lang_names": LANG_NAMES,
            "supported_languages": settings.SUPPORTED_LANGUAGES,
            "url_for_lang": self._url_for_lang,
            "get_lang_switch_path": _get_lang_switch_path,
            "asset_prefix": self._asset_prefix(),
            "api_base_url": self._api_base_url(),
            "page_path_suffix": page_path_suffix,
            "ui_text": _get_ui_text(lang),
            "content_types": content_types,
        }

    async def _fetch_content_types(self, db: AsyncSession) -> List[ContentType]:
        result = await db.execute(
            select(ContentType)
            .options(selectinload(ContentType.fields))
            .where(ContentType.is_active == True)
            .order_by(ContentType.name.asc())
        )
        return list(result.scalars().all())

    async def _fetch_published_entries(
        self,
        db: AsyncSession,
        content_type_id: Optional[int] = None,
        entry_id: Optional[int] = None,
        language_code: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> List[ContentEntry]:
        query = (
            select(ContentEntry)
            .options(
                selectinload(ContentEntry.translations).selectinload(EntryTranslation.published_version),
                selectinload(ContentEntry.content_type),
            )
            .where(ContentEntry.status == "published")
            .order_by(ContentEntry.published_at.desc(), ContentEntry.updated_at.desc())
        )
        if content_type_id:
            query = query.where(ContentEntry.content_type_id == content_type_id)
        if entry_id:
            query = query.where(ContentEntry.id == entry_id)
        if limit:
            query = query.limit(limit)
        result = await db.execute(query)
        entries = list(result.scalars().all())
        if language_code:
            filtered = []
            for e in entries:
                has_lang = any(
                    t.language_code == language_code and t.is_published and t.published_version_id
                    for t in e.translations
                )
                if has_lang:
                    filtered.append(e)
            return filtered
        return entries

    def _get_translation_for_lang(
        self, entry: ContentEntry, lang: str
    ) -> Optional[Dict[str, Any]]:
        for t in entry.translations:
            if t.language_code == lang and t.is_published and t.published_version:
                pv = t.published_version
                return {
                    "language_code": lang,
                    "title": pv.title,
                    "slug": pv.slug,
                    "field_values": pv.field_values or {},
                }
        for t in entry.translations:
            if t.is_published and t.published_version:
                pv = t.published_version
                return {
                    "language_code": t.language_code,
                    "title": pv.title,
                    "slug": pv.slug,
                    "field_values": pv.field_values or {},
                }
        return None

    def _get_all_translations(self, entry: ContentEntry) -> List[Dict[str, Any]]:
        result = []
        for t in entry.translations:
            if t.is_published and t.published_version:
                pv = t.published_version
                result.append({
                    "language_code": t.language_code,
                    "title": pv.title,
                    "slug": pv.slug,
                    "field_values": pv.field_values or {},
                })
        return result

    def _get_lang_slug_map(self, entry: ContentEntry) -> Dict[str, str]:
        slug_map = {}
        for t in entry.translations:
            if t.is_published and t.published_version and t.published_version.slug:
                slug_map[t.language_code] = t.published_version.slug
        return slug_map

    def _get_plain_summary(self, field_values: Dict[str, Any]) -> str:
        if not field_values:
            return ""
        priority_fields = ["summary", "description", "meta_description", "excerpt", "intro", "abstract"]
        for field_name in priority_fields:
            if field_name in field_values and field_values[field_name]:
                cleaned = _extract_text_filter(field_values[field_name])
                if cleaned:
                    return cleaned
        all_text = _extract_text_filter(field_values)
        return all_text[:300]

    def _build_field_info_map(self, content_type: ContentType, lang: str) -> Dict[str, Dict[str, Any]]:
        info_map = {}
        for f in content_type.fields:
            info_map[f.name] = {
                "type": f.field_type,
                "label": f.get_label(lang) if lang else f.label,
                "sort_order": f.sort_order,
            }
        return info_map

    def _serialize_entry_public(
        self,
        entry: ContentEntry,
        lang: str,
        all_languages: bool = False,
        content_type: Optional[ContentType] = None,
    ) -> Dict[str, Any]:
        trans = self._get_translation_for_lang(entry, lang)
        all_trans = self._get_all_translations(entry) if all_languages else None
        ct = content_type or entry.content_type
        field_info_map = self._build_field_info_map(ct, lang) if ct else {}
        plain_summary = ""
        if trans and trans.get("field_values"):
            plain_summary = self._get_plain_summary(trans["field_values"])
        return {
            "id": entry.id,
            "content_type_id": entry.content_type_id,
            "content_type_slug": ct.slug if ct else "",
            "status": entry.status,
            "current_version_number": entry.current_version_number,
            "published_at": entry.published_at.isoformat() if entry.published_at else None,
            "translation": trans,
            "translations": all_trans,
            "lang_slug_map": self._get_lang_slug_map(entry),
            "field_info_map": field_info_map,
            "plain_summary": plain_summary,
        }

    def _serialize_content_type_public(self, ct: ContentType, lang: Optional[str] = None) -> Dict[str, Any]:
        name = ct.get_name(lang) if lang else ct.name
        description = ct.get_description(lang) if lang else ct.description
        return {
            "id": ct.id,
            "name": name,
            "slug": ct.slug,
            "description": description,
            "fields": [
                {
                    "id": f.id,
                    "name": f.name,
                    "label": f.get_label(lang) if lang else f.label,
                    "field_type": f.field_type,
                    "is_required": f.is_required,
                    "is_translatable": f.is_translatable,
                    "options": f.options,
                    "description": f.get_description(lang) if lang else f.description,
                    "sort_order": f.sort_order,
                }
                for f in sorted(ct.fields, key=lambda x: x.sort_order)
            ],
        }

    async def _get_or_create_static_page(
        self,
        db: AsyncSession,
        page_path: str,
        page_type: str,
        content_type_slug: Optional[str],
        entry_id: Optional[int],
        language_code: str,
    ) -> StaticPage:
        result = await db.execute(select(StaticPage).where(StaticPage.page_path == page_path))
        page = result.scalar_one_or_none()
        if page:
            return page
        page = StaticPage(
            page_path=page_path,
            page_type=page_type,
            content_type_slug=content_type_slug,
            entry_id=entry_id,
            language_code=language_code,
        )
        db.add(page)
        await db.flush()
        return page

    async def _delete_static_pages_for_entry(
        self, db: AsyncSession, entry_id: int, language_code: Optional[str] = None
    ):
        query = select(StaticPage).where(
            and_(StaticPage.entry_id == entry_id, StaticPage.page_type == "detail")
        )
        if language_code:
            query = query.where(StaticPage.language_code == language_code)
        result = await db.execute(query)
        pages = list(result.scalars().all())
        for page in pages:
            file_path = self.output_dir / page.page_path
            if file_path.exists():
                try:
                    file_path.unlink()
                except OSError:
                    pass
            await db.delete(page)

    async def render_home_page(self, db: AsyncSession, lang: str) -> Tuple[str, str, Dict[str, Any]]:
        page_path = f"{lang}/index.html"
        content_types = await self._fetch_content_types(db)
        ct_public_localized = [self._serialize_content_type_public(ct, lang) for ct in content_types]
        recent_entries_raw = await self._fetch_published_entries(db, limit=10)
        recent_entries = [
            self._serialize_entry_public(e, lang)
            for e in recent_entries_raw
            if self._get_translation_for_lang(e, lang)
        ]
        ctx = self._build_common_context(
            lang,
            content_types=ct_public_localized,
            page_path_suffix="",
        )
        ctx.update({
            "recent_entries": recent_entries,
        })
        template = self.jinja_env.get_template("index.html")
        html = template.render(**ctx)
        content_data = {
            "lang": lang,
            "content_types": [ct.slug for ct in content_types],
            "recent_entry_ids": [e["id"] for e in recent_entries],
        }
        return page_path, html, content_data

    async def render_listing_page(
        self,
        db: AsyncSession,
        lang: str,
        content_type: ContentType,
        page: int = 1,
    ) -> Tuple[str, str, Dict[str, Any]]:
        all_content_types = await self._fetch_content_types(db)
        ct_public_localized = [self._serialize_content_type_public(ct, lang) for ct in all_content_types]

        all_entries_raw = await self._fetch_published_entries(
            db, content_type_id=content_type.id, language_code=lang
        )
        total_entries = len(all_entries_raw)
        total_pages = max(1, (total_entries + ENTRIES_PER_PAGE - 1) // ENTRIES_PER_PAGE)
        start_idx = (page - 1) * ENTRIES_PER_PAGE
        end_idx = start_idx + ENTRIES_PER_PAGE
        page_entries_raw = all_entries_raw[start_idx:end_idx]

        entries = [self._serialize_entry_public(e, lang) for e in page_entries_raw]

        if page == 1:
            page_path = f"{lang}/{content_type.slug}/index.html"
            page_suffix = f"{content_type.slug}/"
        else:
            page_path = f"{lang}/{content_type.slug}/page-{page}.html"
            page_suffix = f"{content_type.slug}/page-{page}.html"

        ctx = self._build_common_context(
            lang,
            content_types=ct_public_localized,
            page_path_suffix=page_suffix,
        )
        ct_public = self._serialize_content_type_public(content_type, lang)
        ctx.update({
            "content_type": ct_public,
            "entries": entries,
            "current_page": page,
            "total_pages": total_pages,
        })
        template = self.jinja_env.get_template("listing.html")
        html = template.render(**ctx)
        content_data = {
            "lang": lang,
            "content_type_slug": content_type.slug,
            "page": page,
            "entry_ids": [e["id"] for e in entries],
            "total_entries": total_entries,
        }
        return page_path, html, content_data

    async def render_detail_page(
        self,
        db: AsyncSession,
        lang: str,
        entry: ContentEntry,
        content_type: ContentType,
    ) -> Tuple[Optional[str], Optional[str], Optional[Dict[str, Any]]]:
        trans = self._get_translation_for_lang(entry, lang)
        if not trans or not trans.get("slug"):
            return None, None, None

        all_content_types = await self._fetch_content_types(db)
        ct_public_localized = [self._serialize_content_type_public(ct, lang) for ct in all_content_types]

        page_path = f"{lang}/{content_type.slug}/{trans['slug']}.html"
        entry_public = self._serialize_entry_public(entry, lang, all_languages=True)
        ct_public = self._serialize_content_type_public(content_type, lang)

        lang_slug_map = entry_public.get("lang_slug_map", {})

        ctx = self._build_common_context(
            lang,
            content_types=ct_public_localized,
            page_path_suffix=f"{content_type.slug}/{trans['slug']}.html",
            lang_slug_map=lang_slug_map,
            content_type_slug=content_type.slug,
        )
        ctx.update({
            "entry": entry_public,
            "content_type": ct_public,
        })
        template = self.jinja_env.get_template("detail.html")
        html = template.render(**ctx)
        content_data = {
            "lang": lang,
            "entry_id": entry.id,
            "content_type_slug": content_type.slug,
            "slug": trans["slug"],
            "title": trans["title"],
            "field_values": trans["field_values"],
        }
        return page_path, html, content_data

    async def generate_pages(
        self,
        content_type_slug: Optional[str] = None,
        entry_id: Optional[int] = None,
        language_code: Optional[str] = None,
        full_regeneration: bool = False,
    ) -> GenerateResult:
        if not settings.STATIC_SITE_ENABLED:
            return GenerateResult(errors=[{"message": "Static site generation is disabled"}])

        result = GenerateResult()
        self._ensure_output_dir()

        async with AsyncSessionLocal() as db:
            try:
                languages = (
                    [language_code] if language_code else list(settings.SUPPORTED_LANGUAGES)
                )
                languages = [l for l in languages if l in settings.SUPPORTED_LANGUAGES]

                content_types = await self._fetch_content_types(db)
                if content_type_slug:
                    content_types = [ct for ct in content_types if ct.slug == content_type_slug]

                target_entry = None
                if entry_id:
                    entries = await self._fetch_published_entries(db, entry_id=entry_id)
                    if entries:
                        target_entry = entries[0]

                for lang in languages:
                    if not content_type_slug and not entry_id:
                        page_path, html, content_data = await self.render_home_page(db, lang)
                        await self._try_write_page(
                            db, page_path, html, content_data, "home", None, None, lang, result, full_regeneration
                        )

                    for ct in content_types:
                        if not entry_id or (target_entry and target_entry.content_type_id == ct.id):
                            all_entries = await self._fetch_published_entries(
                                db, content_type_id=ct.id, language_code=lang
                            )
                            total_pages = max(1, (len(all_entries) + ENTRIES_PER_PAGE - 1) // ENTRIES_PER_PAGE)
                            for page_num in range(1, total_pages + 1):
                                page_path, html, content_data = await self.render_listing_page(
                                    db, lang, ct, page_num
                                )
                                await self._try_write_page(
                                    db,
                                    page_path,
                                    html,
                                    content_data,
                                    "listing",
                                    ct.slug,
                                    None,
                                    lang,
                                    result,
                                    full_regeneration,
                                )

                        if target_entry and target_entry.content_type_id == ct.id:
                            page_path, html, content_data = await self.render_detail_page(
                                db, lang, target_entry, ct
                            )
                            if page_path:
                                await self._try_write_page(
                                    db,
                                    page_path,
                                    html,
                                    content_data,
                                    "detail",
                                    ct.slug,
                                    target_entry.id,
                                    lang,
                                    result,
                                    full_regeneration,
                                )
                        elif not entry_id:
                            entries_for_ct = await self._fetch_published_entries(
                                db, content_type_id=ct.id, language_code=lang
                            )
                            for e in entries_for_ct:
                                page_path, html, content_data = await self.render_detail_page(
                                    db, lang, e, ct
                                )
                                if page_path:
                                    await self._try_write_page(
                                        db,
                                        page_path,
                                        html,
                                        content_data,
                                        "detail",
                                        ct.slug,
                                        e.id,
                                        lang,
                                        result,
                                        full_regeneration,
                                    )

                await db.commit()
            except Exception as exc:
                await db.rollback()
                result.failed += 1
                result.errors.append({"message": str(exc)})

        return result

    async def _try_write_page(
        self,
        db: AsyncSession,
        page_path: str,
        html: str,
        content_data: Dict[str, Any],
        page_type: str,
        content_type_slug: Optional[str],
        entry_id: Optional[int],
        language_code: str,
        result: GenerateResult,
        full_regeneration: bool,
    ):
        result.total += 1
        try:
            new_hash = StaticPage.compute_content_hash(content_data)
            page = await self._get_or_create_static_page(
                db, page_path, page_type, content_type_slug, entry_id, language_code
            )
            if not full_regeneration and page.content_hash == new_hash and page.is_generated:
                result.skipped += 1
                return

            self._write_html(page_path, html)
            page.content_hash = new_hash
            page.is_generated = True
            page.last_generated_at = datetime.utcnow()
            page.last_error = None
            result.generated += 1
            result.generated_pages.append(page_path)
        except Exception as exc:
            result.failed += 1
            result.errors.append({
                "page_path": page_path,
                "message": str(exc),
            })
            page = await self._get_or_create_static_page(
                db, page_path, page_type, content_type_slug, entry_id, language_code
            )
            page.last_error = str(exc)
            page.is_generated = False

    async def handle_entry_publish(
        self, entry_id: int, language_code: Optional[str] = None
    ) -> GenerateResult:
        if not settings.STATIC_SITE_AUTO_GENERATE:
            return GenerateResult()
        return await self.generate_pages(
            entry_id=entry_id,
            language_code=language_code,
            full_regeneration=False,
        )

    async def handle_entry_unpublish(
        self, entry_id: int, language_code: Optional[str] = None
    ) -> GenerateResult:
        result = GenerateResult()
        if not settings.STATIC_SITE_ENABLED:
            return result

        async with AsyncSessionLocal() as db:
            try:
                await self._delete_static_pages_for_entry(db, entry_id, language_code)
                entry = await db.get(ContentEntry, entry_id)
                if entry:
                    ct = await db.get(ContentType, entry.content_type_id)
                    if ct:
                        await self.generate_pages(
                            content_type_slug=ct.slug,
                            language_code=language_code,
                            full_regeneration=False,
                        )
                        if not language_code:
                            for lang in settings.SUPPORTED_LANGUAGES:
                                page_path, _, _ = await self.render_home_page(db, lang)
                                result.generated_pages.append(page_path)
                await db.commit()
            except Exception as exc:
                await db.rollback()
                result.failed += 1
                result.errors.append({"message": str(exc)})

        return result


_static_generator_instance: Optional[StaticSiteGenerator] = None


def get_static_generator() -> StaticSiteGenerator:
    global _static_generator_instance
    if _static_generator_instance is None:
        _static_generator_instance = StaticSiteGenerator()
    return _static_generator_instance
