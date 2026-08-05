# Repository Summary: keyword_research_agent

> Auto-maintained by Sim Development. Last updated: 2026-08-05T09:56:31.329Z.

## Overview

Live streaming keyword research agent that expands a seed keyword into a validated, competitor-backed shortlist with full pipeline visibility, history, and UI-parity PDF export.

**Repository:** `keyword-research-agent`  
**File count:** 52

## Features

- Streaming keyword research pipeline with live stage tracking
- Competitor SERP and URL scoring panels
- SEMrush keyword aggregation and composite scoring views
- Validated primary/secondary keyword shortlist with inline editing
- History of saved runs backed by Neon Postgres
- Download-as-PDF report with fixed column widths matching the on-screen tables

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

- **Updated at:** 2026-08-05T09:56:31.329Z
- **Request:** Make the following changes only. Do not change any other styling, colors, spacing, copy, or layout beyond what's explicitly listed below.
Implement only the functionality below: Don't change anything.
 I have a "Download as PDF" feature in my app where the exported PDF doesn't match
what's shown in the UI — specifically table alignment, column widths, and cell
content are breaking/shifting in the PDF, even though the on-screen rendering is correct.

Please do the following:

1. First, inspect my current PDF generation implementation and identify the exact
   method being used (e.g. html2canvas + jsPDF, react-to-print, Puppeteer/Playwright
   server-side rendering, wkhtmltopdf, or native browser print-to-PDF via window.print()).

2. Based on that method, diagnose the likely root cause of table misalignment. Common
   causes to check for:
   - Missing or conflicting @media print CSS rules that override table layout
   - Tables using `table-layout: auto` instead of `table-layout: fixed` with explicit
     column widths, causing column widths to recalculate differently in the PDF renderer
   - Flexbox/CSS Grid used for "table-like" layouts instead of real <table> markup,
     which renders inconsistently across PDF engines
   - html2canvas capturing the DOM at the wrong viewport width/zoom, causing
     scaling/wrapping differences
   - Page-break issues — rows or cells getting cut across PDF page boundaries
     (missing `page-break-inside: avoid` / `break-inside: avoid` on <tr>/<td>)
   - Fonts not being embedded or loaded before capture/render, causing width recalculation
   - Different rendering engine assumptions (headless Chromium vs jsPDF's own layout engine
     vs the browser's live layout engine)

3. Recommend the most reliable long-term approach for pixel-parity between UI and PDF
   for tables specifically. If we're not already using a full browser rendering engine
   (Puppeteer/Playwright with headless Chromium), consider whether switching to that
   approach would be more reliable than canvas-based or manual PDF-drawing libraries,
   since it renders the actual HTML/CSS instead of re-implementing layout.

4. Implement the fix so that:
   - Table column widths, borders, padding, and text alignment in the PDF exactly
     match the live UI
   - Tables that span multiple pages break cleanly between rows, never mid-row/mid-cell
   - The fix works for [insert your table's specific properties: e.g. sticky headers,
     merged cells, responsive/dynamic column widths, sorting/filtering state] if applicable
