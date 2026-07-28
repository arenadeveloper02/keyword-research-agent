# Repository Summary: keyword_research_agent

> Auto-maintained by Sim Development. Last updated: 2026-07-28T05:16:51.074Z.

## Overview

Keyword Research — live streaming keyword research that expands a seed keyword into a validated, competitor-backed shortlist with six data panels, persisted runs, and PDF export.

**Repository:** `keyword-research-agent`  
**File count:** 35

## Features

- Single onmessage SSE consumer matching the real wire format (data-only messages, embedded final marker, [DONE] terminator)
- Two-step init → single-use stream token flow with retry-from-init
- Six data panels: seed form + query variants, URL scoring grid, SEMrush keywords by page, primary keywords, secondary keywords table, all source keywords
- Live progress tracker fed by {blockId,chunk} progress messages
- Persisted run restore via Prisma + PDF export covering all panels
- SEMrush balance widget and iframe postMessage notifications

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

## Database Models

- `ResearchRun`

## File Inventory

### App pages

- `app/error.tsx`
- `app/globals.css`
- `app/layout.tsx`
- `app/not-found.tsx`
- `app/page.tsx`

### API routes

- `app/api/keyword-research/init/route.ts`
- `app/api/keyword-research/stream/[token]/route.ts`
- `app/api/runs/route.ts`
- `app/api/semrush/balance/route.ts`

### Components

- `components/CompetitorUrlsPanel.tsx`
- `components/ErrorBoundary.tsx`
- `components/ErrorCard.tsx`
- `components/KeywordResearchClient.tsx`
- `components/PdfDownloadButton.tsx`
- `components/ProgressTracker.tsx`
- `components/QueryVariantsPanel.tsx`
- `components/ResearchForm.tsx`
- `components/ResultsSection.tsx`
- `components/SemrushBalanceWidget.tsx`
- `components/SemrushKeywordsPanel.tsx`
- `components/SourceKeywordsPanel.tsx`

### Libraries

- `lib/format.ts`
- `lib/pdf.ts`
- `lib/prisma.ts`
- `lib/types.ts`
- `prisma/schema.prisma`

### Config

- `.env.example`
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
- `app/api/keyword-research/init/route.ts`
- `app/api/keyword-research/stream/[token]/route.ts`
- `app/api/runs/route.ts`
- `app/api/semrush/balance/route.ts`
- `app/error.tsx`
- `app/globals.css`
- `app/layout.tsx`
- `app/not-found.tsx`
- `app/page.tsx`
- `components/CompetitorUrlsPanel.tsx`
- `components/ErrorBoundary.tsx`
- `components/ErrorCard.tsx`
- `components/KeywordResearchClient.tsx`
- `components/PdfDownloadButton.tsx`
- `components/ProgressTracker.tsx`
- `components/QueryVariantsPanel.tsx`
- `components/ResearchForm.tsx`
- `components/ResultsSection.tsx`
- `components/SemrushBalanceWidget.tsx`
- `components/SemrushKeywordsPanel.tsx`
- `components/SourceKeywordsPanel.tsx`
- `lib/format.ts`
- `lib/pdf.ts`
- `lib/prisma.ts`
- `lib/types.ts`
- `next-env.d.ts`
- `next.config.ts`
- `package.json`
- `postcss.config.mjs`
- `prisma/schema.prisma`
- `tailwind.config.ts`
- `tsconfig.json`

## Latest Change

- **Updated at:** 2026-07-28T05:16:51.074Z
- **Request:** EDIT the existing generated Next.js app IN PLACE in the same repository — do NOT create a new repo, do NOT regenerate from scratch. Apply the targeted fixes below and keep every other prompt requirement, UI panel, and file unchanged.

=== CRITICAL BUG TO FIX: SSE STREAM CONSUMER USES WRONG WIRE FORMAT ===
The current client consumes the stream with NAMED event listeners: eventSource.addEventListener('step'|'variants'|'urls'|'result'|'fail'|'done', ...). This is WRONG. The upstream pipeline does NOT emit named SSE events. It emits ONLY default `message` events. Rewrite the stream consumer to the REAL wire format below.

=== REAL WIRE FORMAT (verified against the live endpoint) ===
- Every line is a plain default SSE message: `data: <json>` with NO `event:` line.
- Progress chunks look like: `data: {"blockId":"<uuid>","chunk":"<string-or-json-string>"}`
- The final result looks like: `data: {"event":"final","data":{"output":{"<blockId>": ...}}}` — the "final" marker is a FIELD inside the JSON, NOT an SSE event name.
- The stream terminates with: `data: "[DONE]"` — a JSON string literal, NOT a named "done" event.

