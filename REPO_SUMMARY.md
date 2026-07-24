# Repository Summary: Keyword Research

> Auto-maintained by Sim Development. Last updated: 2026-07-24T10:32:23.160Z.

## Overview

Live streaming keyword research — expand a seed keyword into a validated, competitor-backed shortlist with real-time pipeline progress, editable results, PDF export, and persisted run restore.

**Repository:** `keyword-research-agent`  
**File count:** 33

## Features

- Two-step init + SSE streaming pipeline proxy with server-side API key
- 6-step live progress tracker driven by step events
- Competitor URLs panel with per-URL live status
- Tiered all-source-keywords panel (Core / Relevant / Discovery)
- Editable primary and secondary keyword results with copy-as-table
- Client-side PDF export via jsPDF
- Persisted run restore from Neon Postgres via Prisma
- SEMrush balance widget and iframe postMessage notifications

## Tech Stack

- Next.js ^15.3.3 (App Router)
- React ^19.0.0
- Tailwind CSS v3
- TypeScript
- Prisma + PostgreSQL (Neon on Vercel)

## Infrastructure

- **Neon project ID:** `steep-boat-23210656` — managed by Sim Development; do not delete or replace
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
- `components/ResearchForm.tsx`
- `components/ResultsSection.tsx`
- `components/SemrushBalanceWidget.tsx`
- `components/SourceKeywordsPanel.tsx`

### Libraries

- `lib/pdf.ts`
- `lib/prisma.ts`
- `lib/types.ts`
- `prisma/schema.prisma`

### Config

- `.env.example`
- `.gitignore`
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
- `.gitignore`
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
- `components/ResearchForm.tsx`
- `components/ResultsSection.tsx`
- `components/SemrushBalanceWidget.tsx`
- `components/SourceKeywordsPanel.tsx`
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

- **Updated at:** 2026-07-24T10:32:23.160Z
- **Request:** Generate a production-quality React/Next.js (App Router, TypeScript) single-page UI called "Keyword Research" that drives the existing keyword-research pipeline described below and renders its LIVE streaming results with a polished, interactive UX.

=== SERVER ROUTE(S) — PROXY TO THE PIPELINE API (fill in below) ===

curl -X POST \
  -H "X-API-Key: $SIM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"keyword":"example","intent":"example","client":"example","stream":true,"selectedOutputs":["aishortlisting.primary","aishortlisting.secondary","validationpass.primary","validationpass.secondary","validationpass.warning.type","validationpass.warning.description"]}' \
  https://test-agent.thearena.ai/api/workflows/54171ae9-160a-4967-9ac7-8590e6ee561f/execute

API KEY: sk-sim-vJIseojhA6QZk-QL5FgPE159Vzr8-L6h

