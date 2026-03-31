from fastapi import Depends
from app.middleware.auth import get_current_user
from app.models.user import User
from uuid import UUID


async def get_current_org_id(
    user: User = Depends(get_current_user),
) -> UUID:
    return user.org_id
