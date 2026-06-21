from typing import Optional
from fastapi import Header, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from .database import get_db
from ..models.user import User, Role, Permission, RolePermission


async def get_current_user_id(
    x_user_id: Optional[int] = Header(None, description="当前登录用户ID"),
) -> Optional[int]:
    return x_user_id


async def get_current_user(
    user_id: Optional[int] = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    if not user_id:
        return None
    result = await db.execute(
        select(User)
        .options(
            selectinload(User.roles)
            .selectinload(Role.permissions)
            .selectinload(RolePermission.permission),
        )
        .where(User.id == user_id)
    )
    return result.scalar_one_or_none()


async def require_current_user(
    user: Optional[User] = Depends(get_current_user),
) -> User:
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未登录或用户不存在",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="用户账号已被禁用",
        )
    return user


class RequireRole:
    def __init__(self, *roles: str):
        self.roles = roles

    async def __call__(
        self,
        user: User = Depends(require_current_user),
    ) -> User:
        if not any(user.has_role(role) for role in self.roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"需要以下角色之一: {', '.join(self.roles)}",
            )
        return user


class RequirePermission:
    def __init__(self, *permissions: str):
        self.permissions = permissions

    async def __call__(
        self,
        user: User = Depends(require_current_user),
    ) -> User:
        if not any(user.has_permission(perm) for perm in self.permissions):
            if not any(user.has_role("admin") for _ in [1]):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"需要以下权限之一: {', '.join(self.permissions)}",
                )
        return user
