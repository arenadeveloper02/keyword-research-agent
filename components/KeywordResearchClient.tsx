"use client"

import { useEffect, useRef, useState } from 'react';
import type {
  CompetitorUrl,
  Intent,
  PrimaryKeyword,
  ResultPayload,
  RunInputs,
  SecondaryKeyword,
  SourceKeyword,
  Stage,
  StageStatus,
} from '@/lib/types';
import ResearchForm from '@/components/ResearchForm';
import ProgressTracker from '@/components/ProgressTracker';
import QueryVariantsPanel from '@/components/QueryVariantsPanel';
import CompetitorUrlsPanel from '@/components/CompetitorUrlsPanel';
import SemrushKeywordsPanel from '@/components/SemrushKeywordsPanel';
import SourceKeywordsPanel from '@/components/SourceKeywordsPanel';
import ResultsSection from '@/components/ResultsSection';
import SemrushBalanceWidget from '@/components/SemrushBalanceWidget';
import ErrorCard from '@/components/ErrorCard';

type RunStatus = 'idle' | 'initializing' | 'streaming' | 'complete' | 'failed';

const STAGE_KEYS: Stage[] = ['variants', 'search', 'url_scoring', 'semrush', 'analysis', 'scoring', 'validation'];

const INITIAL_STAGES: Record<Stage, StageStatus> = {
  variants: 'pending',
  search: 'pending',
  url_scoring: 'pending',
  semrush: 'pending',
  analysis: 'pending',
  scoring: 'pending',
  validation: 'pending',
};

const ALL_DONE_STAGES: Record<Stage, StageStatus> = {
  variants: 'done',
  search: 'done',
  url_scoring: 'done',
  semrush: 'done',
  analysis: 'done',
  scoring: 'done',
  validation: 'done',
};

// Known upstream block-id prefixes mapped to result payloads.
const SHORTLIST_BLOCK_PREFIX = '40141cd2';
const ALIGNMENT_BLOCK_PREFIX = '2d472f89';

function devWarn(...args: unknown[]): void {
  if (process.env.NODE_ENV !== 'production') console.warn(...args);
}

