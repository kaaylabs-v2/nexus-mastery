# Nexus² B2C Consumer Version — Future Phase Spec

> **Status**: PARKED — build this after B2B is fully working with auth, upload pipeline, and sessions verified end-to-end.

> **Context**: The B2B version has org admins who upload content and invite learners. The B2C version is for individual consumers — they sign up directly, browse a course library, and can also upload their own materials to generate personal courses.

---

## How B2C Differs from B2B

| Aspect | B2B (Current) | B2C (This Spec) |
|--------|---------------|-----------------|
| Signup | Admin creates org → invites team | Individual signs up directly |
| Courses | Admin uploads/creates for their org | Pre-built library + user-uploaded |
| Pricing | Org-level plans (starter/pro/enterprise) | Free tier + individual paid plans |
| Multi-tenancy | Org-scoped, data isolated per tenant | No org — user is the tenant |
| Content | Private to the org | Public library + private user content |
| Admin Studio | Full org management dashboard | Not needed — user manages their own stuff |

---

## Core Features

### 1. Individual Signup (No Org Required)

A new user visits the site, signs up with Auth0 (email/password or social login), and lands on their personal dashboard immediately. No org creation, no invite flow.

**Backend change**: The `User` model currently requires `org_id` (NOT NULL). For B2C users, either:
- Create a "personal" org automatically for each B2C user (simplest — reuses all existing org-scoped queries)
- Or make `org_id` nullable and add a `user_type` field ("b2b" vs "b2c")

Recommendation: **auto-create a personal org** per B2C user. This means zero changes to the existing query layer — everything that filters by `org_id` still works. The "org" is just the user themselves.

### 2. Pre-Built Course Library

A curated set of high-quality courses available to all B2C users. Some free, some paid.

**Course categories and examples:**

**Free Tier (available to all):**

- **AI & Technology**
  - "AI for Everyone: Understanding What's Actually Happening" — demystifies LLMs, transformers, and generative AI without requiring a CS degree
  - "Prompt Engineering Fundamentals" — how to get the most out of AI tools in your daily work

- **Personal Finance**
  - "Money Basics: Budgeting, Saving, and Investing 101" — compound interest, emergency funds, index funds, avoiding common traps
  - "Understanding Credit and Debt" — credit scores, interest rates, good debt vs bad debt

- **Career Skills**
  - "Your First Job Interview" — preparation, common questions, how to talk about yourself
  - "Email and Communication at Work" — professional writing, when to email vs message vs call

**Paid Tier (subscription required):**

- **Business & Entrepreneurship**
  - "Starting a Business: From Idea to First Revenue" — validation, MVPs, customer discovery, pricing
  - "Understanding Financial Statements" — reading P&L, balance sheets, cash flow statements
  - "Negotiation Mastery" — salary negotiations, business deals, everyday negotiations

- **AI & Technology (Advanced)**
  - "Building with AI APIs" — hands-on guide to integrating LLMs, embeddings, and agents into products
  - "Data Literacy for Decision Makers" — reading charts, understanding statistics, spotting misleading data

- **World Politics & Economics**
  - "How the Global Economy Actually Works" — trade, currencies, central banks, supply chains
  - "Understanding Geopolitics" — why nations act the way they do, power dynamics, alliances
  - "Crypto and Digital Assets: Beyond the Hype" — blockchain fundamentals, DeFi, regulation

- **Commerce & Trading**
  - "Stock Market Fundamentals" — how markets work, reading charts, valuation basics, risk management
  - "E-Commerce from Zero" — platforms, sourcing, marketing, operations, scaling
  - "Supply Chain Basics" — how things get made and delivered, logistics, inventory management

- **Leadership & Soft Skills**
  - "Critical Thinking in the Age of AI" — evaluating claims, logical fallacies, decision frameworks
  - "Public Speaking Without Fear" — structure, delivery, handling nerves, Q&A
  - "Conflict Resolution" — de-escalation, finding common ground, difficult conversations

**Implementation**: These courses are seeded into a "Nexus Public" org that all B2C users can access. Each course has:
- Pre-written content (sourced from high-quality open educational resources, synthesized by Claude)
- RAG-indexed embeddings so Nexi can teach from them
- AI-generated mastery criteria, scenarios, and domains
- A `pricing_tier` field: "free" or "paid"
- A `category` field for browsing

### 3. User-Uploaded Content → Personal Courses

This is the NotebookLM-style feature for individuals. A user uploads ANY materials — PDFs, Word docs, images, text files, slide decks — and the AI turns it into a structured personal course.

