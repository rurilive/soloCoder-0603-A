from fastapi import APIRouter
from . import content_types, fields, entries, public, users, translation, static_generation

api_router = APIRouter()

api_router.include_router(content_types.router, prefix="/content-types", tags=["content_types"])
api_router.include_router(fields.router, prefix="/fields", tags=["fields"])
api_router.include_router(entries.router, prefix="/entries", tags=["entries"])
api_router.include_router(public.router, prefix="/public", tags=["public"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(translation.router, prefix="/translation", tags=["translation"])
api_router.include_router(static_generation.router, prefix="/static-site", tags=["static_site"])
