# Auth0 Login/Logout — Claude Code Prompt

> **Context**: Nexus² Mastery Platform. Both the admin app (`apps/admin/`) and learner app (`apps/web/`) currently use hardcoded dev tokens. There is no login page, no logout, no signup, and no access control. Anyone with the URL can access everything. This prompt adds real Auth0 authentication to both apps.

> **THE RULE: Do NOT mark this done until you have actually tested the login flow — open the browser, verify redirect to Auth0, log in, verify the dashboard loads, verify the logout button works. Show proof.**

---

## What Already Exists

**Backend (DONE — do not change):**
- `/services/api/app/core/security.py` — Full Auth0 JWT RS256 verification with JWKS caching. Dev auth bypass (`dev:` prefix tokens) when `DEV_AUTH=true`.
- `/services/api/app/middleware/auth.py` — `get_current_user()` looks up User by `auth0_sub`, returns 404 if not found. `require_role()` for RBAC.
- `/services/api/app/core/config.py` — Has `AUTH0_DOMAIN`, `AUTH0_API_AUDIENCE`, `AUTH0_ALGORITHMS`, `AUTH0_CLIENT_ID`, `DEV_AUTH` settings.

**Learner app (`apps/web/`):**
- `@auth0/nextjs-auth0` is already installed (v4.16.0)
- `src/lib/auth.ts` has `USE_MOCK` flag and mock users
- `src/lib/api-client.ts` uses a hardcoded token via `setToken()`

**Admin app (`apps/admin/`):**
- `@auth0/nextjs-auth0` is NOT installed
- `src/lib/api-client.ts` uses hardcoded `DEV_TOKEN = "dev:auth0|admin-james"`
- No auth middleware, no login page, no session management

---

## Step 1: Install Auth0 SDK in Admin App

```bash
cd apps/admin && npm install @auth0/nextjs-auth0
```

---

## Step 2: Add Auth0 Route Handlers

These give both apps `/api/auth/login`, `/api/auth/logout`, `/api/auth/callback`, `/api/auth/me` for free.

**Create**: `apps/admin/src/app/api/auth/[auth0]/route.ts`
```typescript
import { handleAuth } from "@auth0/nextjs-auth0";
export const GET = handleAuth();
```

**Check if exists**: `apps/web/src/app/api/auth/[auth0]/route.ts`
If it doesn't exist, create it with the same content.

---

## Step 3: Wrap Both Apps in UserProvider

**File**: `apps/admin/src/app/layout.tsx`

```typescript
import { UserProvider } from "@auth0/nextjs-auth0/client";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <UserProvider>
          {/* existing layout content */}
        </UserProvider>
      </body>
    </html>
  );
}
```

**File**: `apps/web/src/app/layout.tsx`

Same — wrap the body content in `<UserProvider>`. Keep the existing `<LearnerProvider>` inside it:
```typescript
<UserProvider>
  <LearnerProvider>
    {/* existing layout */}
  </LearnerProvider>
</UserProvider>
```

---

## Step 4: Add Auth Middleware — Gate All Pages

Unauthenticated users must be redirected to Auth0 login. The middleware intercepts every page request except the auth callback routes.

**Create**: `apps/admin/src/middleware.ts`
```typescript
import { withMiddlewareAuthRequired } from "@auth0/nextjs-auth0/edge";

export default withMiddlewareAuthRequired();

export const config = {
  matcher: [
    // Match all routes except auth API routes and static files
    "/((?!api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
```

**Create**: `apps/web/src/middleware.ts`
Same content.

**What this does**: When a user visits any page without being logged in, they get redirected to Auth0's hosted login page. After they authenticate, Auth0 redirects them back to `/api/auth/callback`, which creates a session, and then sends them to the original page they were trying to visit.

---

## Step 5: Pass Real Auth0 Token to Backend API Calls

Both apps need to get the Auth0 access token from the session and include it in API requests to the FastAPI backend.

### Admin App

**File**: `apps/admin/src/lib/api-client.ts`

The admin app needs to get the access token from Auth0 and pass it as a Bearer token. Since the admin pages are client components, use a token-fetching approach:

