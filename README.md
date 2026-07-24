# Keyword Research

A single-page Next.js (App Router, TypeScript) UI that drives a keyword-research pipeline and renders its live streaming results: a 7-stage progress tracker, per-URL competitor fetch status, a tiered source-keyword pool, and an editable final shortlist with warning banners, copy-as-table, and client-side PDF export.

## Features

- Two-step run flow: `POST /api/keyword-research/init` issues a single-use token, then the browser opens `GET /api/keyword-research/stream/:token` as an EventSource; the route pipes the upstream pipeline stream straight through as SSE
- Pipeline API key lives server-side only in the stream proxy route — never in the client bundle
- Live SSE event handling for `step`, `variants`, `urls`, `url_status`, `url_keywords`, `allKeywords`, `result`, `fail`, and `done`
- Editable primary/secondary keyword results, amber warning banner, Copy-as-table (TSV), and Download-as-PDF (jsPDF + jspdf-autotable, fully client-side)
- Completed runs persist to Postgres via Prisma (`/api/runs`) and restore statically on page refresh
- SEMrush balance widget, iframe postMessage notifications, cancel/retry flows, and a React error boundary

## Tech stack

- Next.js ^15.3.3 (App Router) + React ^19
- TypeScript (strict), Tailwind CSS v3
- Prisma + Neon Postgres (run persistence)
- jsPDF + jspdf-autotable, lucide-react

## Local setup

1. `npm install`
2. Copy `.env.example` to `.env` and set `DATABASE_URL` to a Postgres connection string
3. `npm run dev` and open http://localhost:3000

## Build & deploy

- `npm run build` runs `prisma generate && prisma db push && next build`
- On Vercel with a connected Neon database, `DATABASE_URL` is injected automatically
- The SEMrush balance endpoint is a graceful stub (`/api/semrush/balance`) until an upstream balance API is provided