Requirements for whatever is pasted above:
  - Hardcode any API key SERVER-SIDE ONLY inside the relevant Next.js route handler(s) (e.g. app/api/keyword-research/init/route.ts) — never expose it in the client bundle or any NEXT_PUBLIC var.
  - export const runtime = 'nodejs'; export const dynamic = 'force-dynamic'; on every route that proxies to the pipeline.
  - Mirror the curl's method, headers, and body shape EXACTLY — do not rename, reshape, or alter casing of any field.
  - If the /stream endpoint is a true Server-Sent Events GET endpoint (per the curl), the Next.js route must pipe the upstream response straight through as a stream (return new Response(upstream.body, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' } })) — do NOT buffer or call upstream.json() on it.
  - If /init is a plain JSON POST/response (per the curl), forward it as normal JSON, no streaming needed there.
  - Handle upstream !ok by forwarding status + error text to the client rather than swallowing it.
  - The client must call ONLY these local Next.js routes, never the upstream pipeline URL directly.

=== FLOW: INIT THEN STREAM (two-step, not one-shot) ===
This pipeline is NOT a single fetch-and-stream call. It is two sequential steps:
  1. On submit, POST to the local /api/keyword-research/init route with body { keyword, intent, client?, feedbackKbIds? }. This returns { token }. Handle failure here explicitly (e.g. missing SEMrush config server-side, rate-limited) with an on-brand error state before ever opening a stream.
  2. Immediately after receiving the token, open GET /api/keyword-research/stream/:token as an EventSource (native browser EventSource API, not a manual fetch+reader loop, unless the pasted curl indicates the upstream is a raw POST stream — if so, use fetch + reader.getReader() instead and adapt event parsing accordingly; match whichever transport the curl actually shows).
  3. The token is single-use server-side — if the connection drops and the user retries, re-run step 1 to get a fresh token before reopening step 2. Never attempt to reopen a stream with an already-consumed token; the retry flow always starts from init.

=== SSE EVENT CONTRACT (exact — implement a typed listener per event name) ===
Attach named listeners per event (`eventSource.addEventListener('eventName', ...)` for EventSource, or manual line-based dispatch by event name if using fetch+reader per the curl's actual wire format):

  | Event | Payload meaning | UI effect |
  |---|---|---|
  | step | { stage: 'variants'|'search'|'url_scoring'|'semrush'|'analysis'|'scoring'|'validation', status: 'active'|'done' } | Updates the 6-step progress tracker (see below) |
  | variants | the generated query variants (array of strings) | optional detail shown in an expandable "what we searched" area near the progress tracker |
  | urls | the top 10 scored competitor URLs | populates the "Competitor URLs" list as it becomes available |
  | url_status / url_keywords | per-URL SEMrush fetch progress and results | updates a per-URL row (pending → fetching → N keywords found) inside the Competitor URLs list |
  | allKeywords | the full deduplicated, scored keyword pool | powers the "All source keywords" panel — store this as soon as it arrives, even before `result` |
  | result | final { primary: PrimaryKeyword[], secondary: SecondaryKeyword[], warning?: string } | populates the final results section; if `warning` is present, show an amber warning banner (see below) |
  | fail | { message: string } | abort the run, close the stream, show an on-brand error card with the message and a Retry button that restarts the run from init |
  | done | stream end signal, no payload | close the stream cleanly; finalize all UI to its completed state |

  Always close the connection on `fail` and on `done` — never leave a dangling open stream. Wrap all JSON.parse of event payloads in try/catch; a malformed event should be logged (console.warn, dev-only) and skipped, never crash the page.

=== TYPESCRIPT DATA CONTRACTS (exact field names — do not rename/alias/reshape) ===
  interface PrimaryKeyword {
    keyword: string;
    volume: number | null;
    difficulty: number | null;
    rationale: string | null;
  }
  interface SecondaryKeyword {
    keyword: string;
    volume: number | null;
    difficulty: number | null;
  }
  interface SourceKeyword {
    keyword: string;
    urlFrequency: number;
    volume: number | null;
    difficulty: number | null;
    compositeScore: number;
  }
  interface CompetitorUrl {
    url: string;
    domain: string;
    score: number;
    keywordsFound?: SourceKeyword[]; // populated progressively via url_status/url_keywords
    status: 'pending' | 'fetching' | 'done' | 'error';
  }
  interface ResultPayload {
    primary: PrimaryKeyword[]; // exactly 2, but render defensively for any length returned
    secondary: SecondaryKeyword[]; // exactly 10, but render defensively for any length returned
    warning?: string | null;
  }
  All numeric fields (volume, difficulty, compositeScore, score) must be defensively coerced to `number | null` when consumed from event payloads — never crash on a missing/malformed value; render "—" for null in the UI rather than 0 or NaN.

=== FORM (top of page) ===
Centered card, max-w-2xl mx-auto, with:
  - Seed Keyword (required text input, non-empty validation)
  - Intent toggle: Commercial / Informational (segmented control, not a dropdown — this is a binary choice used prominently in the pipeline)
  - Optional Client/Brand selector (searchable select or combobox; if the app has a known list of clients fetch it, otherwise render as an optional free-text/async-searchable field — leave a TODO comment if the client list source isn't specified)
  - Submit button "Research Keywords" — on click: disable button, switch to loading state, POST /init, then open the stream. Show a distinct micro-error inline on the form itself if /init fails (e.g. "SEMrush isn't configured — contact your admin") before any progress UI appears.
  - A Cancel button appears once the stream opens, closing the connection and returning to idle state without submitting a fresh run.

=== 6-STEP PROGRESS TRACKER ===
A vertical or horizontal stepper (responsive: vertical on mobile, horizontal on desktop) with one row per distinct `stage` value observed in the `step` event enum above, in that exact order — do not add, remove, rename, or reorder stages:
  1. variants → "Expanding your keyword"
  2. search → "Searching competitor SERPs"
  3. url_scoring → "Scoring competitor pages"
  4. semrush → "Pulling ranking keywords"
  5. analysis → "Analyzing keyword alignment"
  6. scoring → "Building the shortlist"
  7. validation → "Validating results"
  Each row: pending (dim, no icon) → active (pulsing spinner icon) → done (checkmark), driven purely by `step` events. A stage never regresses from done back to active.

=== COMPETITOR URLS PANEL (populated by `urls`, then updated by `url_status`/`url_keywords`) ===
A collapsible/expandable list card, populated the moment the `urls` event fires (10 rows, each showing the URL/domain + its score), then each row updates live as `url_status`/`url_keywords` events arrive for it — status text such as "Fetching…" → "18 keywords found" per row, with a small spinner/checkmark per row matching its own state independent of the others. Do not wait for all 10 to finish before showing the panel — render immediately with all 10 in pending state, then fill in as data streams.

=== FINAL RESULTS SECTION (from the `result` event) ===
The primary deliverable of the page — render prominently once `result` arrives:
  - If `warning` is present and non-null: show a full-width amber warning banner directly above the results with an alert icon and the warning text verbatim (do not paraphrase or hide it).
  - 2 Primary Keywords: rendered as prominent, visually distinct cards (larger, accent border) — each showing the keyword, a volume badge, a difficulty badge (color-graded low/med/high), and the rationale as readable prose beneath. These are editable: allow inline editing of the keyword text (a pencil/edit icon toggles an input in place).
  - 10 Secondary Keywords: rendered as a clean, denser list/table (keyword, volume, difficulty per row), also inline-editable per the same pattern, visually subordinate to the primary cards (smaller, no accent border).
  - A "Copy as table" button that copies primary+secondary keywords as a tab-separated or markdown table suitable for pasting into a spreadsheet or doc.

=== ALL SOURCE KEYWORDS PANEL (from `allKeywords`, populate as soon as it arrives — don't wait for `result`) ===
A separate, collapsible panel below/beside the final results, client-side tiered into three labeled groups (compute the tiering client-side from `urlFrequency`, do not expect the server to pre-tier it):
  - Core — urlFrequency >= 3
  - Relevant — urlFrequency === 2
  - Discovery — urlFrequency === 1
  Each tier is its own labeled sub-section with a count badge, sorted by volume descending within the tier. Render as a scannable list/table (keyword, volume, difficulty, urlFrequency) — never raw JSON. This panel can and should populate and be browsable WHILE the rest of the pipeline is still running, since `allKeywords` arrives before `result`.

=== SEMRUSH BALANCE WIDGET ===
A small, persistent header-adjacent widget (top-right of the page or near the form) that calls GET /api/semrush/balance on page load and displays remaining SEMrush units. Refresh it again after a run completes (on `done`), since a run consumes units. Handle a failed balance fetch gracefully (hide the widget or show "—" rather than an error state that distracts from the main flow).

=== PERSISTED RUN RESTORE (page refresh) ===
On mount, call GET /api/runs?tool=keyword-research&limit=1. If a saved run exists, restore the form inputs and the final results section (primary/secondary/warning) directly into their completed state WITHOUT replaying the stream or progress tracker — this is a static restore of a past result, not a live run. Show a subtle "Restored from your last run" note with a "Start new research" action that clears this and shows an empty form.
On a NEW run completing successfully (`done` received with no `fail`), POST /api/runs with { tool: 'keyword-research', label, inputs, output, status } to persist it for the next refresh-restore. This save failing should never block or error out the visible results — fail silently with a dev console warning.

=== IFRAME EMBEDDING NOTIFICATION ===
If this page is embedded (detect via `window.parent !== window`), postMessage to the parent on run start (right after a successful /init) and on run finish (`done` or `fail`), with a small structured payload (e.g. { type: 'keyword-research:start' | 'keyword-research:finish', ... }) so a host app can log it in its own history. This must never throw or block the main flow if there's no parent listener.

=== ERROR HANDLING ===
- /init failure (before any stream opens): inline form-level error, specific message if available (e.g. missing SEMrush config, rate limited — "Too many requests, try again in a minute").
- `fail` event mid-stream: close the connection, show a full on-brand error card in place of the progress tracker/results area with the server's message and a Retry button that restarts the whole flow from /init with the same form inputs.
- Any malformed/unexpected event payload: log dev-only, skip, never crash the page.

=== LAYOUT / THEME ===
No header/nav/footer beyond the SEMrush balance widget. Centered, responsive single-page container (off-white background, ink-navy text, indigo/violet accent). Clear card-based sectioning with rounded corners, subtle shadows, visible focus states, respects prefers-reduced-motion. Staged reveal: each panel (progress tracker, competitor URLs, all-source-keywords, final results) appears the moment its first relevant event arrives, animating in rather than popping. Fully responsive, production-quality component structure (one component per panel) with an error boundary.

=== DOWNLOAD AS PDF (whole-output export) ===
Once a run is complete (final `result` received, or a restored past run loaded), show a "Download as PDF" button at the top level of the results area (near "Copy as table" and the warning banner, not buried in a sub-panel). Requirements:
  - Disabled until results exist (either a completed live run or a restored saved run); tooltip while disabled: "Available once results are ready."
  - Generate entirely CLIENT-SIDE (no new server route) using a browser-compatible library installed as a normal npm dependency (e.g. html2pdf.js, or jsPDF + html2canvas) — do not hand-roll canvas/text-layout code.
  - The exported PDF includes, in this fixed order:
      1. Header: seed keyword, intent (Commercial/Informational), client/brand if selected, and generation date.
      2. The warning banner text, if present, rendered as a clearly flagged note (not silently omitted).
      3. Primary Keywords (2) — keyword, volume, difficulty, rationale — as a clearly labeled section, each keyword as its own block (not squeezed into a cramped table row, since rationale is prose).
      4. Secondary Keywords (10) — as a clean table: keyword | volume | difficulty.
      5. All Source Keywords — as three labeled tier sections (Core / Relevant / Discovery), each a table: keyword | volume | difficulty | urlFrequency. If this section makes the PDF very long, that's acceptable — completeness over brevity for this export.
  - Page-break rules: avoid splitting a single primary-keyword block or a table row across a page boundary where avoidable.
  - Filename pattern: `keyword-research-<slugified-seed-keyword>.pdf` (fallback `keyword-research-report.pdf` if the keyword can't be slugified cleanly).
  - On click: inline loading/spinner state on the button itself; do not block or disable the rest of the page while generating.
  - Wrap generation in try/catch; on failure show a small inline error message near the button ("Could not generate PDF, please try again") without crashing the page or losing any on-screen results.
  - Respect prefers-reduced-motion for the button's own loading animation.

=== NON-GOALS ===
Do not add authentication UI beyond what's implied (the route sits behind the app's existing login). Do not attempt to configure or validate the OpenAI/SEMrush/Google/Serper API keys from the client — those are server-side concerns beyond the pasted curl(s) above.