```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// For dev mode fallback
const DEV_MODE = process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true";
const DEV_TOKEN = "dev:auth0|admin-james";

async function getToken(): Promise<string> {
  if (DEV_MODE) return DEV_TOKEN;

  // Fetch token from the Auth0 session via our API route
  try {
    const res = await fetch("/api/auth/token");
    if (res.ok) {
      const data = await res.json();
      return data.accessToken;
    }
  } catch {}

  // If no token available, redirect to login
  window.location.href = "/api/auth/login";
  throw new Error("Not authenticated");
}

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
    window.location.href = "/api/auth/login";
    throw new Error("Session expired");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(body.detail || `API error ${response.status}`);
  }
  return response.json();
}

// Keep the same authMultipart function but update it to use getToken() too
async function authMultipart<T>(path: string, files: File[]): Promise<T> {
  const token = await getToken();
  const formData = new FormData();
  files.forEach((f) => formData.append("files", f));
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
  return response.json();
}

// ... rest of adminApi object stays the same
```

**Create**: `apps/admin/src/app/api/auth/token/route.ts`

This server-side route extracts the access token from the Auth0 session and returns it to client components:

```typescript
import { getAccessToken } from "@auth0/nextjs-auth0";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { accessToken } = await getAccessToken();
    return NextResponse.json({ accessToken });
  } catch {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
}
```

### Learner App

**File**: `apps/web/src/lib/api-client.ts`

Apply the same pattern — replace the hardcoded token with a `getToken()` function that fetches from the Auth0 session. Keep the `USE_MOCK` fallback for dev mode.

**Create**: `apps/web/src/app/api/auth/token/route.ts`
Same as admin app.

---

## Step 6: Tenant Signup Flow — New Org Onboarding

This is the entry point for the entire platform. A new company comes to Nexus², signs up, becomes a tenant, and the person who signs up becomes the first admin.

### 6a. Backend: Signup endpoint

