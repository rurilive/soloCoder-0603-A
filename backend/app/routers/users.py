from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..core.database import get_db
from ..core.deps import require_current_user, RequireRole
from ..core.security import hash_password, verify_password
from ..models.user import User, Role, Permission, RolePermission
from ..schemas.user import (
    UserCreate,
    UserUpdate,
    UserResponse,
    UserWithPermissionsResponse,
    UserRolesUpdate,
    RoleCreate,
    RoleUpdate,
    RoleResponse,
    RoleWithPermissionsResponse,
    RolePermissionsUpdate,
    PermissionCreate,
    PermissionResponse,
    LoginRequest,
    LoginResponse,
)

router = APIRouter()


@router.post("/login", response_model=LoginResponse)
async def login(
    data: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User)
        .options(
            selectinload(User.roles).selectinload(Role.permissions).selectinload(RolePermission.permission),
        )
        .where(User.username == data.username)
    )
    user = result.scalar_one_or_none()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="用户账号已被禁用",
        )

    all_permissions = []
    for role in user.roles:
        for rp in role.permissions:
            all_permissions.append(rp.permission)

    return LoginResponse(
        user=UserWithPermissionsResponse(
            **UserResponse.model_validate(user).model_dump(),
            permissions=all_permissions,
        ),
        roles=[r.name for r in user.roles],
    )


@router.get("/me", response_model=UserWithPermissionsResponse)
async def get_me(
    user: User = Depends(require_current_user),
):
    all_permissions = []
    for role in user.roles:
        for rp in role.permissions:
            all_permissions.append(rp.permission)

    return UserWithPermissionsResponse(
        **UserResponse.model_validate(user).model_dump(),
        permissions=all_permissions,
    )


@router.get("/", response_model=List[UserResponse])
async def list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    is_active: Optional[bool] = Query(None),
    role: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(RequireRole("admin", "editor")),
):
    query = select(User).options(selectinload(User.roles)).order_by(User.created_at.desc())

    if is_active is not None:
        query = query.where(User.is_active == is_active)

    if role:
        query = query.where(User.roles.any(Role.name == role))

    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    return list(result.scalars().all())


@router.get("/translators", response_model=List[UserResponse])
async def list_translators(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(RequireRole("admin", "editor", "reviewer")),
):
    query = (
        select(User)
        .options(selectinload(User.roles))
        .where(User.is_active == True)
        .where(User.roles.any(Role.name.in_(["translator", "admin"])))
        .order_by(User.full_name.asc())
    )
    result = await db.execute(query)
    return list(result.scalars().all())


@router.get("/reviewers", response_model=List[UserResponse])
async def list_reviewers(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(RequireRole("admin", "editor")),
):
    query = (
        select(User)
        .options(selectinload(User.roles))
        .where(User.is_active == True)
        .where(User.roles.any(Role.name.in_(["reviewer", "admin"])))
        .order_by(User.full_name.asc())
    )
    result = await db.execute(query)
    return list(result.scalars().all())


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(RequireRole("admin")),
):
    result = await db.execute(
        select(User).options(selectinload(User.roles)).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return user


@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    data: UserCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(RequireRole("admin")),
):
    username_result = await db.execute(select(User).where(User.username == data.username))
    if username_result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="用户名已存在")

    email_result = await db.execute(select(User).where(User.email == data.email))
    if email_result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="邮箱已存在")

    user = User(
        username=data.username,
        email=data.email,
        full_name=data.full_name,
        hashed_password=hash_password(data.password),
        is_active=data.is_active,
        avatar=data.avatar,
        language_preference=data.language_preference,
    )

    if data.role_ids:
        roles_result = await db.execute(select(Role).where(Role.id.in_(data.role_ids)))
        roles = list(roles_result.scalars().all())
        user.roles = roles

    db.add(user)
    await db.commit()
    await db.refresh(user)

    result = await db.execute(
        select(User).options(selectinload(User.roles)).where(User.id == user.id)
    )
    return result.scalar_one()


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_current_user),
):
    if current_user.id != user_id and not current_user.has_role("admin"):
        raise HTTPException(status_code=403, detail="无权修改其他用户信息")

    result = await db.execute(
        select(User).options(selectinload(User.roles)).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    update_data = data.model_dump(exclude_unset=True)

    if "password" in update_data and update_data["password"]:
        update_data["hashed_password"] = hash_password(update_data.pop("password"))

    if "email" in update_data and update_data["email"] != user.email:
        email_result = await db.execute(
            select(User).where(User.email == update_data["email"], User.id != user_id)
        )
        if email_result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="邮箱已被其他用户使用")

    for key, value in update_data.items():
        setattr(user, key, value)

    await db.commit()
    await db.refresh(user)
    return user


