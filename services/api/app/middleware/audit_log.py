"""Security audit logging middleware."""

import logging
import time
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

audit_logger = logging.getLogger("audit")


class AuditLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.time()
        response = await call_next(request)
        duration = time.time() - start

        # Log admin actions and auth attempts
        path = request.url.path
        if path.startswith("/api/admin") or path.startswith("/api/auth"):
            audit_logger.info(
                f"method={request.method} path={path} "
                f"status={response.status_code} duration={duration:.3f}s "
                f"ip={request.client.host if request.client else 'unknown'}"
            )
        return response
