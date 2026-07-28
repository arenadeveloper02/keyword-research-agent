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
import CompetitorUrlsPanel from '@/components/CompetitorUrlsPanel';
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

// Known upstream block-id prefixes mapped to pipeline stages / result payloads.
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
      return { url, domain, score: toNumOrNull(o.score) ?? 0, status: 'pending' as const };
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
  // Set once "[DONE]" or the embedded final marker arrives — a socket close after
  // this point is SUCCESS, never a connection error.
  const completionRef = useRef(false);
  const seenBlocksRef = useRef<Set<string>>(new Set());
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

  // Marks every stage before `target` done and `target` active.
  function markStageReached(target: Stage) {
    setStages((prev) => {
      const idx = STAGE_KEYS.indexOf(target);
      if (idx < 0) return prev;
      const next = { ...prev };
      STAGE_KEYS.forEach((k, i) => {
        if (i < idx) next[k] = 'done';
        else if (i === idx && next[k] !== 'done') next[k] = 'active';
      });
      return next;
    });
  }

  // Best-effort: a chunk that happens to be complete JSON may carry variants,
  // competitor URLs, or keyword lists. Anything else is silently ignored.
  function applyChunkPayload(p: unknown) {
    if (Array.isArray(p)) {
      if (p.length > 0 && p.every((v) => typeof v === 'string')) {
        setVariants(p.filter((v): v is string => typeof v === 'string'));
        return;
      }
      const first = asRecord(p[0]);
      if (typeof first.url === 'string') {
        const u = coerceUrls(p);
        if (u.length > 0) setUrls(u);
        return;
      }
      if (typeof first.keyword === 'string') {
        const k = coerceSource(p);
        if (k.length > 0) {
          allKeywordsRef.current = k;
          setAllKeywords(k);
        }
      }
      return;
    }
    const o = asRecord(p);
    if (Array.isArray(o.variants)) {
      const list = o.variants.filter((v): v is string => typeof v === 'string');
      if (list.length > 0) setVariants(list);
    }
    if (Array.isArray(o.urls)) {
      const u = coerceUrls(o.urls);
      if (u.length > 0) setUrls(u);
    }
    if (Array.isArray(o.keywords)) {
      const k = coerceSource(o.keywords);
      if (k.length > 0) {
        allKeywordsRef.current = k;
        setAllKeywords(k);
      }
    }
    if (Array.isArray(o.scores)) {
      const k = coerceSource(o.scores);
      if (k.length > 0) {
        allKeywordsRef.current = k;
        setAllKeywords(k);
      }
    }
    if (Array.isArray(o.primary) || Array.isArray(o.secondary)) {
      const shortlist = extractShortlist(o);
      if (shortlist) {
        resultRef.current = shortlist;
        setResult(shortlist);
      }
    }
  }

  // Progress chunks are { blockId, chunk } — advance the tracker per block.
  function handleProgressChunk(blockId: string, chunk: string) {
    if (blockId.startsWith(ALIGNMENT_BLOCK_PREFIX)) {
      seenBlocksRef.current.add(blockId);
      markStageReached('analysis');
    } else if (blockId.startsWith(SHORTLIST_BLOCK_PREFIX)) {
      seenBlocksRef.current.add(blockId);
      markStageReached('scoring');
    } else if (!seenBlocksRef.current.has(blockId)) {
      const isFirstBlock = seenBlocksRef.current.size === 0;
      seenBlocksRef.current.add(blockId);
      if (!isFirstBlock) {
        // Each newly seen block advances the pipeline one step.
        setStages((prev) => {
          const next = { ...prev };
          const activeIdx = STAGE_KEYS.findIndex((k) => next[k] === 'active');
          if (activeIdx >= 0) next[STAGE_KEYS[activeIdx]] = 'done';
          const pendingIdx = STAGE_KEYS.findIndex((k) => next[k] === 'pending');
          if (pendingIdx >= 0) next[STAGE_KEYS[pendingIdx]] = 'active';
          return next;
        });
      }
    }
    if (chunk) {
      try {
        const parsed: unknown = JSON.parse(chunk);
        applyChunkPayload(parsed);
      } catch {
        // Partial / plain-text chunk — used only for stage advancement.
      }
    }
  }

  function openStream(token: string, inputs: RunInputs) {
    const es = new EventSource(`/api/keyword-research/stream/${encodeURIComponent(token)}`);
    esRef.current = es;

    // The upstream emits ONLY default `message` events — no named SSE events.
    es.onmessage = (ev: MessageEvent) => {
      const raw: unknown = ev.data;
      if (typeof raw !== 'string' || raw.length === 0) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        devWarn('Skipping malformed SSE message', raw);
        return;
      }

      // Terminal signal: the JSON string literal "[DONE]" — the ONLY completion signal.
      if (parsed === '[DONE]') {
        completionRef.current = true;
        finalizeSuccess(inputs);
        return;
      }

      const o = asRecord(parsed);

      // Final results: {"event":"final","data":{"output":{"<blockId>": ...}}} —
      // "final" is a FIELD inside the JSON, not an SSE event name.
      if (o.event === 'final') {
        completionRef.current = true;
        const output = asRecord(asRecord(o.data).output);
        handleFinalOutput(output);
        return;
      }

      // Progress chunk: {"blockId":"<uuid>","chunk":"<string>"}.
      if (typeof o.blockId === 'string' && o.blockId.length > 0) {
        handleProgressChunk(o.blockId, typeof o.chunk === 'string' ? o.chunk : '');
      }
    };

    es.onerror = () => {
      if (finishedRef.current) {
        closeStream();
        return;
      }
      if (completionRef.current) {
        // "[DONE]" or "final" already arrived — socket close is SUCCESS, not an error.
        finalizeSuccess(inputs);
        return;
      }
      finishedRef.current = true;
      closeStream();
      setFailMessage('Connection to the research stream was lost. Please retry.');
      setStatus('failed');
      postToParent('keyword-research:finish', { keyword: inputs.keyword, outcome: 'fail' });
    };
  }

  async function startRun() {
    const trimmedKeyword = keyword.trim();
    if (!trimmedKeyword) return;
    closeStream();
    resetRunState();
    finishedRef.current = false;
    completionRef.current = false;
    seenBlocksRef.current = new Set();
    startedRef.current = true;
    setIsRestored(false);
    setStatus('initializing');

    const trimmedClient = clientName.trim();
    const inputs: RunInputs = { keyword: trimmedKeyword, intent, client: trimmedClient || undefined };
    inputsRef.current = inputs;
    postToParent('keyword-research:start', { keyword: trimmedKeyword });

    try {
      const res = await fetch('/api/keyword-research/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: trimmedKeyword, intent, client: trimmedClient }),
      });
      const data = (await res.json().catch(() => null)) as { token?: unknown; error?: unknown } | null;
      if (!res.ok || !data || typeof data.token !== 'string' || data.token.length === 0) {
        const message =
          data && typeof data.error === 'string' && data.error
            ? data.error
            : 'Could not start the research run. Please try again.';
        setInitError(message);
        setStatus('idle');
        postToParent('keyword-research:finish', { keyword: trimmedKeyword, outcome: 'fail' });
        return;
      }
      setStatus('streaming');
      setStages({ ...INITIAL_STAGES, variants: 'active' });
      openStream(data.token, inputs);
    } catch {
      setInitError('Could not start the research run. Please try again.');
      setStatus('idle');
      postToParent('keyword-research:finish', { keyword: trimmedKeyword, outcome: 'fail' });
    }
  }

  function handleCancel() {
    finishedRef.current = true;
    closeStream();
    setStatus('idle');
    postToParent('keyword-research:finish', {
      keyword: inputsRef.current?.keyword ?? keyword,
      outcome: 'cancelled',
    });
  }

  // Retry always restarts from init — stream tokens are single-use.
  function handleRetry() {
    void startRun();
  }

  function handleResultChange(next: ResultPayload) {
    resultRef.current = next;
    setResult(next);
  }

  const running = status === 'initializing' || status === 'streaming';
  const effectiveInputs: RunInputs =
    inputsRef.current ?? { keyword: keyword.trim(), intent, client: clientName.trim() || undefined };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
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
        onSubmit={() => {
          void startRun();
        }}
        onCancel={handleCancel}
      />

      {isRestored && status === 'complete' && (
        <p className="text-xs text-slate-400">Restored your last completed run.</p>
      )}

      {(running || (status === 'complete' && !isRestored)) && (
        <ProgressTracker stages={stages} variants={variants} />
      )}

      {urls.length > 0 && <CompetitorUrlsPanel urls={urls} />}

      {status === 'failed' && failMessage && <ErrorCard message={failMessage} onRetry={handleRetry} />}

      {result && status === 'complete' && (
        <ResultsSection
          result={result}
          inputs={effectiveInputs}
          allKeywords={allKeywords}
          onResultChange={handleResultChange}
        />
      )}

      {allKeywords.length > 0 && <SourceKeywordsPanel keywords={allKeywords} />}
    </div>
  );
}
