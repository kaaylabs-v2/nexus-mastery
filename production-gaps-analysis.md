# Nexus² — Production Readiness Gap Analysis

> What's missing to ship this as a complete B2B SaaS application.
> Organized by priority: Critical → High → Medium → Nice-to-Have

---

## CRITICAL — Must have before any real users

### 1. Auth0 Login Flow (Frontend)
**Status**: Auth0 is configured backend-side (JWT verification, JWKS, roles) but the frontend login/logout flow is incomplete.

**Missing**:
- Login page / Auth0 Universal Login redirect
- Callback handler (`/api/auth/callback`)
- Logout endpoint + redirect
- Token refresh on page reload (currently loses auth on refresh)
- Protected route wrapper (redirect to login if no token)
- Role-based route guards (admin routes → require org_admin)

**Why critical**: Nobody can actually log in right now.

---

### 2. Email Service
**Status**: Zero email capability.

**Missing**:
- Email provider integration (SendGrid / Resend / AWS SES)
- User invitation emails (admin invites → learner gets onboarding email)
- Password reset flow (if not using Auth0 Universal Login)
- Session notifications (optional but expected in B2B)
- Email templates (branded, per-org customizable)

**Why critical**: Admin "Invite User" button does nothing without this.

---

### 3. CI/CD Pipeline
**Status**: No automation whatsoever.

**Missing**:
- GitHub Actions workflows:
  - `test.yml` — run backend pytest + frontend vitest on PR
  - `e2e.yml` — run Playwright on merge to main
  - `deploy.yml` — build + deploy to staging/production
- Docker image building + registry push
- Environment-specific configs (dev/staging/prod)
- Branch protection rules (require passing tests)

**Why critical**: Manual deployments = broken deployments.

---

### 4. Rate Limiting
**Status**: No rate limiting on any endpoint.

**Missing**:
- Redis-backed rate limiter (slowapi or custom)
- Per-user limits on AI endpoints (expensive Claude calls)
- Per-IP limits on auth endpoints (brute force protection)
- Per-org limits for fair usage across tenants

**Why critical**: One bad actor could run up your Claude bill or DoS the API.

---

### 5. Logging & Error Tracking
**Status**: Zero observability.

**Missing**:
- Structured logging (JSON format, request IDs, user context)
- Error tracking service (Sentry — catches unhandled exceptions, stack traces)
- Request logging middleware (method, path, status, duration, user_id)
- AI call logging (model used, token count, latency — for cost tracking)

**Why critical**: When something breaks in production, you'll have no idea why.

---

### 6. Payment & Billing
**Status**: `PlanTier` enum exists (free/starter/professional/enterprise) but zero payment logic.

**Missing**:
- Stripe integration (subscriptions, payment methods, invoices)
- Webhook handler for Stripe events (payment_succeeded, subscription_cancelled, etc.)
- Usage metering (sessions per month, learners per org, storage per tenant)
- Plan enforcement middleware (block actions if over limit)
- Billing settings page in Admin Studio
- Trial/onboarding flow (14-day free trial → upgrade prompt)

**Why critical**: No revenue = no business.

---

## HIGH PRIORITY — Needed before beta launch

### 7. Security Headers
**Missing**:
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- Content-Security-Policy
- Strict-Transport-Security (HSTS)
- X-XSS-Protection
- Referrer-Policy

**Add**: FastAPI middleware or a `secure` package.

---

### 8. Frontend Error Handling
**Missing**:
- React Error Boundary (catch render crashes, show fallback UI)
- Custom 404 page (`not-found.tsx` in Next.js)
- Custom 500 page (`error.tsx`)
- Toast notifications for API errors (sonner)
- Loading skeleton states on every page
- Retry logic on failed API calls

---

### 9. Input Validation (Frontend)
**Missing**:
- Zod schemas for all forms
- Client-side validation before API calls
- Form libraries (react-hook-form already in Arena deps)
- Sanitization of user inputs

---

### 10. WebSocket Resilience
**Current**: WebSocket works but has no resilience.

**Missing**:
- Auto-reconnection on disconnect (exponential backoff)
- Heartbeat/ping-pong to detect dead connections
- Message queue/buffer for offline periods
- Connection state indicator in UI ("Reconnecting...")
- Graceful degradation (fall back to HTTP polling if WS fails)

---

### 11. API Documentation
**Status**: FastAPI has auto-generated OpenAPI docs but unclear if `/docs` endpoint is exposed.

**Missing**:
- Ensure `/docs` (Swagger UI) is accessible in dev
- Disable in production or put behind auth
- API changelog/versioning strategy
- Developer documentation for integration partners

---

