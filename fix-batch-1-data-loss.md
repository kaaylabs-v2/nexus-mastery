# Batch 1: Stop Data Loss — Missing db.commit() Calls

> **PRIORITY**: CRITICAL — Do this first. Every write operation below silently loses data.
> **ESTIMATED TIME**: Under 1 hour
> **DEPENDENCIES**: None
> **RULE**: After each fix, verify with curl that the write actually persists across a server restart. No fix is done until you see proof.

---

## What's happening

Multiple endpoints call `db.add()`, `db.delete()`, or mutate ORM objects, then return a success response without ever calling `await db.commit()`. The user sees "success" but the database transaction rolls back. Data is silently lost.

---

## Fix 1: `services/api/app/routers/admin.py`

Find and fix these 4 locations:

**publish_course** — add `await db.commit()` before the return statement:
```python
course.published_at = datetime.now(timezone.utc)
course.status = CourseStatus.active
await db.commit()  # ← ADD
return {"status": "published"}
```

**unpublish_course** — same pattern:
```python
course.published_at = None
course.status = CourseStatus.draft
await db.commit()  # ← ADD
return {"status": "draft"}
```

**change_user_role** — same pattern:
```python
target.role = UserRole(role)
await db.commit()  # ← ADD
return {"id": str(target.id), "role": role}
```

**update_org_settings** — same pattern:
```python
# After the settings mutation, before return:
await db.commit()  # ← ADD
return {"status": "updated"}
```

---

## Fix 2: `services/api/app/routers/programs.py`

**DELETE /programs/{program_id}** — add commit after delete:
```python
await db.delete(program)
await db.commit()  # ← ADD
```

**POST /programs/{program_id}/domains** — add commit after the capability creation loop:
```python
for cap in domain_in.capabilities:
    db.add(Capability(...))
await db.commit()  # ← ADD
```

**PUT /programs/{program_id}** — change flush to commit:
```python
# Replace: await db.flush()
# With:
await db.commit()
```

---

## Fix 3: `services/api/app/routers/courses.py`

**DELETE /{course_id}** — add commit after delete:
```python
await db.delete(course)
await db.commit()  # ← ADD
```

**PUT /{course_id}** — change flush to commit:
```python
# Replace: await db.flush()
# With:
await db.commit()
```

---

## Fix 4: `services/api/app/routers/enrollments.py`

**unenroll** — add commit after delete:
```python
await db.delete(enrollment)
await db.commit()  # ← ADD
```

---

## Fix 5: `services/api/app/routers/conversations.py`

**add_message endpoint** — add commit and flag_modified for JSONB:
```python
from sqlalchemy.orm.attributes import flag_modified

conversation.messages = messages
flag_modified(conversation, "messages")  # ← ADD (required for JSONB mutation detection)
await db.flush()
await db.commit()  # ← ADD
await db.refresh(conversation)
```

---

## Fix 6: `services/api/app/routers/orgs.py`

**PUT /me** — change flush to commit:
```python
# Replace: await db.flush()
# With:
await db.commit()
```

---

## Fix 7: `services/api/app/services/file_storage.py`

**delete_file** — add commit after delete:
```python
await db.delete(cf)
await db.commit()  # ← ADD
```

---

## Fix 8: `services/api/app/services/mastery_service.py`

**update_mastery_profile** — add commit:
```python
await db.flush()
await db.commit()  # ← ADD
return profile
```

---

## Verification (MANDATORY)

Start the server and run these tests. Every one must pass.

```bash
# 1. Publish a course → restart server → verify it's still published
curl -X POST http://localhost:8000/api/admin/courses/<COURSE_ID>/publish \
  -H "Authorization: Bearer <TOKEN>"
# Restart the server
curl http://localhost:8000/api/courses/<COURSE_ID> -H "Authorization: Bearer <TOKEN>"
# ✓ status must be "active", NOT "draft"

# 2. Delete a program → restart → verify it's gone
curl -X DELETE http://localhost:8000/api/programs/<PROGRAM_ID> \
  -H "Authorization: Bearer <TOKEN>"
# Restart the server
curl http://localhost:8000/api/programs/<PROGRAM_ID> -H "Authorization: Bearer <TOKEN>"
# ✓ Must return 404

# 3. Change user role → restart → verify it persists
curl -X PATCH http://localhost:8000/api/admin/users/<USER_ID>/role \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"role": "facilitator"}'
# Restart the server
curl http://localhost:8000/api/admin/users/<USER_ID> -H "Authorization: Bearer <TOKEN>"
# ✓ role must be "facilitator"

# 4. Send a message in conversation → restart → verify it's still there
curl -X POST http://localhost:8000/api/conversations/<CONV_ID>/messages \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"content": "test message"}'
# Restart the server
curl http://localhost:8000/api/conversations/<CONV_ID> -H "Authorization: Bearer <TOKEN>"
# ✓ messages array must contain "test message"
```

## Done criteria
- All 8 fixes applied
- Server starts without errors
- All 4 verification tests pass
- No data is lost across server restarts
