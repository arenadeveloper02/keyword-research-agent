# Repository Summary: keyword_research_agent

> Auto-maintained by Sim Development. Last updated: 2026-07-31T11:12:21.727Z.

## Overview

Live streaming keyword research app — expands a seed keyword into a validated, competitor-backed shortlist with full pipeline visibility, history, PDF export, and copy-as-table.

**Repository:** `keyword-research-agent`  
**File count:** 52

## Features

- Streaming keyword research pipeline with stage-by-stage progress
- SERP Results and SEMrush Keywords panels in both generator and history views
- History of past runs (Arena workflow + saved runs API)
- Editable final shortlist with copy-as-table and PDF export
- Arena email gate with access-denied page

## Tech Stack

- Next.js ^15.3.3 (App Router)
- React ^19.0.0
- Tailwind CSS v3
- TypeScript
- Prisma + PostgreSQL (Neon on Vercel)

## Infrastructure

- **DATABASE_URL:** set on Vercel when Neon is connected — do not commit real credentials

## Routes & Pages

- `/` — `app/page.tsx`
- `/access-denied` — `app/access-denied/page.tsx`

## Database Models

- `AppSetting`
- `ResearchRun`

## File Inventory

### App pages

- `app/access-denied/page.tsx`
- `app/arena-ds-tokens.css`
- `app/error.tsx`
- `app/globals.css`
- `app/layout.tsx`
- `app/not-found.tsx`
- `app/page.tsx`

### API routes

- `app/api/keyword-research/history/route.ts`
- `app/api/keyword-research/init/route.ts`
- `app/api/keyword-research/stream/[token]/route.ts`
- `app/api/runs/route.ts`
- `app/api/semrush/balance/route.ts`

### Components

- `components/AlignmentScoresPanel.tsx`
- `components/CompetitorUrlsPanel.tsx`
- `components/CompositeScoringPanel.tsx`
- `components/DedupKeywordsPanel.tsx`
- `components/ErrorBoundary.tsx`
- `components/ErrorCard.tsx`
- `components/ExaResearchPanel.tsx`
- `components/HistoryDetail.tsx`
- `components/HistoryView.tsx`
- `components/KeywordResearchApp.tsx`
- `components/KeywordResearchClient.tsx`
- `components/PdfDownloadButton.tsx`
- `components/ProgressTracker.tsx`
- `components/QueryVariantsPanel.tsx`
- `components/ResearchForm.tsx`
- `components/ResultsSection.tsx`
- `components/SemrushBalanceWidget.tsx`
- `components/SemrushKeywordsPanel.tsx`
- `components/SerpResultsPanel.tsx`
- `components/SourceKeywordsPanel.tsx`
- `components/arena-email-provider.tsx`

### Libraries

- `lib/arena-email-constants.ts`
- `lib/arena-email.ts`
- `lib/copy-table.ts`
- `lib/format.ts`
- `lib/history.ts`
- `lib/pdf.ts`
- `lib/prisma.ts`
- `lib/types.ts`
- `prisma/schema.prisma`

### Config

- `.env.example`
- `middleware.ts`
- `next-env.d.ts`
- `next.config.ts`
- `package.json`
- `postcss.config.mjs`
- `tailwind.config.ts`
- `tsconfig.json`

### Other

- `README.md`
- `REPO_SUMMARY.md`

## Complete File Index

- `.env.example`
- `README.md`
- `REPO_SUMMARY.md`
- `app/access-denied/page.tsx`
- `app/api/keyword-research/history/route.ts`
- `app/api/keyword-research/init/route.ts`
- `app/api/keyword-research/stream/[token]/route.ts`
- `app/api/runs/route.ts`
- `app/api/semrush/balance/route.ts`
- `app/arena-ds-tokens.css`
- `app/error.tsx`
- `app/globals.css`
- `app/layout.tsx`
- `app/not-found.tsx`
- `app/page.tsx`
- `components/AlignmentScoresPanel.tsx`
- `components/CompetitorUrlsPanel.tsx`
- `components/CompositeScoringPanel.tsx`
- `components/DedupKeywordsPanel.tsx`
- `components/ErrorBoundary.tsx`
- `components/ErrorCard.tsx`
- `components/ExaResearchPanel.tsx`
- `components/HistoryDetail.tsx`
- `components/HistoryView.tsx`
- `components/KeywordResearchApp.tsx`
- `components/KeywordResearchClient.tsx`
- `components/PdfDownloadButton.tsx`
- `components/ProgressTracker.tsx`
- `components/QueryVariantsPanel.tsx`
- `components/ResearchForm.tsx`
- `components/ResultsSection.tsx`
- `components/SemrushBalanceWidget.tsx`
- `components/SemrushKeywordsPanel.tsx`
- `components/SerpResultsPanel.tsx`
- `components/SourceKeywordsPanel.tsx`
- `components/arena-email-provider.tsx`
- `lib/arena-email-constants.ts`
- `lib/arena-email.ts`
- `lib/copy-table.ts`
- `lib/format.ts`
- `lib/history.ts`
- `lib/pdf.ts`
- `lib/prisma.ts`
- `lib/types.ts`
- `middleware.ts`
- `next-env.d.ts`
- `next.config.ts`
- `package.json`
- `postcss.config.mjs`
- `prisma/schema.prisma`
- `tailwind.config.ts`
- `tsconfig.json`

## Latest Change

- **Updated at:** 2026-07-31T11:12:21.727Z
- **Request:** Make the following changes only. Do not change any other styling, colors, spacing, copy, or layout beyond what's explicitly listed below.

1) In the history view 'SERP Results', 'SEMrush Keywords' are missing; these details are already present in the API response Update the UI with these values