=== REQUIRED CLIENT CHANGES (stream consumer only) ===
1. Replace ALL eventSource.addEventListener('name', ...) handlers with a SINGLE eventSource.onmessage handler. Parse each event.data with JSON.parse inside try/catch; on parse failure, skip the message (dev-only console.warn), never crash.
2. If the parsed value === "[DONE]" (the string), close the EventSource cleanly, mark the run complete, finalize all UI to its completed state, and refresh the SEMrush balance / persist the run. This is the ONLY completion signal — there is no "done" event.
3. If the parsed object has event === "final", read its .data.output object and map each blockId to results:
   - block 40141cd2 → primary/secondary shortlist (aishortlisting / validationpass primary & secondary).
   - block 2d472f89 → alignment scores (alignmentscoring.scores).
   Defensively coerce all numeric fields to number|null and render "—" for null (never 0 or NaN).
4. Otherwise, the parsed object is a progress chunk of shape {blockId, chunk}: use it to advance the progress tracker instead of expecting named step/variants/urls events. Best-effort map chunks to the existing stages; if a chunk does not map cleanly, ignore it — do not crash.
5. On eventSource.onerror: ONLY show the "connection lost" error if NO "[DONE]" and NO "final" has been received yet. If "[DONE]" or "final" already arrived, treat the socket close as SUCCESS and do NOT show the error. Track this with a flag (e.g. completionReceived) set when "[DONE]"/"final" is handled.
6. Keep the existing two-step init→stream flow, the single-use token behavior, retry-always-from-init behavior, and ALL existing UI panels (form, 6/7-step progress tracker, competitor URLs, all-source keywords, final results, SEMrush balance, persisted restore, PDF export, iframe postMessage) fully intact.

=== SERVER-SIDE HARDCODED VALUE UPDATES (Node route handlers ONLY — never NEXT_PUBLIC, never client bundle) ===
- API key: sk-sim-u8VM1oPDuO05H38_Nh6CVvuMUaCfgHmQ (replace the old key everywhere it appears server-side).
- selectedOutputs array must be EXACTLY: ["aishortlisting.primary","aishortlisting.secondary","validationpass.primary","validationpass.secondary","validationpass.warning.type","validationpass.warning.description","alignmentscoring.scores"]
- Endpoint stays: POST https://test-agent.thearena.ai/api/workflows/54171ae9-160a-4967-9ac7-8590e6ee561f/execute with header X-API-Key and JSON body {keyword, intent, client, stream:true, selectedOutputs}. Mirror method, headers, and body shape EXACTLY — do not rename, reshape, or change casing of any field.
- Keep export const runtime = 'nodejs'; and export const dynamic = 'force-dynamic'; on every route that proxies to the pipeline.
- Continue to stream the upstream SSE response straight through (do not buffer or call upstream.json() on the stream route); forward upstream !ok status + error text to the client.

=== DO NOT CHANGE ===
Do not alter the data contracts, the form, the tiering logic, the PDF export, the persisted-run restore, the iframe embedding notifications, the theme/layout, or any other behavior described in the original spec. This is a surgical edit of the stream consumer and the server-side hardcoded values ONLY.

=== RENDER ALL SIX DATA PANELS (do not drop any) ===
Populate live from streamed {blockId,chunk} data and finalize from {event:final}.
Stack in the results column in order. Coerce numerics to number|null, render "—" for null.
Format volumes with thousands separators + optional k (1,000 / 60.5k / 110,000).
Never crash on partial data — show a skeleton until the panel's data arrives.

1. Seed form + Query Variants: "Seed Keyword" input; "Page Intent" as two selectable
   cards (Commercial/Transactional — Service pages, pricing, booking; Informational/
   Educational — Guides, FAQs, how-to content); Start Research + Reset. After variants:
   card "Query Variants" ✓ Done, subtitle "Generated N commercial query variants";
   seed keyword as ★ pill then one pill per variant.

2. URL Scoring: card ✓ Done, subtitle "Selected top N pages from M candidates".
   Grid of numbered cards (1..N): purple number badge, domain (bold), page title,
   green "page" badge, optional "2/6 queries" badge, score right-aligned (0.97/0.93).

3. SEMrush Keywords: card ✓ Done, subtitle "Collected N keywords across all pages".
   Group BY competitor URL (header = URL ✓ + link + right-aligned "N keywords");
   keyword pills = keyword + inline volume (1.0k / 60.5k / 0 muted).

4. Primary Keywords: section with green "X / Y selected". One card per primary keyword:
   title, PRIMARY purple badge, "Search Volume" + big number (1,000 / 390), rationale.

5. Secondary Keywords: section with green "X / Y selected". Table # | KEYWORD | VOLUME,
   one row per keyword, volume right-aligned (720 / 480 / 110,000 / 6,600).

6. All source keywords: collapsible, right-aligned "N available" + chevron (open by
   default). Two subsections: "Relevant — Appears across 2 competitor pages" and
   "Discovery — Unique to a single competitor page", each = keyword + right-aligned volume.

PDF export must include all six panels. Keep dark theme, spacing, badge colors
(green = done/relevant, purple = primary/number badges).