function toNumOrNull(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

function coercePrimary(v: unknown): PrimaryKeyword[] {
  return asArray(v)
    .map((item) => {
      const o = asRecord(item);
      return {
        keyword: typeof o.keyword === 'string' ? o.keyword : '',
        volume: toNumOrNull(o.volume),
        difficulty: toNumOrNull(o.difficulty),
        rationale: typeof o.rationale === 'string' ? o.rationale : null,
      };
    })
    .filter((k) => k.keyword.length > 0);
}

function coerceSecondary(v: unknown): SecondaryKeyword[] {
  return asArray(v)
    .map((item) => {
      const o = asRecord(item);
      return {
        keyword: typeof o.keyword === 'string' ? o.keyword : '',
        volume: toNumOrNull(o.volume),
        difficulty: toNumOrNull(o.difficulty),
      };
    })
    .filter((k) => k.keyword.length > 0);
}

function coerceSource(v: unknown): SourceKeyword[] {
  return asArray(v)
    .map((item) => {
      const o = asRecord(item);
      return {
        keyword: typeof o.keyword === 'string' ? o.keyword : '',
        urlFrequency: toNumOrNull(o.urlFrequency) ?? 0,
        volume: toNumOrNull(o.volume),
        difficulty: toNumOrNull(o.difficulty),
        compositeScore: toNumOrNull(o.compositeScore) ?? toNumOrNull(o.score) ?? 0,
      };
    })
    .filter((k) => k.keyword.length > 0);
}

function coerceUrls(v: unknown): CompetitorUrl[] {
  return asArray(v)
    .map((item) => {
      const o = asRecord(item);
      const url = typeof o.url === 'string' ? o.url : '';
      let domain = typeof o.domain === 'string' ? o.domain : '';
      if (!domain && url) {
        try {
          domain = new URL(url).hostname;
        } catch {
          domain = url;
        }
      }
      const keywords = Array.isArray(o.keywords) ? coerceSource(o.keywords) : undefined;
      return {
        url,
        domain,
        score: toNumOrNull(o.score) ?? 0,
        title: typeof o.title === 'string' ? o.title : null,
        matchedQueries: toNumOrNull(o.matchedQueries) ?? toNumOrNull(o.queries),
        totalQueries: toNumOrNull(o.totalQueries),
        keywordsFound: keywords && keywords.length > 0 ? keywords : undefined,
        status: 'done' as const,
      };
    })
    .filter((u) => u.url.length > 0);
}

function coerceWarning(v: unknown): string | null {
  if (typeof v === 'string' && v.length > 0) return v;
  const o = asRecord(v);
  const description = typeof o.description === 'string' ? o.description : '';
  const type = typeof o.type === 'string' ? o.type : '';
  if (description) return type ? `${type}: ${description}` : description;
  return null;
}

// Pulls a { primary, secondary, warning } shortlist out of a final block output,
// whether it is flat or nested under validationpass / aishortlisting.
function extractShortlist(v: unknown): ResultPayload | null {
  const o = asRecord(v);
  let primary = coercePrimary(o.primary);
  let secondary = coerceSecondary(o.secondary);
  let warning = coerceWarning(o.warning);
  if (primary.length === 0 && secondary.length === 0) {
    const nestedCandidates = [asRecord(o.validationpass), asRecord(o.aishortlisting)];
    for (const nested of nestedCandidates) {
      const p = coercePrimary(nested.primary);
      const s = coerceSecondary(nested.secondary);
      if (p.length > 0 || s.length > 0) {
        primary = p;
        secondary = s;
        warning = warning ?? coerceWarning(nested.warning);
        break;
      }
    }
  }
  if (primary.length === 0 && secondary.length === 0) return null;
  return { primary, secondary, warning };
}

// Pulls alignment scores (alignmentscoring.scores) out of a final block output.
function extractScores(v: unknown): SourceKeyword[] {
  if (Array.isArray(v)) return coerceSource(v);
  const o = asRecord(v);
  if (Array.isArray(o.scores)) return coerceSource(o.scores);
  const nested = asRecord(o.alignmentscoring);
  if (Array.isArray(nested.scores)) return coerceSource(nested.scores);
  return [];
}

export default function KeywordResearchClient() {
  const [keyword, setKeyword] = useState('');
  const [intent, setIntent] = useState<Intent>('commercial');
  const [clientName, setClientName] = useState('');
  const [status, setStatus] = useState<RunStatus>('idle');
  const [initError, setInitError] = useState<string | null>(null);
  const [stages, setStages] = useState<Record<Stage, StageStatus>>(INITIAL_STAGES);
  const [variants, setVariants] = useState<string[]>([]);
  const [urls, setUrls] = useState<CompetitorUrl[]>([]);
  const [allKeywords, setAllKeywords] = useState<SourceKeyword[]>([]);
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [failMessage, setFailMessage] = useState<string | null>(null);
  const [isRestored, setIsRestored] = useState(false);
  const [balanceRefresh, setBalanceRefresh] = useState(0);

  const esRef = useRef<EventSource | null>(null);
  const finishedRef = useRef(false);
  const startedRef = useRef(false);
  // Set once "[DONE]" or the embedded {event:"final"} marker arrives — a socket
  // close after this point is SUCCESS, never a connection error.
  const completionRef = useRef(false);
  const seenBlocksRef = useRef<Set<string>>(new Set());
  const chunkBuffersRef = useRef<Map<string, string>>(new Map());
  const resultRef = useRef<ResultPayload | null>(null);
  const allKeywordsRef = useRef<SourceKeyword[]>([]);
  const inputsRef = useRef<RunInputs | null>(null);

  useEffect(() => {
    return () => {
      if (esRef.current) esRef.current.close();
    };
  }, []);

  // Restore the last completed run on mount (static restore, no stream replay).
  useEffect(() => {
    let cancelled = false;
    async function restore() {
      try {
        const res = await fetch('/api/runs?tool=keyword-research&limit=1');
        if (!res.ok) return;
        const data = (await res.json()) as { runs?: unknown };
        const runs = asArray(data.runs);
        if (runs.length === 0) return;
        const run = asRecord(runs[0]);
        const savedInputs = asRecord(run.inputs);
        const savedOutput = asRecord(run.output);
        const restoredKeyword = typeof savedInputs.keyword === 'string' ? savedInputs.keyword : '';
        if (!restoredKeyword) return;
        const primary = coercePrimary(savedOutput.primary);
        const secondary = coerceSecondary(savedOutput.secondary);
        if (primary.length === 0 && secondary.length === 0) return;
        if (cancelled || startedRef.current) return;
        const restoredIntent: Intent = savedInputs.intent === 'informational' ? 'informational' : 'commercial';
        const restoredClient = typeof savedInputs.client === 'string' ? savedInputs.client : '';
        const restoredResult: ResultPayload = {
          primary,
          secondary,
          warning: typeof savedOutput.warning === 'string' && savedOutput.warning ? savedOutput.warning : null,
        };
        const restoredSources = coerceSource(savedOutput.allKeywords);
        setKeyword(restoredKeyword);
        setIntent(restoredIntent);
        setClientName(restoredClient);
        inputsRef.current = { keyword: restoredKeyword, intent: restoredIntent, client: restoredClient || undefined };
        resultRef.current = restoredResult;
        setResult(restoredResult);
        allKeywordsRef.current = restoredSources;
        setAllKeywords(restoredSources);
        setIsRestored(true);
        setStatus('complete');
      } catch (err) {
        devWarn('Could not restore previous run', err);
      }
    }
    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  function postToParent(type: 'keyword-research:start' | 'keyword-research:finish', extra: Record<string, unknown>) {
    try {
      if (typeof window !== 'undefined' && window.parent !== window) {
        window.parent.postMessage({ type, tool: 'keyword-research', ...extra }, '*');
      }
    } catch (err) {
      devWarn('postMessage to parent failed', err);
    }
  }

  function closeStream() {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  }

  function resetRunState() {
    setStages(INITIAL_STAGES);
    setVariants([]);
    setUrls([]);
    setAllKeywords([]);
    setResult(null);
    setFailMessage(null);
    setInitError(null);
    resultRef.current = null;
    allKeywordsRef.current = [];
    seenBlocksRef.current = new Set();
    chunkBuffersRef.current = new Map();
  }

  async function persistRun(inputs: RunInputs) {
    const finalResult = resultRef.current;
    if (!finalResult) return;
    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'keyword-research',
          label: inputs.keyword,
          inputs,
          output: {
            primary: finalResult.primary,
            secondary: finalResult.secondary,
            warning: finalResult.warning ?? null,
            allKeywords: allKeywordsRef.current,
          },
          status: 'completed',
        }),
      });
      if (!res.ok) devWarn('Failed to persist run', res.status);
    } catch (err) {
      devWarn('Failed to persist run', err);
    }
  }

  function finalizeSuccess(inputs: RunInputs) {
    completionRef.current = true;
    if (finishedRef.current) return;
    finishedRef.current = true;
    closeStream();
    setStages({ ...ALL_DONE_STAGES });
    setStatus('complete');
    setBalanceRefresh((n) => n + 1);
    void persistRun(inputs);
    postToParent('keyword-research:finish', { keyword: inputs.keyword, outcome: 'done' });
  }

  // Maps the final output object ({ "<blockId>": ... }) to results.
  function handleFinalOutput(output: Record<string, unknown>) {
    let shortlist: ResultPayload | null = null;
    let scores: SourceKeyword[] = [];
    for (const [blockId, value] of Object.entries(output)) {
      if (blockId.startsWith(SHORTLIST_BLOCK_PREFIX)) {
        shortlist = extractShortlist(value) ?? shortlist;
      } else if (blockId.startsWith(ALIGNMENT_BLOCK_PREFIX)) {
        const s = extractScores(value);
        if (s.length > 0) scores = s;
      } else {
        // Unknown block id — best-effort fallback so results still render.
        if (!shortlist) shortlist = extractShortlist(value);
        if (scores.length === 0) scores = extractScores(value);
      }
    }
    if (scores.length > 0) {
      allKeywordsRef.current = scores;
      setAllKeywords(scores);
    }
    if (shortlist) {
      resultRef.current = shortlist;
      setResult(shortlist);
    }
  }

  function mergeVariants(next: string[]) {
    setVariants((prev) => {
      const merged = [...prev];
      for (const v of next) {
        if (v && !merged.includes(v)) merged.push(v);
      }
      return merged.length === prev.length ? prev : merged;
    });
  }

  function mergeUrls(candidates: CompetitorUrl[]) {
    setUrls((prev) => {
      const map = new Map(prev.map((u) => [u.url, u] as const));
      let changed = false;
      for (const u of candidates) {
        const existing = map.get(u.url);
        if (!existing) {
          map.set(u.url, u);
          changed = true;
        } else if (u.keywordsFound && u.keywordsFound.length > 0 && (!existing.keywordsFound || existing.keywordsFound.length === 0)) {
          map.set(u.url, { ...existing, keywordsFound: u.keywordsFound, status: 'done' });
          changed = true;
        }
      }
      return changed ? Array.from(map.values()) : prev;
    });
  }

  // Best-effort extraction of panel data from a parsed progress chunk. Chunks
  // that do not map cleanly are silently ignored — never crash on partial data.
  function extractFromChunkValue(v: unknown) {
    if (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string')) {
      mergeVariants(v as string[]);
      return;
    }
    const o = asRecord(v);
    if (Array.isArray(o.variants) && o.variants.every((x) => typeof x === 'string')) {
      mergeVariants(o.variants as string[]);
    }
    const urlCandidates = coerceUrls(Array.isArray(v) ? v : o.urls ?? o.results ?? o.pages);
    if (urlCandidates.length > 0) mergeUrls(urlCandidates);
    const scores = extractScores(v);
    if (scores.length > 0) {
      allKeywordsRef.current = scores;
      setAllKeywords(scores);
    }
    const shortlist = extractShortlist(v);
    if (shortlist) {
      resultRef.current = shortlist;
      setResult(shortlist);
    }
  }

  // Progress chunks have shape {blockId, chunk}. Each newly seen block advances
  // the tracker one stage; chunk payloads are buffered per block and parsed
  // opportunistically to populate the live panels.
  function handleChunk(blockId: string, chunk: string) {
    const seen = seenBlocksRef.current;
    if (!seen.has(blockId)) {
      seen.add(blockId);
      const activeIndex = Math.min(seen.size - 1, STAGE_KEYS.length - 1);
      setStages((prev) => {
        const next: Record<Stage, StageStatus> = { ...prev };
        STAGE_KEYS.forEach((key, i) => {
          if (i < activeIndex) next[key] = 'done';
          else if (i === activeIndex && next[key] === 'pending') next[key] = 'active';
        });
        return next;
      });
    }
    if (!chunk) return;
    const buffers = chunkBuffersRef.current;
    const combined = (buffers.get(blockId) ?? '') + chunk;
    buffers.set(blockId, combined);
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(combined);
    } catch {
      try {
        parsed = JSON.parse(chunk);
      } catch {
        return; // Partial JSON — wait for more chunks.
      }
    }
    extractFromChunkValue(parsed);
  }

  function openStream(token: string, inputs: RunInputs) {
    closeStream();
    setStatus('streaming');
    setStages({ ...INITIAL_STAGES, variants: 'active' });
    const es = new EventSource(`/api/keyword-research/stream/${token}`);
    esRef.current = es;

    // The upstream emits ONLY default `message` events — no named SSE events.
    es.onmessage = (event: MessageEvent<string>) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.data);
      } catch (err) {
        devWarn('Skipping unparseable SSE message', err);
        return;
      }
      // Terminator: data: "[DONE]" (a JSON string literal). The ONLY completion signal.
      if (parsed === '[DONE]') {
        finalizeSuccess(inputs);
        return;
      }
      const o = asRecord(parsed);
      // Final result: {"event":"final","data":{"output":{"<blockId>": ...}}} —
      // "final" is a FIELD inside the JSON, not an SSE event name.
      if (o.event === 'final') {
        completionRef.current = true;
        const output = asRecord(asRecord(o.data).output);
        handleFinalOutput(output);
        return;
      }
      // Progress chunk: {"blockId":"<uuid>","chunk":"<string>"}
      const blockId = typeof o.blockId === 'string' ? o.blockId : '';
      const chunk = typeof o.chunk === 'string' ? o.chunk : '';
      if (blockId) handleChunk(blockId, chunk);
    };

    es.onerror = () => {
      // A socket close after "[DONE]" or "final" is SUCCESS, never an error.
      if (completionRef.current || finishedRef.current) {
        if (!finishedRef.current) finalizeSuccess(inputs);
        return;
      }
      closeStream();
      setStatus('failed');
      setFailMessage('Connection to the research stream was lost. Please retry.');
      postToParent('keyword-research:finish', { keyword: inputs.keyword, outcome: 'error' });
    };
  }

  async function startRun() {
    const trimmed = keyword.trim();
    if (!trimmed || status === 'initializing' || status === 'streaming') return;
    startedRef.current = true;
    finishedRef.current = false;
    completionRef.current = false;
    setIsRestored(false);
    resetRunState();
    const inputs: RunInputs = { keyword: trimmed, intent, client: clientName.trim() || undefined };
    inputsRef.current = inputs;
    setStatus('initializing');
    postToParent('keyword-research:start', { keyword: trimmed });
    let token = '';
    try {
      const res = await fetch('/api/keyword-research/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: trimmed, intent, client: clientName.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { token?: unknown; error?: unknown };
      if (!res.ok || typeof data.token !== 'string' || !data.token) {
        setInitError(typeof data.error === 'string' && data.error ? data.error : 'Could not start the research run.');
        setStatus('idle');
        return;
      }
      token = data.token;
    } catch {
      setInitError('Could not reach the server to start the run. Check your connection and try again.');
      setStatus('idle');
      return;
    }
    openStream(token, inputs);
  }

  function cancelRun() {
    finishedRef.current = true;
    closeStream();
    setStatus('idle');
    setStages(INITIAL_STAGES);
    postToParent('keyword-research:finish', { keyword: inputsRef.current?.keyword ?? keyword, outcome: 'cancelled' });
  }

  function handleReset() {
    finishedRef.current = true;
    closeStream();
    startedRef.current = false;
    completionRef.current = false;
    setKeyword('');
    setClientName('');
    setIntent('commercial');
    setStatus('idle');
    setIsRestored(false);
    resetRunState();
    inputsRef.current = null;
  }

  function handleResultChange(next: ResultPayload) {
    resultRef.current = next;
    setResult(next);
  }

  const running = status === 'initializing' || status === 'streaming';
  const hasSemrushKeywords = urls.some((u) => (u.keywordsFound?.length ?? 0) > 0);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Keyword Research</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            Expand a seed keyword into a validated, competitor-backed shortlist with live pipeline progress.
          </p>
        </div>
        <SemrushBalanceWidget refreshSignal={balanceRefresh} />
      </header>

      <ResearchForm
        keyword={keyword}
        intent={intent}
        client={clientName}
        running={running}
        initError={initError}
        onKeywordChange={setKeyword}
        onIntentChange={setIntent}
        onClientChange={setClientName}
        onSubmit={startRun}
        onCancel={cancelRun}
        onReset={handleReset}
      />

      {isRestored && status === 'complete' && (
        <p className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-2.5 text-sm text-indigo-700">
          Restored your last completed run for “{inputsRef.current?.keyword}”.
        </p>
      )}

      {running && <ProgressTracker stages={stages} variants={variants} />}

      {status === 'failed' && failMessage && <ErrorCard message={failMessage} onRetry={() => void startRun()} />}

      {variants.length > 0 && (
        <QueryVariantsPanel
          seedKeyword={inputsRef.current?.keyword ?? keyword}
          intent={intent}
          variants={variants}
          done={!running}
        />
      )}

      {urls.length > 0 && <CompetitorUrlsPanel urls={urls} done={!running} />}

      {hasSemrushKeywords && <SemrushKeywordsPanel urls={urls} done={!running} />}

      {result && inputsRef.current && (
        <ResultsSection
          result={result}
          inputs={inputsRef.current}
          allKeywords={allKeywords}
          variants={variants}
          competitorUrls={urls}
          onResultChange={handleResultChange}
        />
      )}

      {allKeywords.length > 0 && <SourceKeywordsPanel keywords={allKeywords} />}
    </div>
  );
}
