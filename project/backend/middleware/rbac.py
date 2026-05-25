from fastapi import Depends, HTTPException, status

from dependencies import get_current_user
from models.user import User, UserRole


def require_roles(*roles: str):
    """FastAPI dependency that checks JWT user's role is in the allowed list."""
    async def role_checker(current_user: User = Depends(get_current_user)):
        if current_user.role.value not in roles and current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role: {', '.join(roles)}"
            )
        return current_user
    return role_checker
