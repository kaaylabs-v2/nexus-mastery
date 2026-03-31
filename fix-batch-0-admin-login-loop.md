# Batch 0: Fix Admin App Login Redirect Loop (Do This First)

> **PRIORITY**: BLOCKING — The admin app (localhost:3001) is completely unusable. It redirects to `/auth/login` which doesn't exist, causing a 404 loop.
> **ESTIMATED TIME**: 15 minutes
> **DEPENDENCIES**: None — do this before anything else.

---

## Root Cause

There are TWO problems causing the loop:

### Problem 1: 401 redirect goes to a page that doesn't exist

**File**: `apps/admin/src/lib/api-client.ts` — line 23-26

When any API call returns 401, the frontend redirects to `/auth/login`. But there is no `/auth/login` page in the admin app. This creates a 404 → the layout loads → tries another API call → gets 401 → redirects to `/auth/login` → 404 → infinite loop.

### Problem 2: 403 "No account found" redirect goes to onboarding

If the backend is running and DEV_AUTH=true, the dev token `dev:auth0|admin-james` is accepted, but `get_current_user()` in `services/api/app/middleware/auth.py` then looks up `auth0_sub == "auth0|admin-james"` in the database. If that user doesn't exist in the DB, it returns 403 with "No account found", which redirects to `/onboarding`.

---

## Fix (3 changes)

### Change 1: Remove the `/auth/login` redirect — it doesn't exist

**File**: `apps/admin/src/lib/api-client.ts`

```typescript
async function authRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers as Record<string, string>),
    },
  });
  if (response.status === 401) {
    _cachedToken = null;
    // DON'T redirect to /auth/login — that page doesn't exist.
    // Just throw so the page can show an error.
    throw new Error("Not authenticated. Is the backend running?");
  }
  if (response.status === 403) {
    const body = await response.json().catch(() => ({}));
    if (body.detail?.includes("No account found")) {
      if (typeof window !== "undefined") window.location.href = "/onboarding";
      throw new Error("Redirecting to onboarding");
    }
    throw new Error(body.detail || "Forbidden");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(body.detail || `API error ${response.status}`);
  }
  if (response.status === 204 || response.headers.get("content-length") === "0") {
    return {} as T;
  }
  return response.json();
}
```

The key change: **remove** `window.location.href = "/auth/login"` on line 25. Replace with `throw new Error(...)` so the page can display the error instead of entering a redirect loop.

### Change 2: Ensure the dev user exists in the database

**File**: `services/api/app/main.py` (or create a seed script)

Add a startup event that creates the dev admin user if DEV_AUTH is enabled and the user doesn't exist:

```python
from app.core.config import get_settings
from app.core.database import async_session_factory  # or however you create sessions
from app.models.user import User
from sqlalchemy import select

settings = get_settings()

@app.on_event("startup")
async def seed_dev_user():
    """Create dev users if DEV_AUTH is enabled and they don't exist."""
    if not settings.DEV_AUTH:
        return

    async with async_session_factory() as db:
        # Check if admin dev user exists
        result = await db.execute(
            select(User).where(User.auth0_sub == "auth0|admin-james")
        )
        if not result.scalar_one_or_none():
            # Create the dev admin user — adjust fields to match your User model
            admin = User(
                auth0_sub="auth0|admin-james",
                email="admin@dev.local",
                display_name="James (Dev Admin)",
                role="org_admin",
                # Set org_id to whatever your dev org is, or create one
            )
            db.add(admin)
            await db.commit()
            print("✓ Created dev admin user: auth0|admin-james")

        # Check if learner dev user exists
        result = await db.execute(
            select(User).where(User.auth0_sub == "auth0|learner-maria")
        )
        if not result.scalar_one_or_none():
            learner = User(
                auth0_sub="auth0|learner-maria",
                email="maria@dev.local",
                display_name="Maria (Dev Learner)",
                role="learner",
                # Same org_id as admin
            )
            db.add(learner)
            await db.commit()
            print("✓ Created dev learner user: auth0|learner-maria")

# NOTE: Adapt the above to match your actual User model fields and
# how you create async sessions. Check the existing code in database.py
# for the session factory name.
```

**IMPORTANT**: Look at the User model first (`services/api/app/models/user.py`) to see what fields are required (especially `org_id`). Also check if there's an existing Organization in the DB — the dev users need to belong to one. If there's no org, create one too.

### Change 3: Verify the backend is running with DEV_AUTH=true

Check the backend's `.env` file:
```bash
cat services/api/.env | grep DEV_AUTH
```
It must show `DEV_AUTH=true`. If it doesn't, add it.

Then restart the backend:
```bash
cd services/api
uvicorn app.main:app --reload --port 8000
```

---

## Verification (MANDATORY)

Do ALL of these:

```bash
# 1. Is the backend running and accepting dev tokens?
curl -s http://localhost:8000/api/courses \
  -H "Authorization: Bearer dev:auth0|admin-james" | head -c 200
# ✓ Must return JSON (course list or empty array), NOT a 401 or 403

# 2. Does the dev user exist in the DB?
curl -s http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer dev:auth0|admin-james" | python3 -m json.tool
# ✓ Must return user object with role "org_admin", NOT "No account found"

# 3. Does the admin app load?
curl -s http://localhost:3001 | head -c 500
# ✓ Must return HTML with "Nexus Admin Studio" in title

# 4. Open http://localhost:3001 in a browser — NO /auth/login redirect
# ✓ Dashboard must load. If the browser still redirects, clear cache:
#    - Open DevTools → Application → Storage → Clear Site Data
#    - OR open in incognito window
```

## Done criteria
- `curl` to backend with dev token returns 200 (not 401 or 403)
- Admin app at localhost:3001 loads the dashboard (not a 404 or redirect loop)
- No `window.location.href = "/auth/login"` anywhere in the codebase
