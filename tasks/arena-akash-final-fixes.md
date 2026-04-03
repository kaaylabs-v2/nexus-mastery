# Arena-Akash Final Fixes — CC Prompt

You are on the `Arena-Akash` branch of the Mastery monorepo. Three backend issues were already fixed (models/__init__.py, alembic/env.py, migration file). One cosmetic gap remains plus the migration needs to be run.

## Fix 1: Run the Alembic Migration

```bash
cd services/api
alembic upgrade head
```

Verify the tables exist:
```bash
psql $DATABASE_URL -c "\dt notebook_entries"
psql $DATABASE_URL -c "\dt vocabulary_entries"
```

## Fix 2: Add Serif Font for Headings (Design System Gap)

The arena-thought UI used serif typography for headings. Add it:

### Step 2a: Import a serif font in `apps/web/src/app/layout.tsx`

Add Playfair Display (or Lora) from `next/font/google`:

```tsx
import { Playfair_Display } from "next/font/google";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});
```

Add the variable to the `<body>` className alongside the existing sans font variable.

### Step 2b: Register in Tailwind config (`apps/web/tailwind.config.ts`)

```ts
fontFamily: {
  serif: ["var(--font-serif)", "Georgia", "serif"],
}
```

### Step 2c: Apply to headings in `apps/web/src/app/globals.css`

Add after the existing custom classes:

```css
h1, h2, h3 {
  font-family: var(--font-serif), Georgia, serif;
}
```

## Fix 3: Verify Everything Compiles

```bash
cd apps/web && npx tsc --noEmit
cd apps/admin && npx tsc --noEmit
```

## Fix 4: Run the Full App and Test

```bash
# Terminal 1 — API
cd services/api && uvicorn app.main:app --reload --port 8000

# Terminal 2 — Web
cd apps/web && npm run dev

# Terminal 3 — Admin
cd apps/admin && npm run dev
```

### Manual verification:
1. Go to http://localhost:3000 — dashboard loads
2. Click a course → session starts, 3-pane layout visible
3. Sources pane: click to expand, see course materials
4. Chat with Nexi: messages stream, follow-up chips appear
5. Notebook pane: click to expand, create a note, create a vocab entry
6. Vocab popover: select text in a message, popover appears
7. Admin app at http://localhost:3001 still works

### Automated tests:
```bash
cd apps/web && npx playwright test --headed
```