**Create**: `POST /api/auth/signup` — this is a PUBLIC endpoint (no auth required, since the user doesn't have an account yet).

**File**: `/services/api/app/routers/auth.py`

Add a signup endpoint:

```python
from pydantic import BaseModel, EmailStr

class SignupRequest(BaseModel):
    org_name: str          # Company name
    admin_name: str        # Person's name
    admin_email: str       # Their email
    auth0_sub: str         # Their Auth0 sub (passed from frontend after Auth0 signup)

@router.post("/signup")
async def signup(
    data: SignupRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create a new org + first admin user. Called after Auth0 signup."""

    # Check org slug doesn't already exist
    slug = data.org_name.lower().replace(" ", "-").replace(".", "")
    existing = await db.execute(select(Organization).where(Organization.slug == slug))
    if existing.scalar_one_or_none():
        raise HTTPException(400, "Organization name already taken")

    # Check user doesn't already exist
    existing_user = await db.execute(select(User).where(User.email == data.admin_email))
    if existing_user.scalar_one_or_none():
        raise HTTPException(400, "User with this email already exists")

    # Create org
    org = Organization(
        name=data.org_name,
        slug=slug,
        plan_tier=PlanTier.starter,
        settings={"branding": {"primary_color": "#0D9488"}},
    )
    db.add(org)
    await db.flush()

    # Create admin user
    admin = User(
        email=data.admin_email,
        display_name=data.admin_name,
        role=UserRole.org_admin,
        org_id=org.id,
        auth0_sub=data.auth0_sub,
    )
    db.add(admin)
    await db.commit()

    return {
        "org_id": str(org.id),
        "user_id": str(admin.id),
        "org_name": org.name,
        "role": "org_admin",
    }
```

### 6b. Frontend: Signup/Onboarding Page

**Create**: `apps/admin/src/app/onboarding/page.tsx`

This page appears ONLY when a user logs in through Auth0 but has no existing account (the backend returns 403 "No account found"). Instead of showing the 403 error, redirect to this page.

The page should have:
- A clean, friendly form: "Welcome to Nexus². Let's set up your organization."
- Fields: Organization name, Your full name (pre-filled from Auth0 profile if available)
- One button: "Create Organization"
- On submit: calls `POST /api/auth/signup` with the org name, admin name, admin email (from Auth0 session), and auth0_sub
- On success: redirects to the admin dashboard

```tsx
"use client";
import { useUser } from "@auth0/nextjs-auth0/client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function OnboardingPage() {
  const { user } = useUser();
  const router = useRouter();
  const [orgName, setOrgName] = useState("");
  const [fullName, setFullName] = useState(user?.name || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // Get the Auth0 sub from the token
      const tokenRes = await fetch("/api/auth/token");
      const { accessToken } = await tokenRes.json();

      // Decode sub from token (or pass it from the user object)
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_name: orgName,
          admin_name: fullName,
          admin_email: user?.email,
          auth0_sub: user?.sub,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.detail || "Signup failed");
        return;
      }

      router.push("/");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md p-8">
        <div className="flex items-center gap-2 mb-8">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-sm font-bold text-primary-foreground">N</div>
          <span className="font-display text-lg font-semibold">Nexus²</span>
        </div>
        <h1 className="text-xl font-display font-semibold mb-2">Welcome to Nexus²</h1>
        <p className="text-sm text-muted-foreground mb-6">Let's set up your organization.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium">Organization name</label>
            <input
              type="text" required value={orgName} onChange={(e) => setOrgName(e.target.value)}
              placeholder="Acme Corp"
              className="w-full mt-1 rounded-lg border border-border bg-card px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Your name</label>
            <input
              type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)}
              className="w-full mt-1 rounded-lg border border-border bg-card px-3 py-2 text-sm"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {loading ? "Creating..." : "Create Organization"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

### 6c. Handle the 403 → Onboarding redirect

Update the admin API client so when it gets a 403 "No account found", it redirects to `/onboarding` instead of showing an error:

```typescript
// In authRequest function:
if (response.status === 403) {
  const body = await response.json().catch(() => ({}));
  if (body.detail?.includes("No account found")) {
    window.location.href = "/onboarding";
    throw new Error("Redirecting to onboarding");
  }
}
```

### 6d. Exclude onboarding from auth middleware

The onboarding page needs to be accessible to authenticated Auth0 users who don't have a Nexus² account yet:

```typescript
// apps/admin/src/middleware.ts
export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|onboarding).*)",
  ],
};
```

Wait — actually the onboarding page DOES need Auth0 auth (the user must be logged in to Auth0 so we know their email and sub). So keep the middleware protecting it. The redirect happens after Auth0 login, when the first API call to the backend returns 403.

### 6e. The full tenant signup flow

Here's how it works end-to-end:

1. **New admin visits** `admin.nexusmastery.com`
2. **Auth0 middleware** kicks in → redirects to Auth0 login/signup page
3. **User signs up** through Auth0 (creates Auth0 account)
4. **Auth0 redirects back** to the admin app with a session
5. **Admin app loads dashboard** → first API call includes Auth0 token → backend looks up `auth0_sub` → not found → returns 403 "No account found"
6. **Frontend catches 403** → redirects to `/onboarding`
7. **Onboarding page** shows the friendly "Set up your org" form
8. **Admin fills in org name** → submits → `POST /api/auth/signup` creates Organization + User
9. **Redirects to dashboard** → now the API calls work because the User record exists
10. **Admin invites team** → `POST /api/admin/users/invite` creates pending users
11. **Team members sign in** → Auth0 → backend matches email to invite → linked → they're in the Arena

---

## Step 7: Auto-Provision Invited Users on First Login (already in Step 6 context)

When someone signs in through Auth0 for the first time, the backend looks up their `auth0_sub` — but they don't have a User record yet (they were "invited" with a pending sub). Link them.

**File**: `/services/api/app/middleware/auth.py`

Update `get_current_user`:

```python
async def get_current_user(
    token_payload: dict = Depends(verify_token),
    db: AsyncSession = Depends(get_db),
) -> User:
    auth0_sub = token_payload.get("sub")
    if not auth0_sub:
        raise HTTPException(status_code=401, detail="Invalid token: missing sub claim")

    # Look up by auth0_sub
    result = await db.execute(select(User).where(User.auth0_sub == auth0_sub))
    user = result.scalar_one_or_none()

    if user:
        return user

    # User not found by sub — check for a pending invite by email
    email = token_payload.get("email") or token_payload.get(
        f"https://{settings.AUTH0_DOMAIN}/email", ""
    )

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
        status_code=403,
        detail="No account found. Contact your organization admin for an invite.",
    )
