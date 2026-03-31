# Batch 2: Security Fixes — Do Before Any External Users

> **PRIORITY**: HIGH — Must be done before anyone outside your team touches the app.
> **ESTIMATED TIME**: 1-2 hours
> **DEPENDENCIES**: Batch 1 should be done first (commits need to work for auth changes to persist).
> **RULE**: After each fix, verify the vulnerability is actually closed. Try to exploit it — if you can, it's not fixed.

---

## Fix 1: Disable DEV_AUTH by default

**File**: `services/api/app/core/config.py`

The `DEV_AUTH` flag is `True` by default, which means anyone can bypass Auth0 by passing `dev:anything` as a token.

```python
# Find:
DEV_AUTH: bool = True

# Replace with:
import os
DEV_AUTH: bool = os.getenv("DEV_AUTH", "false").lower() == "true"
```

This way dev auth only works when you explicitly set `DEV_AUTH=true` in your environment. Production deployments without this env var will reject dev tokens.

**VERIFY**:
```bash
# Without DEV_AUTH=true in environment:
curl http://localhost:8000/api/courses -H "Authorization: Bearer dev:auth0|admin-james"
# ✓ Must return 401 Unauthorized

# With DEV_AUTH=true (for local dev):
DEV_AUTH=true python -m uvicorn app.main:app
curl http://localhost:8000/api/courses -H "Authorization: Bearer dev:auth0|admin-james"
# ✓ Must return 200 OK
```

---

## Fix 2: Add WebSocket authentication

**File**: `services/api/app/routers/conversations.py`

The WebSocket endpoint at `/{conversation_id}/stream` accepts connections without verifying who the user is or whether they own the conversation. Any user can read any conversation by guessing the UUID.

Find the `conversation_stream` WebSocket handler and add auth:

```python
@router.websocket("/{conversation_id}/stream")
async def conversation_stream(websocket: WebSocket, conversation_id: UUID):
    await websocket.accept()

    # 1. Extract token from query params (WebSockets can't use headers reliably)
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Missing auth token")
        return

    # 2. Verify the token
    try:
        payload = await verify_token(token)
    except Exception:
        await websocket.close(code=4001, reason="Invalid auth token")
        return

    # 3. Get user from token
    db = async_session()  # or however you get a session
    try:
        user = await get_user_from_token(payload, db)
        if not user:
            await websocket.close(code=4001, reason="User not found")
            return

        # 4. Verify user owns this conversation
        conversation = (await db.execute(
            select(Conversation)
            .where(Conversation.id == conversation_id)
            .where(Conversation.user_id == user.id)  # ← KEY CHECK
        )).scalar_one_or_none()

        if not conversation:
            await websocket.close(code=4004, reason="Conversation not found")
            return

        # ... rest of the existing handler, using this verified conversation
    finally:
        await db.close()
```

Also update the frontend WebSocket connection to pass the token:

**File**: `apps/web/src/hooks/useArenaSocket.ts`
```typescript
// Find where the WebSocket URL is constructed and add the token:
const token = await getAccessToken();
const wsUrl = `${WS_BASE}/conversations/${conversationId}/stream?token=${token}`;
```

**VERIFY**:
```bash
# Try connecting without a token:
websocat ws://localhost:8000/api/conversations/<ID>/stream
# ✓ Must be rejected with code 4001

# Try connecting with a valid token but someone else's conversation:
websocat "ws://localhost:8000/api/conversations/<OTHER_USERS_CONV>/stream?token=<YOUR_TOKEN>"
# ✓ Must be rejected with code 4004
```

---

## Fix 3: Remove hardcoded dev tokens from frontend source

**File**: `apps/web/src/lib/api-client.ts`
**File**: `apps/admin/src/lib/api-client.ts`

Both files contain hardcoded dev tokens like `dev:auth0|learner-maria` and `dev:auth0|admin-james` as fallbacks. If the Auth0 token fetch fails, these kick in and bypass real auth.

```typescript
// Find any lines like:
const token = await getToken() || "dev:auth0|learner-maria";
// Or:
headers: { Authorization: `Bearer dev:auth0|admin-james` }

// Replace with:
const token = await getToken();
if (!token) {
  throw new Error("Not authenticated. Please sign in.");
}
headers: { Authorization: `Bearer ${token}` }
```

