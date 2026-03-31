# Nexus² Mastery Platform

Adaptive mastery learning system where learners develop thinking skills through Socratic AI conversations with Nexi.

## Structure

```
nexus-mastery/
├── apps/web/          # Next.js learner web app
├── apps/admin/        # Next.js admin dashboard
├── services/api/      # FastAPI backend
├── packages/shared-types/  # TypeScript shared types
└── infra/             # Docker Compose (Postgres + Redis)
```

## Getting Started

```bash
# Start infrastructure
cd infra && docker compose up -d

# Start API
cd services/api && pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload

# Start web app (Phase 2)
cd apps/web && pnpm dev
```