```

This means:
- Admin invites `alice@acme.com` → creates User with `auth0_sub="auth0|pending-xxxx"`
- Alice signs in through Auth0 → backend sees her email matches the invite → links her real Auth0 sub
- Random person signs in with Auth0 but wasn't invited → 403 "Contact your admin"

---

## Step 7: Add Logout Button

### Admin App

Add a logout button at the bottom of the sidebar.

**File**: `apps/admin/src/app/layout.tsx`

In the sidebar `<aside>`, add below the nav:

```tsx
"use client"; // The layout needs to become a client component for useUser

import { useUser } from "@auth0/nextjs-auth0/client";

// Inside the sidebar, after the nav items:
<div className="mt-auto pt-4 border-t border-sidebar-border">
  {user && (
    <div className="px-3 py-2">
      <p className="text-xs font-medium text-foreground truncate">{user.name}</p>
      <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
    </div>
  )}
  <a href="/api/auth/logout"
     className="block rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
    Log out
  </a>
</div>
```

**Note**: If the layout is a server component (has `export const metadata`), you'll need to extract the sidebar into a separate client component. The layout itself can stay as a server component, but the sidebar (which uses `useUser`) needs to be a client component.

### Learner App

Add logout to the learner sidebar or top bar, same pattern.

---

## Step 8: Environment Variables

**Create**: `apps/admin/.env.local`
```
AUTH0_SECRET=<generate-a-random-32-char-string>
AUTH0_BASE_URL=http://localhost:3001
AUTH0_ISSUER_BASE_URL=https://<your-auth0-domain>
AUTH0_CLIENT_ID=<your-client-id>
AUTH0_CLIENT_SECRET=<your-client-secret>
AUTH0_AUDIENCE=<your-api-audience>
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_USE_MOCK_DATA=false
```

**Create/Update**: `apps/web/.env.local`
```
AUTH0_SECRET=<same-or-different-secret>
AUTH0_BASE_URL=http://localhost:3000
AUTH0_ISSUER_BASE_URL=https://<your-auth0-domain>
AUTH0_CLIENT_ID=<your-client-id>
AUTH0_CLIENT_SECRET=<your-client-secret>
AUTH0_AUDIENCE=<your-api-audience>
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_USE_MOCK_DATA=false
```

**Backend** `.env` (already exists, verify these are set):
```
AUTH0_DOMAIN=<your-auth0-domain>
AUTH0_API_AUDIENCE=<your-api-audience>
DEV_AUTH=false
```

**IMPORTANT**: For Auth0 to work, you need to configure the Auth0 application's:
- Allowed Callback URLs: `http://localhost:3000/api/auth/callback, http://localhost:3001/api/auth/callback`
- Allowed Logout URLs: `http://localhost:3000, http://localhost:3001`
- Allowed Web Origins: `http://localhost:3000, http://localhost:3001`

---

## Step 9: Dev Mode Must Still Work

When developing without Auth0, the dev bypass must still function.

**Backend**: When `DEV_AUTH=true`, the `dev:auth0|admin-james` token format still works (this already works in security.py).

**Frontend**: When `NEXT_PUBLIC_USE_MOCK_DATA=true`, both apps should skip the Auth0 middleware and use hardcoded dev tokens. Update the middleware to check for this:

```typescript
// apps/admin/src/middleware.ts
import { withMiddlewareAuthRequired } from "@auth0/nextjs-auth0/edge";
import { NextResponse } from "next/server";

const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true";

export default USE_MOCK
  ? () => NextResponse.next()  // Skip auth in dev mode
  : withMiddlewareAuthRequired();

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
```

Same for `apps/web/src/middleware.ts`.

---

## Step 10: VERIFY — Actually Test This

### Test 1: Dev mode still works
```bash
# Set NEXT_PUBLIC_USE_MOCK_DATA=true in .env.local, restart the app
# Visit http://localhost:3001 — should load dashboard without login
# API calls with dev token should work:
curl -s http://localhost:8000/api/courses -H "Authorization: Bearer dev:auth0|admin-james"
# MUST return courses
```

