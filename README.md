# AI Interview

Voice-based AI interview practice app. Upload a résumé, pick a target role, then run a **Practice** session (Interviewer + Trainer) or a full **Interview** with streaming voice and barge-in.

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind
- Prisma + SQLite (dev) / Neon Postgres (prod-ready schema swap)
- NextAuth v5 (credentials) — wired in later tasks
- Vercel AI SDK via AI Gateway

## Setup

```bash
npm install
cp .env.example .env
# edit .env — at minimum set NEXTAUTH_SECRET and an AI key
npx prisma migrate dev
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
prisma/           # Schema + migrations
```

## Environment

See `.env.example` for `DATABASE_URL`, `NEXTAUTH_*`, `AI_GATEWAY_API_KEY` / `OPENAI_API_KEY`.