### 12. Database Hardening
**Missing**:
- Explicit connection pool tuning (`pool_size`, `max_overflow`, `pool_timeout`)
- Read replicas for analytics queries (heavy aggregate queries shouldn't hit primary)
- Automated backups (pg_dump cron or managed DB backup)
- Point-in-time recovery setup
- Database indexes on hot query paths:
  - `content_embeddings(course_id)` — RAG retrieval
  - `enrollments(user_id, course_id)` — unique lookups
  - `conversations(user_id, course_id)` — session history
  - `users(org_id, role)` — admin user listing
  - `courses(org_id, status)` — course filtering

---

### 13. Secrets Management
**Current**: `.env.local` with hardcoded secrets including `AUTH0_SECRET=change-in-production`.

**Missing**:
- Production secrets vault (AWS Secrets Manager / Doppler / 1Password for CI)
- Secret rotation strategy
- No secrets in git (`.gitignore` for `.env*`)
- Separate secrets per environment

---

## MEDIUM PRIORITY — Needed for production quality

### 14. Frontend Accessibility (WCAG 2.1)
**Missing**:
- Zero `aria-*` attributes detected across the entire codebase
- No `alt` attributes on images
- No `role` attributes on interactive elements
- No skip navigation links
- No focus management after route transitions
- No keyboard navigation testing
- No screen reader testing

**Impact**: Potential legal liability (ADA compliance), excludes users with disabilities.

---

### 15. Data Privacy & Compliance
**Missing**:
- Privacy Policy page
- Terms of Service page
- Cookie consent banner
- Data export endpoint (user requests their data — GDPR Article 15)
- Data deletion endpoint (right to be forgotten — GDPR Article 17)
- Data processing agreement (DPA) template for B2B customers
- Audit log (who accessed what, when — SOC 2 requirement)

**Impact**: Cannot sell to EU companies or US enterprises with compliance requirements.

---

### 16. Org Onboarding Flow
**Missing**:
- Self-service org registration (sign up → create org → choose plan)
- Org setup wizard (name, branding, first course upload)
- First admin invite flow
- Trial activation
- Welcome email sequence

**Currently**: Orgs must be created via seed script or API call.

---

### 17. Notification System
**Missing**:
- In-app notifications (bell icon, notification dropdown)
- Real-time notifications via WebSocket
- Notification preferences (email, in-app, none)
- Notification types: session reminders, mastery milestones, new course available, invite accepted
- Push notifications (mobile, if PWA)

---

### 18. Search & Filtering
**Missing** across multiple pages:
- Global search (across courses, sessions, users)
- Course search with filters (domain, difficulty, status)
- Conversation history search
- Journal search
- Admin: user search, course search, activity search

---

### 19. Test Coverage
**Current**: Tests exist but coverage is low and there are gaps.

**Missing**:
- Coverage reports + thresholds (enforce >80%)
- Integration tests (API → DB round-trip)
- Load testing (k6 or locust — how many concurrent Nexi sessions?)
- Voice WebSocket E2E tests
- Multi-tenant isolation tests (verify org A can't see org B data)
- Playwright tests for admin flows (upload, invite, publish)

---

### 20. Deployment Configuration
**Missing**:
- Production Dockerfile optimizations (multi-stage builds, non-root user)
- Docker Compose for production (separate from dev)
- Kubernetes manifests (if going k8s) or Railway/Fly.io/Vercel configs
- Health check endpoints that verify dependencies (DB reachable, Redis reachable, Claude API key valid)
- Graceful shutdown handlers (SIGTERM → finish in-flight requests → close DB connections)

---

## NICE-TO-HAVE — Polish & scale

### 21. Analytics & Metrics
- Prometheus metrics endpoint (`/metrics`)
- Grafana dashboards (API latency, error rates, AI call costs)
- Business metrics tracking (DAU, session completion, mastery progression)
- Cost analytics (Claude API spend per org)

### 22. CDN & Performance
- Static asset CDN (Cloudflare/CloudFront)
- Image optimization (Next.js `<Image>` component)
- Bundle analysis (next-bundle-analyzer)
- API response caching (Redis cache for analytics endpoints)

### 23. Internationalization (i18n)
- Multi-language support (if expanding beyond English)
- Date/number formatting by locale
- RTL support

### 24. Mobile App
- React Native or PWA
- Offline-capable session mode
- Push notifications

### 25. API Versioning
- Version prefix (`/api/v1/...`)
- Deprecation headers
- Breaking change policy

---

## Summary Scorecard

| Category | Completeness | Blocking? |
|----------|:---:|:---:|
| Core AI (Nexi + RAG + Voice) | 90% | No |
| Learner Frontend | 85% | No |
| Admin Frontend (Arena) | 80% | No |
| Backend API & Models | 80% | No |
| Multi-Tenancy | 85% | No |
| Privacy Enforcement | 90% | No |
| **Auth Login Flow** | **30%** | **YES** |
| **Email Service** | **0%** | **YES** |
| **CI/CD** | **0%** | **YES** |
| **Rate Limiting** | **0%** | **YES** |
| **Logging/Monitoring** | **0%** | **YES** |
| **Payments/Billing** | **0%** | **YES** |
| Security Headers | 10% | Soon |
| Error Handling (FE) | 20% | Soon |
| Accessibility | 0% | Medium |
| Compliance (GDPR) | 0% | Medium |
| Documentation | 15% | Medium |
| Test Coverage | 50% | Medium |
| Deployment/DevOps | 30% | Medium |