@router.post("/{user_id}/roles", response_model=UserResponse)
async def assign_roles(
    user_id: int,
    data: UserRolesUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(RequireRole("admin")),
):
    user_result = await db.execute(
        select(User).options(selectinload(User.roles)).where(User.id == user_id)
    )
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    roles_result = await db.execute(select(Role).where(Role.id.in_(data.role_ids)))
    roles = list(roles_result.scalars().all())
    if len(roles) != len(data.role_ids):
        raise HTTPException(status_code=400, detail="部分角色不存在")

    user.roles = roles
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/{user_id}/activate", response_model=UserResponse)
async def activate_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(RequireRole("admin")),
):
    result = await db.execute(
        select(User).options(selectinload(User.roles)).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    user.is_active = True
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/{user_id}/deactivate", response_model=UserResponse)
async def deactivate_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(RequireRole("admin")),
):
    result = await db.execute(
        select(User).options(selectinload(User.roles)).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    user.is_active = False
    await db.commit()
    await db.refresh(user)
    return user


@router.get("/roles/", response_model=List[RoleWithPermissionsResponse])
async def list_roles(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(RequireRole("admin")),
):
    result = await db.execute(
        select(Role)
        .options(selectinload(Role.permissions).selectinload(RolePermission.permission))
        .order_by(Role.name.asc())
    )
    roles = list(result.scalars().all())
    return [
        RoleWithPermissionsResponse(
            **RoleResponse.model_validate(role).model_dump(),
            permissions=[rp.permission for rp in role.permissions],
        )
        for role in roles
    ]


@router.post("/roles/", response_model=RoleResponse, status_code=status.HTTP_201_CREATED)
async def create_role(
    data: RoleCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(RequireRole("admin")),
):
    existing = await db.execute(select(Role).where(Role.name == data.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="角色名已存在")
    role = Role(**data.model_dump())
    db.add(role)
    await db.commit()
    await db.refresh(role)
    return role


@router.put("/roles/{role_id}", response_model=RoleResponse)
async def update_role(
    role_id: int,
    data: RoleUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(RequireRole("admin")),
):
    result = await db.execute(select(Role).where(Role.id == role_id))
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="角色不存在")

    update_data = data.model_dump(exclude_unset=True)
    if "name" in update_data and update_data["name"] != role.name:
        existing = await db.execute(
            select(Role).where(Role.name == update_data["name"], Role.id != role_id)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="角色名已存在")

    for key, value in update_data.items():
        setattr(role, key, value)

    await db.commit()
    await db.refresh(role)
    return role


@router.post("/roles/{role_id}/permissions", response_model=RoleWithPermissionsResponse)
async def set_role_permissions(
    role_id: int,
    data: RolePermissionsUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(RequireRole("admin")),
):
    role_result = await db.execute(
        select(Role)
        .options(selectinload(Role.permissions).selectinload(RolePermission.permission))
        .where(Role.id == role_id)
    )
    role = role_result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="角色不存在")

    perms_result = await db.execute(select(Permission).where(Permission.id.in_(data.permission_ids)))
    permissions = {p.id: p for p in perms_result.scalars().all()}

    existing_rps = {rp.permission_id: rp for rp in role.permissions}

    for perm_id in data.permission_ids:
        if perm_id not in permissions:
            raise HTTPException(status_code=400, detail=f"权限 {perm_id} 不存在")
        if perm_id not in existing_rps:
            rp = RolePermission(role_id=role_id, permission_id=perm_id)
            db.add(rp)

    for perm_id, rp in existing_rps.items():
        if perm_id not in data.permission_ids:
            await db.delete(rp)

    await db.commit()

    result = await db.execute(
        select(Role)
        .options(selectinload(Role.permissions).selectinload(RolePermission.permission))
        .where(Role.id == role_id)
    )
    role = result.scalar_one()
    return RoleWithPermissionsResponse(
        **RoleResponse.model_validate(role).model_dump(),
        permissions=[rp.permission for rp in role.permissions],
    )


@router.get("/permissions/", response_model=List[PermissionResponse])
async def list_permissions(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(RequireRole("admin")),
):
    result = await db.execute(select(Permission).order_by(Permission.codename.asc()))
    return list(result.scalars().all())


@router.post("/permissions/", response_model=PermissionResponse, status_code=status.HTTP_201_CREATED)
async def create_permission(
    data: PermissionCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(RequireRole("admin")),
):
    existing_codename = await db.execute(select(Permission).where(Permission.codename == data.codename))
    if existing_codename.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="权限标识已存在")

    existing_name = await db.execute(select(Permission).where(Permission.name == data.name))
    if existing_name.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="权限名称已存在")

    permission = Permission(**data.model_dump())
    db.add(permission)
    await db.commit()
    await db.refresh(permission)
    return permission
