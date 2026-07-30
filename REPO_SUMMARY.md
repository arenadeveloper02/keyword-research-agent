# Repository Summary: keyword_research_agent

> Auto-maintained by Sim Development. Last updated: 2026-07-30T07:16:20.647Z.

## Overview

Live streaming keyword research agent with a Generator view and a History tab backed by the Arena buildhistory workflow and saved runs.

**Repository:** `keyword-research-agent`  
**File count:** 51

## Features

- Streaming keyword research pipeline with live stage progress
- Generator / History tab toggle in the header area
- History list with keyword, client, timestamp, and top-pick preview
- Read-only view of past run outputs
- PDF export and copy-as-table of final results
- Saved runs persisted via Prisma ResearchRun model

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

- **Updated at:** 2026-07-30T07:16:20.647Z
- **Request:** Make the following changes only. Do not change any other styling, colors, spacing, copy, or layout beyond what's explicitly listed below.


Add a "History" section to this Article Recommendation Agent tool. Requirements:

1. Location & trigger: Add a "History" button/tab in the header area (next to or near the title) that toggles between the main "Generator" view and a "History" view.
2. What gets saved: Every time the user clicks "Get Recommendations" and a result is generated, save a history entry containing:
- Target Keyword
- Client / Brand
- Timestamp (date + time of generation)
- The full generated output (the H1, headings, and article recommendations)
3. History view UI:
Show entries as a reverse-chronological list (newest first), each as a card showing: keyword, client, timestamp, and a short preview of the H1/title generated.
Each card should have:
- A "View" button/click action that loads that entry's full output back into the main results view (read-only, non-editable)
If there's no history yet, show an empty state message like "No previous runs yet — generate your first recommendation to see it here."
4. Persistence: Store history using in-memory React state (use useState/array), since browser storage isn't available in this environment. Note in a comment that this resets on page reload, and if the user wants persistence across sessions, they'd need to connect a backend/database.
5. Styling: Match the existing design — same rounded cards, purple/indigo accent color, clean spacing, and typography already used in the tool.

Keep the existing Generator view and functionality fully intact — just add History as an additional view/tab.



HIstory API :

curl -X POST \
  -H "X-API-Key: use the exisiting key " \
  -H "Content-Type: application/json" \
  -d '{"email":"example","type":"keyword_research","stream":true,"selectedOutputs":["buildhistory.result"]}' \
  https://agent.thearena.ai/api/workflows/38458816-0871-4c2f-8545-39654a5530cc/execute





For this API :
https://agent.thearena.ai/api/workflows/b056ebe3-2df8-4d6a-aa17-d90e6b5f3c7f/execute

Include email as a parameter in the request body ...

Remove SEMrush units: at the top
