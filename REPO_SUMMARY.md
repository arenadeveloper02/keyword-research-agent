# Repository Summary: keyword_research_agent

> Auto-maintained by Sim Development. Last updated: 2026-07-30T08:00:19.806Z.

## Overview

Keyword Research

**Repository:** `keyword-research-agent`  
**File count:** 51

## Features

- Live streaming keyword research pipeline
- Full pipeline history detail (variants, URL scoring, dedup, composite, alignment, source keywords, final results)
- Generator starts empty — no auto-restore of previous runs
- PDF export of results
- Saved runs persisted via Prisma/Postgres

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

- **Updated at:** 2026-07-30T08:00:19.806Z
- **Request:** Make the following changes only. Do not change any other styling, colors, spacing, copy, or layout beyond what's explicitly listed below.


1) The history should be similar to what the output is generated, and it should contain all the values. Should show Query Variants,URL scoring, Deduplicated & Normalized Keywords, Composite Scoring, Alignment Scores, All source keywords, and then the Final results 



2) Once the generation tab is clicked, the data should be empty. Now, some random data is showing.
