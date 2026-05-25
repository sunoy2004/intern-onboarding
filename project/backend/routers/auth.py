from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import create_access_token, create_refresh_token, get_current_active_user
from models.user import User
from schemas.user import UserLogin, UserRead, Token, TokenRefresh, TokenRefreshResponse
from passlib.context import CryptContext

router = APIRouter(prefix="/auth", tags=["auth"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


@router.post("/login", response_model=Token)
async def login(body: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user or not pwd_context.verify(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User account is deactivated")

    access_token = create_access_token(data={"sub": user.id, "role": user.role.value})
    refresh_token = create_refresh_token(data={"sub": user.id, "role": user.role.value})

    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        user=UserRead.model_validate(user),
    )


@router.post("/refresh", response_model=TokenRefreshResponse)
async def refresh_token(body: TokenRefresh, db: AsyncSession = Depends(get_db)):
    from jose import jwt, JWTError
    from config import get_settings
    settings = get_settings()

    try:
        payload = jwt.decode(body.refresh_token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
        user_id = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    access_token = create_access_token(data={"sub": user.id, "role": user.role.value})
    return TokenRefreshResponse(access_token=access_token, token_type="bearer")


@router.get("/me", response_model=UserRead)
async def get_me(current_user: User = Depends(get_current_active_user)):
    return UserRead.model_validate(current_user)
