# Repository Summary: keyword_research_agent

> Auto-maintained by Sim Development. Last updated: 2026-07-28T07:37:00.849Z.

## Overview

Keyword Research — live streaming keyword research that expands a seed keyword into a validated, competitor-backed shortlist.

**Repository:** `keyword-research-agent`  
**File count:** 40

## Features

- Single onmessage SSE consumer matching the real wire format ({blockId,chunk} progress, event:'final' payload field, data:"[DONE]" terminator)
- Robust extraction of all 14 selectedOutputs with dotted-key and blockId fallback accessors
- URL Scoring panel bound to selectedUrls[].score rendered as-is
- Composite Scoring panel with Keyword | Volume | Position | CPC columns from candidates
- Exa Research panel removed from UI and PDF while kept in the request contract
- KD badges and Difficulty columns removed per UI fixes
- Persisted run restore, SEMrush balance widget, PDF export, and iframe postMessage notifications intact

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

- `components/AlignmentScoresPanel.tsx`
- `components/CompetitorUrlsPanel.tsx`
- `components/CompositeScoringPanel.tsx`
- `components/DedupKeywordsPanel.tsx`
- `components/ErrorBoundary.tsx`
- `components/ErrorCard.tsx`
- `components/ExaResearchPanel.tsx`
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
- `components/AlignmentScoresPanel.tsx`
- `components/CompetitorUrlsPanel.tsx`
- `components/CompositeScoringPanel.tsx`
- `components/DedupKeywordsPanel.tsx`
- `components/ErrorBoundary.tsx`
- `components/ErrorCard.tsx`
- `components/ExaResearchPanel.tsx`
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

- **Updated at:** 2026-07-28T07:37:00.849Z
- **Request:** EDIT the existing generated Next.js app IN PLACE in the same repository — do NOT create a new repo, do NOT regenerate from scratch. Apply the targeted fixes below and keep every other prompt requirement, UI panel, and file unchanged.

=== CRITICAL BUG TO FIX: SSE STREAM CONSUMER USES WRONG WIRE FORMAT ===
The current client consumes the stream with NAMED event listeners: eventSource.addEventListener('step'|'variants'|'urls'|'result'|'fail'|'done', ...). This is WRONG. The upstream pipeline does NOT emit named SSE events. It emits ONLY default `message` events. Rewrite the stream consumer to the REAL wire format below.

=== REAL WIRE FORMAT (verified against the live endpoint) ===
- Every line is a plain default SSE message: `data: <json>` with NO `event:` line.
- Progress chunks look like: `data: {"blockId":"<uuid>","chunk":"<string-or-json-string>"}`
- The final result looks like: `data: {"event":"final","data":{"output":{ ... }}}` — the "final" marker is a FIELD inside the JSON, NOT an SSE event name.
- The stream terminates with: `data: "[DONE]"` — a JSON string literal, NOT a named "done" event.

=== REQUIRED CLIENT CHANGES (stream consumer only) ===
1. Replace ALL eventSource.addEventListener('name', ...) handlers with a SINGLE eventSource.onmessage handler. Parse each event.data with JSON.parse inside try/catch; on parse failure, skip the message (dev-only console.warn), never crash.
2. If the parsed value === "[DONE]" (the string), close the EventSource cleanly, mark the run complete, finalize all UI to its completed state, and refresh the SEMrush balance / persist the run. This is the ONLY completion signal — there is no "done" event.
3. If the parsed object has event === "final", read its .data.output object and extract results for EVERY selected output (see the 14-key contract below). Defensively coerce all numeric fields to number|null and render "—" for null (never 0 or NaN).
4. Otherwise, the parsed object is a progress chunk of shape {blockId, chunk}: use it to advance the progress tracker and to populate the intermediate panels live. Best-effort map chunks to the existing stages; if a chunk does not map cleanly, ignore it — do not crash.
5. On eventSource.onerror: ONLY show the "connection lost" error if NO "[DONE]" and NO "final" has been received yet. If "[DONE]" or "final" already arrived, treat the socket close as SUCCESS and do NOT show the error. Track this with a flag (e.g. completionReceived) set when "[DONE]"/"final" is handled.
6. Keep the existing two-step init→stream flow, the single-use token behavior, retry-always-from-init behavior, and ALL existing UI panels (form, progress tracker, competitor URLs, all-source keywords, final results, SEMrush balance, persisted restore, PDF export, iframe postMessage) fully intact.

