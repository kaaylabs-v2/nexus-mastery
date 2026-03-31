# Lovable UX Prompts — Nexus² Frontend Simplification

> These are prompts to give Lovable to simplify the Nexus² experience — both the learner-facing Arena and the admin-facing Studio. The goal: every screen should be usable by someone seeing it for the first time with zero training. A first-time user should know exactly what to do within 5 seconds.

---

# Part 1: Learner Frontend (Arena)

> Make it feel like talking to a friendly coach, not operating a data dashboard.

---

## Prompt 1 — First-Time Onboarding

Add a first-time user onboarding flow. When a user logs in for the first time (no sessions completed), show a simple 3-step welcome: (1) a friendly greeting explaining this is their AI coaching space, (2) a quick visual showing how a session works — you talk, the AI coaches you through questions, you grow — keep it to one illustration and two sentences, (3) a single big "Start Your First Session" button. Don't show the full dashboard until they've completed at least one session. Use a clean card layout, no jargon, no stats. The tone should feel like a friendly coach, not a data dashboard.

---

## Prompt 2 — Simplify the Dashboard

Redesign the main dashboard to be less data-heavy and more action-oriented. The primary element should be one large card: "Continue Your Journey" with the next recommended session, a brief one-line description, and a big "Start" button. Below that, show a simple progress bar with a friendly label like "You're 35% through your program" — no decimal mastery levels, no baseline numbers. Below that, show 3 small cards for their focus areas, but instead of saying "Critical — Declining — 35%", say something human like "Needs practice — try a scenario focused on this". Hide the detailed AI Coach panel and milestones behind a "See more details" toggle so they're accessible but not overwhelming. Use encouraging language throughout.

---

## Prompt 3 — Simplify the Arena Session Page

Simplify the Arena session page. Right now it has a 3-panel layout showing chat, stage progression, and scaffold insights simultaneously. Change it to: the chat takes up the full screen, with the AI conversation front and center. The session progresses through 5 natural phases: Learn → Understand → Think Deeper → Apply → Reflect. Show the current phase as a small subtle pill/badge at the top of the chat — not a full stepper with all 5 phases visible. The coaching prompts (observation + consider questions) should appear inline in the chat as a styled coaching card after the AI responds, not in a separate panel. Notes should be a collapsible drawer from the side, not a permanent panel. The goal: it should feel like texting a really smart coach, not operating a cockpit. In the "Learn" phase, the AI actually teaches and explains — this is not a quiz from the start.

---

## Prompt 3b — Teaching Mode Session Experience

The AI coach (Nexi) now follows a teach-first approach. The session page needs to reflect this visually. Here's how each phase should feel in the UI:

**Learn phase (first 2-3 exchanges):** Nexi is teaching. The AI's messages during this phase should look slightly different from regular chat — use a subtle background card or a left-aligned "lesson" style with a small book/lightbulb icon, so the learner instinctively knows "this is the explanation part, I should pay attention." The learner can ask clarifying questions and Nexi will elaborate. At the bottom of Nexi's teaching message, show a soft prompt like "Got it? Let me know if you'd like me to explain any part differently."

**Understand phase:** Nexi asks the learner to explain back. Show the phase pill changing to "Understand" with a gentle transition animation. The chat returns to a normal conversational look — two people talking back and forth. If the learner gets something wrong, Nexi's correction should appear as a friendly coaching card (slightly highlighted, like a sticky note in the chat) rather than a plain message, so it's clear this is a helpful correction, not a judgment.

**Think Deeper phase:** Nexi challenges with harder questions. The phase pill changes to "Think Deeper." Optionally show a small inline prompt card before Nexi's message — something like "Let's push your thinking a bit further" — so the learner knows the difficulty is intentionally increasing and doesn't feel like they're failing.

**Apply phase:** Nexi presents a scenario. The scenario should appear as a distinct styled card in the chat — with a subtle border, maybe a briefcase or puzzle icon, and the scenario text clearly formatted as a "situation." This visually separates it from regular conversation and signals "this is your challenge to work through." The learner's responses stay in normal chat style.

**Reflect phase:** Nexi asks reflective questions. The phase pill changes to "Reflect." At the end of the session, show a simple summary card: "What you covered today" with 2-3 bullet points pulled from the conversation highlights, and a "Nice work" message. Include a small "Start another session" button below.

The key principle: the UI should subtly change its visual treatment as the session progresses through phases, so the learner intuitively feels the shift from "I'm being taught" to "I'm being coached" to "I'm being challenged" to "I'm wrapping up" — without ever needing to read a label or understand the system.

---

## Prompt 3c — Voice Narration for Teaching Messages

During the Learn phase, Nexi's teaching messages should be automatically read aloud in a warm, educator voice. This makes the experience feel like having a real coach explain something to you — not reading a wall of text. Here's how to design it:

**In the Learn phase (auto-narrate by default):** When Nexi sends a teaching message, the app automatically plays it as audio. While the audio plays, show a small animated speaker/waveform icon on the teaching message card so the learner knows it's being read to them. The text still appears in the chat simultaneously (like subtitles) so the learner can follow along or read ahead. If the learner starts typing while audio is playing, pause the audio automatically — they're ready to move on.

**Toggle control:** Add a small, clean toggle at the top right of the chat area — a speaker icon with the label "Auto-read lessons." On by default for the first session. When toggled off, teaching messages appear as text only with no audio. The preference persists across sessions (saved in localStorage). Keep the toggle subtle — don't make it look like a major feature, just a quiet preference.

