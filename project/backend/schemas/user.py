from datetime import datetime

from pydantic import BaseModel, EmailStr

from models.user import UserRole


class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    role: UserRole = UserRole.candidate


class UserRead(BaseModel):
    id: int
    name: str
    email: str
    role: UserRole
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class UserLogin(BaseModel):
    email: str
    password: str


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserRead


class TokenRefresh(BaseModel):
    refresh_token: str


class TokenRefreshResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
