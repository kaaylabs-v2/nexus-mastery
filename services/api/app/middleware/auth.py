from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import verify_token
from app.core.database import get_db
from app.models.user import User


async def get_current_user(
    token_payload: dict = Depends(verify_token),
    db: AsyncSession = Depends(get_db),
) -> User:
    auth0_sub = token_payload.get("sub")
    if not auth0_sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: missing sub claim",
        )

    # Look up by auth0_sub
    result = await db.execute(select(User).where(User.auth0_sub == auth0_sub))
    user = result.scalar_one_or_none()

    if user:
        return user

    # User not found — check for a pending invite by email
    email = token_payload.get("email", "")
    if email:
        invite_result = await db.execute(
            select(User).where(
                User.email == email,
                User.auth0_sub.startswith("auth0|pending-"),
            )
        )
        invited_user = invite_result.scalar_one_or_none()

        if invited_user:
            # Link the invite to the real Auth0 identity
            invited_user.auth0_sub = auth0_sub
            invited_user.display_name = token_payload.get("name", invited_user.display_name)
            await db.commit()
            return invited_user

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="No account found. Contact your organization admin for an invite.",
    )


async def require_role(required_role: str):
    async def role_checker(user: User = Depends(get_current_user)) -> User:
        if user.role.value != required_role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires {required_role} role",
            )
        return user
    return role_checker