**What's different from B2B upload:**
- No admin role required — any user can upload
- Content is private to the user (scoped to their personal org)
- Supports images (OCR → text extraction → course generation)
- Simpler UI — no "programs" or "dimensions," just "My Courses"
- The user can upload messy, unstructured content (lecture notes, screenshots of textbooks, random PDFs) and the AI makes sense of it

**New file formats to support:**
- Images (PNG, JPG, JPEG) — use OCR (Tesseract or Claude vision) to extract text
- Screenshots of documents/textbooks — same OCR pipeline
- Audio files (MP3, WAV) — transcribe with Deepgram then generate course
- YouTube URLs — transcribe with Deepgram/Whisper then generate course

### 4. Pricing & Billing

**Tiers:**
- **Free**: 3 pre-built courses, 1 personal upload, 5 sessions/month
- **Pro ($12/month)**: All courses, unlimited uploads, unlimited sessions, voice coaching
- **Annual ($99/year)**: Same as Pro, discounted

**Implementation**: Stripe integration with:
- Checkout session creation
- Webhook for subscription events (created, updated, cancelled)
- Usage tracking (session count, upload count)
- Paywall middleware that checks subscription before allowing paid features

### 5. B2C Dashboard (Simpler Than B2B)

The B2C learner dashboard is even simpler than the B2B Arena. No "programs" or "focus skills" — just:

- **Continue Learning**: The course they were last working on, with a big "Resume" button
- **My Courses**: Grid of enrolled courses (both library and personal uploads)
- **Browse Library**: Categorized course catalog with free/paid badges
- **Upload**: Drop zone to create a personal course from any file
- **Progress**: Simple view of courses completed vs in-progress

---

## Technical Architecture

### Option A: Separate App (Recommended for now)
- `apps/consumer/` — new Next.js app for B2C
- Shares the same FastAPI backend (`services/api/`)
- New routes: `POST /api/consumer/signup`, `GET /api/consumer/library`, `POST /api/consumer/upload`
- Separate Auth0 application (different client ID, same tenant)

### Option B: Unified App with Role Switching
- Single app that detects user type (b2b vs b2c) and renders different layouts
- More complex but avoids code duplication

### Database Changes
- Add `user_type` enum to User: "b2b" | "b2c"
- Add `pricing_tier` to Course: "free" | "paid" | "private"
- Add `is_public` boolean to Course (public library vs org-private)
- Add `Subscription` model: user_id, plan, stripe_customer_id, stripe_subscription_id, status, current_period_end
- Add `UsageTracking` model: user_id, month, session_count, upload_count

### Content Generation
For the pre-built library, use Claude to generate comprehensive course content:
1. Define the topic and target audience
2. Claude generates: title, description, 4-6 chapters of content, mastery criteria, practice scenarios, domains with capabilities
3. Content is reviewed/edited by a human
4. Stored as Course + ContentEmbedding records in the "Nexus Public" org

---

## What to Build When

**Phase A**: B2C signup + personal org auto-creation + course library browsing (free courses only)
**Phase B**: User upload → personal course generation (reuse existing ingestion pipeline)
**Phase C**: Stripe billing + paid tier + usage limits
**Phase D**: Image/audio/video upload support (OCR, transcription)
**Phase E**: Course content generation for the library (batch process with Claude)

---

## Pre-Built Course Generation Prompt

When it's time to generate the library courses, use this prompt with Claude:

```
You are creating educational content for the Nexus² learning platform. Generate a comprehensive course on [TOPIC] for [AUDIENCE].

The course must include:
1. A compelling title and 2-3 sentence description
2. 4-6 chapters, each with:
   - Clear explanation of concepts (2-3 paragraphs)
   - Concrete examples and real-world applications
   - Common mistakes and misconceptions
3. 3-5 mastery criteria (specific, measurable competencies)
4. 3-5 practice scenarios (realistic situations for Socratic coaching)
5. 2-4 skill domains with 2-4 capabilities each

Write at a level appropriate for [AUDIENCE]. Use clear, engaging language. Avoid jargon unless you explain it. Include examples that are relevant to today's world (2025-2026).

The content will be used by an AI coach (Nexi) to teach learners through a teach-first approach: explain clearly, then check understanding, then challenge with deeper questions, then apply to scenarios, then reflect.
```

---

## Parking This For Now

The B2C version reuses 90% of the existing B2B infrastructure:
- Same Nexi AI engine (teach → check understanding → challenge → apply → reflect)
- Same RAG pipeline (upload → extract → chunk → embed → retrieve)
- Same session WebSocket streaming
- Same mastery profile and assessment

The main new work is: individual signup, course library, Stripe billing, and the simpler consumer-facing UI.

**Do not start this until**: B2B auth is working, upload pipeline is verified, full session flow is tested, and multi-tenant isolation is confirmed.