=== SERVER-SIDE HARDCODED VALUE UPDATES (Node route handlers ONLY — never NEXT_PUBLIC, never client bundle) ===
- API key: sk-sim-u8VM1oPDuO05H38_Nh6CVvuMUaCfgHmQ (replace the old key everywhere it appears server-side).
- selectedOutputs array must be EXACTLY these 14 entries, in this order (do NOT drop, reorder-drop, or hardcode a subset): ["dedup&volumenormalize.result","aggregatesemrushrows.result","queryexpansion.variants","serpfetch.result","aishortlisting.primary","aishortlisting.secondary","validationpass.primary","validationpass.secondary","validationpass.warning.type","validationpass.warning.description","exasearch.results","urlscoring&selection.result","compositescoring.result","alignmentscoring.scores"]
- Endpoint stays: POST https://test-agent.thearena.ai/api/workflows/54171ae9-160a-4967-9ac7-8590e6ee561f/execute with header X-API-Key and JSON body {keyword, intent, client, stream:true, selectedOutputs}. Mirror method, headers, and body shape EXACTLY — do not rename, reshape, or change casing of any field.
- Keep export const runtime = 'nodejs'; and export const dynamic = 'force-dynamic'; on every route that proxies to the pipeline.
- Continue to stream the upstream SSE response straight through (do not buffer or call upstream.json() on the stream route); forward upstream !ok status + error text to the client.

=== PARSE AND RENDER ALL 14 RESPONSE FIELDS (do not drop or hardcode a subset) ===
The final `event:final` payload's `.data.output` object contains results for the 14 selected outputs. Read EVERY one of these exact keys. Tolerate BOTH shapes: (a) the output object keyed directly by the dotted selectedOutput string (e.g. output["aishortlisting.primary"]), and (b) the output object keyed by blockId whose value contains the named fields. Build a robust accessor that, for each selectedOutput "block.field", first tries output["block.field"], then output[block]?.[field], then any blockId entry that carries that field. Never assume a fixed blockId. If a key is absent, render an empty/skeleton state for that panel — never crash.