Search the entire codebase for any remaining dev tokens:
```bash
grep -r "dev:auth0" apps/ --include="*.ts" --include="*.tsx"
# ✓ Must return zero results
```

---

## Fix 4: Remove .env.local files from git

**File**: `apps/web/.env.local` and `apps/admin/.env.local`

These contain Auth0 client secrets in plaintext. They should never be in version control.

```bash
# Add to .gitignore
echo "apps/web/.env.local" >> .gitignore
echo "apps/admin/.env.local" >> .gitignore

# Remove from git tracking (keeps the files locally)
git rm --cached apps/web/.env.local 2>/dev/null
git rm --cached apps/admin/.env.local 2>/dev/null

# Create example files with placeholder values
cp apps/web/.env.local apps/web/.env.local.example
cp apps/admin/.env.local apps/admin/.env.local.example

# Replace real secrets with placeholders in the example files
sed -i 's/AUTH0_SECRET=.*/AUTH0_SECRET=your-auth0-secret-here/' apps/web/.env.local.example
sed -i 's/AUTH0_SECRET=.*/AUTH0_SECRET=your-auth0-secret-here/' apps/admin/.env.local.example
sed -i 's/AUTH0_CLIENT_SECRET=.*/AUTH0_CLIENT_SECRET=your-client-secret-here/' apps/web/.env.local.example
sed -i 's/AUTH0_CLIENT_SECRET=.*/AUTH0_CLIENT_SECRET=your-client-secret-here/' apps/admin/.env.local.example

git add .gitignore apps/web/.env.local.example apps/admin/.env.local.example
git commit -m "Remove secrets from git, add .env.local.example files"
```

**VERIFY**:
```bash
git status
# ✓ .env.local files should NOT appear as tracked
grep -r "AUTH0_SECRET" apps/web/.env.local.example
# ✓ Should show placeholder, not real secret
```

---

## Fix 5: Restrict CORS configuration

**File**: `services/api/app/main.py`

Currently CORS allows all methods and all headers with credentials — this is overly permissive.

```python
# Find:
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Replace with:
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Org-ID", "X-Request-ID"],
)
```

---

## Fix 6: Add file upload validation

**File**: `services/api/app/routers/admin.py` — the upload endpoint

Currently accepts any file type with no size limit. Add validation:

```python
from pathlib import Path

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md", ".pptx", ".xlsx", ".csv"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB

# At the top of the upload handler, before any processing:
ext = Path(file.filename).suffix.lower()
if ext not in ALLOWED_EXTENSIONS:
    raise HTTPException(
        status_code=400,
        detail=f"File type '{ext}' not supported. Allowed types: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
    )

# Read content and check size
content = await file.read()
if len(content) > MAX_FILE_SIZE:
    raise HTTPException(
        status_code=400,
        detail=f"File too large ({len(content) // (1024*1024)}MB). Maximum size: {MAX_FILE_SIZE // (1024*1024)}MB"
    )
await file.seek(0)  # Reset for downstream processing
```

**VERIFY**:
```bash
# Upload a .exe file — must be rejected
curl -X POST http://localhost:8000/api/admin/upload \
  -H "Authorization: Bearer <TOKEN>" \
  -F "file=@test.exe"
# ✓ Must return 400 with "not supported" message

# Upload a 100MB file — must be rejected
dd if=/dev/zero of=/tmp/big.pdf bs=1M count=100
curl -X POST http://localhost:8000/api/admin/upload \
  -H "Authorization: Bearer <TOKEN>" \
  -F "file=@/tmp/big.pdf"
# ✓ Must return 400 with "too large" message
```

---

## Done criteria
- DEV_AUTH defaults to False — dev tokens rejected without env var
- WebSocket verifies token AND user ownership of conversation
- Zero hardcoded dev tokens in frontend source code (`grep -r "dev:auth0" apps/` returns nothing)
- .env.local files removed from git, .example files created
- CORS restricted to specific methods and headers
- File uploads validated for type and size
- All existing functionality still works with proper auth
