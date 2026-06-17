from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import create_access_token, get_current_user, hash_password, require_role, verify_password
from app.database import get_db
from app.models import User, UserRole
from app.schemas import Token, UserCreate, UserLogin, UserOut

router = APIRouter()


@router.post("/register", response_model=UserOut)
async def register(body: UserCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where((User.username == body.username) | (User.email == body.email)))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username or email already exists")

    user = User(
        username=body.username,
        email=body.email,
        password_hash=hash_password(body.password),
        role=UserRole.user,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/login", response_model=Token)
async def login(body: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    return Token(access_token=token)


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("/agents", response_model=list[UserOut])
async def list_agents(
    current_user: User = Depends(require_role(UserRole.agent, UserRole.admin)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.role.in_([UserRole.agent, UserRole.admin])))
    return result.scalars().all()
