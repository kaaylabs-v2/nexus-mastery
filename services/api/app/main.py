from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.core.config import get_settings
from app.routers import auth, courses, conversations, orgs, mastery, programs, voice, admin, enrollments, notebook

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    yield
    # Shutdown


app = FastAPI(
    title="Nexus² Mastery Platform API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

from app.middleware.audit_log import AuditLogMiddleware
app.add_middleware(AuditLogMiddleware)

app.include_router(auth.router)
app.include_router(courses.router)
app.include_router(conversations.router)
app.include_router(orgs.router)
app.include_router(mastery.router)
app.include_router(programs.router)
app.include_router(voice.router)
app.include_router(admin.router)
app.include_router(enrollments.router)
app.include_router(notebook.router)


# Serve generated thumbnails
static_dir = Path(__file__).parent.parent / "static" / "thumbnails"
static_dir.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(static_dir.parent)), name="static")


@app.get("/health")
async def health():
    return {"status": "ok"}
