# Phase 4: Admin Studio Backend + Integration

## P0: Fix Existing Bugs
- [x] 0b. Add Program models to models/__init__.py
- [x] 0c. Add auth to voice WebSocket (token from query param, conversation history, session mode progression, mastery profile context)
- [x] 0d. Fix enrollment count response key mismatch (enrollment_count → count)

## P1: New Models + Migration
- [x] 1a. Create CourseFile model
- [x] 1b. Create IngestionJob model
- [x] 1c. Modify Course model (source_type, ai_generated_metadata, published_at, program_id FK)
- [x] 1d. Register all models in __init__.py
- [x] 1e. Create Alembic migration (a002_admin — applied)

## P2: Program CRUD Endpoints
- [x] 2a. POST /api/programs (create)
- [x] 2b. PUT /api/programs/{id} (update)
- [x] 2c. DELETE /api/programs/{id} (delete + cascade)
- [x] 2d. POST /api/programs/{id}/domains (add domain with capabilities)
- [x] 2e. POST /api/programs/{id}/scenarios (add focus session)
- [x] 2f. Program CRUD schemas

## P3: File Storage + Course Generator + Ingestion
- [x] 3a. File storage service (per-tenant, validation, CRUD)
- [x] 3b. Course generator service (Claude Sonnet analyzes → structured JSON)
- [x] 3c. Ingestion pipeline (BackgroundTasks — extract → analyze → create Course+Program)
- [x] 3d. Add UPLOAD_DIR + MAX_UPLOAD_SIZE_MB to config

## P4: Admin API Routes + Schemas
- [x] 4a. Admin router — file upload/delete, course generation, ingestion polling
- [x] 4b. User management — list (with enrollment counts), invite, bulk CSV import, role change
- [x] 4c. Analytics — overview (learners, programs, completion), per-course stats
- [x] 4d. Org settings — update name, branding
- [x] 4e. All Pydantic schemas (admin.py — 12 schemas)
- [x] 4f. Register admin router in main.py (45 routes total)

## P5: Rebuild Admin Frontend
- [x] 5a. Fetch Arena admin reference pages
- [x] 5b. Full typed admin API client (120+ lines, all endpoints)
- [x] 5c. AdminDashboard — stats cards, top programs with progress bars (real API)
- [x] 5d. AdminPrograms — program cards with level/progress (real API)
- [x] 5e. AdminProgramDetail — 3 tabs: scenarios, dimensions, milestones (real API)
- [x] 5f. AdminUploadPipeline — 4-stage pipeline: upload → process → preview → complete (real API)
- [x] 5g. AdminUsers — table with search, invite dialog, CSV bulk import (real API)
- [x] 5h. AdminAnalytics — bar chart + pie chart + program breakdown table (real API)
- [x] 5i. AdminSettings — general (name, brand color) + SSO placeholder + defaults placeholder

## P6: Tests
- [x] 6a. Backend verified via curl — admin users (200), analytics (200), RBAC learner blocked (403), program CRUD (201)
- [x] 6b. Frontend: learner app 22 unit tests pass, builds zero errors

## P7: Docker Config
- [x] 7a. Add uploads_data volume to docker-compose
- [x] 7b. UPLOAD_DIR already in config.py (default ./uploads)

## Review
_(To be filled after completion)_