### Test 2: Auth0 login works
```bash
# Set NEXT_PUBLIC_USE_MOCK_DATA=false (or remove it), restart the app
# Visit http://localhost:3001 in browser
# MUST redirect to Auth0 login page
# Log in with a valid Auth0 user
# MUST redirect back to the admin dashboard
# The dashboard should load with real data (not 401 errors)
```

### Test 3: Logout works
```
# Click the logout button in the sidebar
# MUST redirect to Auth0 logout, then back to the login page
# Visiting http://localhost:3001 again should redirect to login (session cleared)
```

### Test 4: New tenant signup (THE FULL ONBOARDING FLOW)
```
# 1. Open the admin app in an incognito/private browser window
# 2. You should be redirected to Auth0 login
# 3. Click "Sign up" on Auth0 (create a NEW Auth0 account with a fresh email)
# 4. Auth0 redirects back to admin app
# 5. First API call returns 403 → frontend redirects to /onboarding
# 6. You should see the "Welcome to Nexus²" onboarding form
# 7. Enter an org name and your name → click "Create Organization"
# 8. You should be redirected to the admin dashboard
# 9. The dashboard should load with 0 programs, 0 learners (fresh org)
```

Also verify the signup API directly:
```bash
curl -s -X POST http://localhost:8000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"org_name": "Test Corp", "admin_name": "Test Admin", "admin_email": "test@testcorp.com", "auth0_sub": "auth0|test123"}' \
  | python -m json.tool
# MUST return org_id, user_id, org_name, role: "org_admin"

# Duplicate org name rejected:
curl -s -X POST http://localhost:8000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"org_name": "Test Corp", "admin_name": "Another", "admin_email": "another@testcorp.com", "auth0_sub": "auth0|test456"}'
# MUST return 400 "Organization name already taken"
```

### Test 5: Admin invites team, team member signs in
```bash
# As the new org admin, invite a team member:
curl -s -X POST http://localhost:8000/api/admin/users/invite \
  -H "Authorization: Bearer dev:auth0|test123" \
  -H "Content-Type: application/json" \
  -d '{"email": "learner@testcorp.com", "role": "learner"}'
# MUST return user with status "invited"

# Now simulate that learner logging in through Auth0:
# The learner signs up on Auth0 with learner@testcorp.com
# When they hit the backend, the pending invite is found by email
# Their auth0_sub is linked → they're in
# They should see the Arena (learner app), not the admin studio
```

### Test 6: Uninvited user is rejected
```
# Log in with an Auth0 account that has NOT been invited and hasn't signed up as an org
# The backend should return 403 "No account found"
# The admin frontend should redirect to /onboarding (they can create their own org)
# The learner frontend should show "Contact your organization admin for an invite"
```

### Test 7: Invited user auto-provisions
```bash
# First, invite a user via the Acme org (seed data):
curl -s -X POST http://localhost:8000/api/admin/users/invite \
  -H "Authorization: Bearer dev:auth0|admin-james" \
  -H "Content-Type: application/json" \
  -d '{"email": "the-email-you-will-log-in-with@example.com", "role": "learner"}'

# Now log in through Auth0 with that email
# MUST: user record is linked, learner dashboard loads, no 403
```

### Test 8: Both apps work with real auth
```
# Admin app (localhost:3001): login → dashboard with programs, stats → invite users → logout
# Learner app (localhost:3000): login (with invited email) → dashboard → start session → logout
# Both use the same Auth0 tenant but show different data based on role
```

### Test 9: Learner cannot access admin app
```
# Log in to the admin app as a user with role "learner"
# Every admin API call should return 403
# The admin app should show an error or redirect, not the dashboard
```

## DO NOT:
- Say "Auth0 is configured" without actually opening the browser and logging in
- Skip the tenant signup test — this is the entry point for the entire platform
- Skip the uninvited user test — this is a security requirement
- Leave the dev mode broken — both modes (dev + Auth0) must work
- Hardcode any Auth0 credentials in source code — use .env.local only
- Forget to test the FULL FLOW: signup → create org → invite team → team member logs in
