# AI Interview

Voice-based AI interview practice app. Upload a résumé, pick a target role, then run a **Practice** session (Interviewer + Trainer) or a full **Interview** with streaming voice and barge-in.

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind
- Prisma + Postgres (`ai_interview` schema)
- Clerk authentication (`@clerk/nextjs`)
- Vercel AI SDK via AI Gateway

## Setup

```bash
npm install
cp .env.example .env
# edit .env — set Clerk keys + DATABASE_URL + an AI key
npx prisma migrate deploy
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build |
| `npm start` | Start production server |
| `npx prisma studio` | Browse DB |

## Repo layout

```
src/app/          # App Router pages & API routes
src/lib/prisma.ts # Prisma client singleton
src/lib/ai.ts     # Shared LLM model helper
src/lib/auth.ts   # Clerk session → Prisma user bridge
prisma/           # Schema + migrations
```

## Environment

See `.env.example` for `DATABASE_URL`, Clerk keys (`NEXT_PUBLIC_CLERK_*` / `CLERK_SECRET_KEY`), and `AI_GATEWAY_API_KEY` / `OPENAI_API_KEY`.

For Google Analytics 4, add `NEXT_PUBLIC_GA_MEASUREMENT_ID` (for example `G-7JPB75VRKY`) to the Vercel project environment. The app stores first-touch UTM parameters in the browser and reports page views plus `sign_up`, `begin_checkout`, `purchase`, `coupon_applied`, `interview_created`, `interview_started`, and `interview_completed` events.