**On-demand for other phases:** In the Understand, Think Deeper, Apply, and Reflect phases, voice is off by default. But add a tiny speaker icon on each Nexi message — when tapped, it reads that specific message aloud. This is useful for learners who want to listen to a challenging question or scenario instead of reading it. The icon should be very subtle (maybe appears on hover/tap) so it doesn't clutter the chat.

**The voice itself:** Use a warm, calm, professional tone — think of a great teacher who genuinely cares about the student understanding. Not a robotic text-to-speech voice. Not overly enthusiastic. Just clear, warm, and human.

**Loading state:** If there's a brief delay before audio starts (while the TTS API processes), show a gentle pulsing indicator on the message card — not a spinner, just a subtle breathing animation that says "getting ready to explain..."

---

## Prompt 4 — Replace Jargon with Human Language

Go through all UI text and replace technical jargon with plain language. Specific changes: "Mastery Level 1.8" → "Getting started", "Mastery Level 3.0" → "Getting comfortable", "Mastery Level 4.0" → "Strong". "Critical" status → "Needs work". "Declining trend" → "Could use more practice". "Proficient" → "Going well". "Session Mode: Teach" → "Learn". "Session Mode: Check Understanding" → "Understand". "Session Mode: Challenge" → "Think Deeper". "Session Mode: Apply" → "Apply". "Session Mode: Reflect" → "Reflect". "Scaffold Update" → just don't label it at all, let the coaching prompts appear naturally. "Focus Skills" → "What to work on". "Focus Sessions" → "Recommended practice". Remove all decimal numbers — use progress bars and simple labels instead.

---

## Prompt 5 — Empty States and Encouragement

Add friendly empty states and micro-encouragement throughout. When there's no session history: "Your first session is waiting — it takes about 15 minutes and there are no wrong answers." After completing a session: show a brief celebration moment with a specific compliment like "You asked a great clarifying question about stakeholder impact." When a skill improves: show a subtle animation with "Nice — your [skill name] is improving." When a skill hasn't been practiced in a while: "It's been a bit since you practiced [skill] — want to try a quick scenario?" Make the app feel like it's rooting for you.

---

# Part 2: Admin Frontend (Studio)

> Make the admin experience feel effortless — like Google NotebookLM. The backend is sophisticated; the frontend should hide all that complexity.

---

## Prompt 6 — Upload & Generate Page (NotebookLM-Style)

Redesign the Upload & Generate page to feel like Google NotebookLM. The current design shows a 5-stage technical pipeline (upload → extract → analyze → chunk → generate) where the admin watches each internal processing stage. Remove all of that. The new experience has exactly 3 steps:

**Step 1 — Drop zone:** A large, beautiful drag-and-drop area that takes up most of the page. "Drop your training materials here" with a subtle file icon. Accepts PDFs, Word docs, slide decks, text files — multiple files at once. No file type selector dropdown, no metadata form, no configuration fields. Just drop and go. Below the drop zone, show a small list of previously uploaded sources (like NotebookLM's source panel on the left) so the admin can see what's already been uploaded.

**Step 2 — Processing:** After files are dropped, show a single clean card that says "Creating your course..." with one subtle progress animation. Not 5 labeled pipeline stages, not chunk counts, not embedding percentages. Just a gentle spinner or progress bar. Optionally show one line of natural language that updates: "Reading your files..." then "Analyzing content..." then "Almost ready..." The admin should be able to navigate away and come back — the processing happens in the background.

**Step 3 — Review & publish:** When processing is done, transition smoothly to an AI-generated course preview showing the suggested title, description, competencies, and practice scenarios — all editable inline. The admin tweaks what they want (or accepts as-is) and hits one big button: "Publish." Done. No separate confirmation screen, no multi-step wizard.

For errors: don't show technical messages like "IngestionJob failed at stage 3." Show: "We had trouble reading one of your files. Try uploading it again, or use a different format." With a retry button.

---

## Prompt 7 — Admin Dashboard Simplification

Simplify the Admin Studio dashboard. Instead of showing every stat at once (learner count, program count, completion rate, session stats, activity feed), prioritize what matters most. The top of the page should answer one question: "How are my learners doing?" Show a single headline stat like "24 active learners this week" with a simple trend arrow. Below that, show the top 3 programs as clean cards with a progress bar and learner count each — no decimal percentages, no complex breakdowns. The activity feed should be a short list (5 items max) showing recent meaningful events like "Maria completed her first assessment" or "3 new learners joined this week" — not technical logs. Make the admin feel like they're checking in on their team, not reading a database report.

---

## Prompt 8 — User Management Simplification

Simplify the Users page. The primary action should be obvious: a big "Invite Team Members" button at the top. The user table should show name, email, role, and a simple status (active/invited/inactive) — not enrollment counts or last-active timestamps cluttering the view. For CSV bulk import: just a drop zone that says "Drop a CSV to invite multiple people" — when dropped, show a clean preview table with green checkmarks for valid rows and red highlights for problems, with a single "Send All Invites" button. Hide advanced filters behind an expandable section. The goal: an admin who has never used the platform before should be able to invite their whole team in under 60 seconds.

---

## Prompt 9 — Settings Page Simplification

Simplify the Settings page. Instead of 4 dense tabs (General, SSO, API Keys, Webhooks) visible all at once, show a clean list of setting categories with one-line descriptions: "Branding — Logo, colors, and company name", "Single Sign-On — Connect your identity provider", "API Access — Manage API keys for integrations", "Webhooks — Get notified when events happen." Each one expands inline or navigates to a focused sub-page. Don't show masked API key strings or SAML configuration fields upfront — those are for power users who click in. The default view should feel like a simple preferences screen, not a developer console.