The 14 fields and how each must surface in the UI:
1. queryexpansion.variants → "Query Variants" panel: seed keyword as ★ pill, then one pill per variant; subtitle "Generated N commercial query variants".
2. serpfetch.result → "SERP Results" panel: list of fetched SERP entries (rank, title, domain/URL) grouped/ordered as returned.
3. urlscoring&selection.result → "URL Scoring" panel: numbered cards (1..N): purple number badge, domain (bold), page title, green "page" badge, optional "X/Y queries" badge, score right-aligned. Subtitle "Selected top N pages from M candidates".
4. aggregatesemrushrows.result → "SEMrush Keywords" panel: group BY competitor URL (header = URL ✓ + link + right-aligned "N keywords"); keyword pills = keyword + inline volume (1.0k / 60.5k / 0 muted). Subtitle "Collected N keywords across all pages".
5. dedup&volumenormalize.result → "Deduplicated & Normalized Keywords" panel: unified keyword list with normalized volume (thousands separators + optional k). Show count "N unique keywords".
6. exasearch.results → (do NOT render — see ROUND 2 fix #2 below; still request it in the contract).
7. compositescoring.result → "Composite Scoring" panel: see ROUND 2 fix #3 for the exact columns.
8. alignmentscoring.scores → "Alignment Scores" panel: keyword/entity rows with their alignment score (coerce numeric to number|null, "—" for null).
9. aishortlisting.primary → part of "Primary Keywords" section: one card per primary keyword: title, PRIMARY purple badge, "Search Volume" + big number, rationale.
10. aishortlisting.secondary → part of "Secondary Keywords" section: table # | KEYWORD | VOLUME, one row per keyword, volume right-aligned.
11. validationpass.primary → validated/final Primary Keywords: use to mark "X / Y selected" (green) and confirm which primaries passed validation.
12. validationpass.secondary → validated/final Secondary Keywords: use to mark "X / Y selected" (green) and confirm which secondaries passed validation.
13. validationpass.warning.type → render a warning banner/badge at the top of the results column showing the warning type (only when present).
14. validationpass.warning.description → the warning banner body text (only when present); style as a non-blocking amber/warning callout.

=== RENDERING RULES (apply to all panels) ===
- Stack every panel in the results column. Populate intermediate panels live from streamed {blockId,chunk} data where possible, and finalize all panels from the event:final payload.
- Coerce numerics to number|null, render "—" for null. Format volumes with thousands separators + optional k (1,000 / 60.5k / 110,000).
- Never crash on partial data — show a skeleton until the panel's data arrives; if a field is missing from the final payload, show an empty-state for that panel.
- Seed form: "Seed Keyword" input; "Page Intent" as two selectable cards (Commercial/Transactional — Service pages, pricing, booking; Informational/Educational — Guides, FAQs, how-to content); Start Research + Reset.
- PDF export MUST include the rendered panels. Keep dark theme, spacing, and badge colors (green = done/relevant/selected, purple = primary/number badges, amber = warnings).

=== UI FIXES ROUND 2 (AUTHORITATIVE — these OVERRIDE any conflicting instruction above; apply surgically, change nothing else) ===

FIX 1 — URL SCORING PANEL score renders 0.00 for every row (BUG). The data lives at the URL-scoring output's `.selectedUrls` array — NOT at `.result` directly. Each entry has: { url, title, snippet, position, domain, score, scoreBreakdown:{positionScore,typeScore,overlapScore,intentScore} }, where `score` is a NUMBER (already rounded to 2 decimals, roughly 20–95). Fix the accessor and binding:
  const uScore = out["urlscoring&selection.result"] || out["urlscoring&selection"]?.result || (any blockId entry whose value has a `selectedUrls` array);
  const rows = uScore?.selectedUrls || [];
  for each entry: render score = Number(entry.score); DISPLAY IT AS-IS (e.g. 72.35), do NOT divide by 100, do NOT read entry.finalScore / entry.compositeScore / entry.relevanceScore (those do not exist). Optional "X/Y queries" badge may use entry.scoreBreakdown when present. Subtitle count from rows.length and uScore.urls?.length.

FIX 2 — Remove the "Exa Research" panel ENTIRELY from the results column AND from the PDF export. Keep exasearch.results in the selectedOutputs contract (do NOT remove it from the request body) — simply render nothing for it.

FIX 3 — COMPOSITE SCORING PANEL: show ONLY these FOUR columns, in this exact order: Keyword | Volume | Position | CPC. The data is at the composite-scoring output's `.candidates` array; each candidate has { keyword, volume, position, cpc, ...ignore the rest }. Bind: Keyword→candidate.keyword, Volume→candidate.volume (volume-formatted with thousands separators), Position→candidate.position, CPC→candidate.cpc (format as a currency/number, "—" if null). REMOVE every other column from this table (difficulty, urlFrequency, volumeScore, alignmentScore, compositeScore, etc.). Access candidates via: (out["compositescoring.result"]?.candidates) || (out["compositescoring"]?.result?.candidates) || [].

FIX 4 — "ALL SOURCE KEYWORDS" panel (the SEMrush / deduplicated keywords table): REMOVE the Difficulty column entirely — drop both the column header AND the per-row difficulty cell. Leave all other columns intact.

FIX 5 — "Final Results" section: REMOVE the literal "KD —" text/label wherever it appears on the primary/secondary keyword cards (delete the KD label and its dash placeholder entirely).

FIX 6 — "Secondary Keywords" table: REMOVE the literal "KD —" text/label from every row (delete the KD label/column/cell entirely).

=== DO NOT CHANGE ===
Do not alter the two-step init→stream flow, the form, the tiering logic, the persisted-run restore, the iframe embedding notifications, or the theme/layout beyond the fixes above. This is a surgical edit of the stream consumer, the server-side hardcoded values (API key + full 14-item selectedOutputs), and the results rendering (all 14 fields plus ROUND 2 fixes 1-6) ONLY.
