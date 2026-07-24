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
        compositeScore: toNumOrNull(o.compositeScore) ?? 0,
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

  function openStream(token: string, inputs: RunInputs) {
    const es = new EventSource(`/api/keyword-research/stream/${encodeURIComponent(token)}`);
    esRef.current = es;

    const listen = (name: string, handler: (payload: unknown) => void) => {
      es.addEventListener(name, (ev: Event) => {
        const raw = (ev as MessageEvent<string>).data;
        let parsed: unknown = null;
        try {
          parsed = typeof raw === 'string' && raw.length > 0 ? JSON.parse(raw) : null;
        } catch {
          devWarn(`Malformed payload for event "${name}"`, raw);
          return;
        }
        try {
          handler(parsed);
        } catch (err) {
          devWarn(`Error handling event "${name}"`, err);
        }
      });
    };

    listen('step', (p) => {
      const o = asRecord(p);
      const stage = typeof o.stage === 'string' ? o.stage : '';
      if (!STAGE_KEYS.includes(stage as Stage)) return;
      const key = stage as Stage;
      const next: StageStatus = o.status === 'done' ? 'done' : 'active';
      setStages((prev) => (prev[key] === 'done' ? prev : { ...prev, [key]: next }));
    });

    listen('variants', (p) => {
      const list = Array.isArray(p) ? p : asArray(asRecord(p).variants);
      setVariants(list.filter((v): v is string => typeof v === 'string'));
    });

    listen('urls', (p) => {
      const list = Array.isArray(p) ? p : asArray(asRecord(p).urls);
      setUrls(coerceUrls(list));
    });

    listen('url_status', (p) => {
      const o = asRecord(p);
      const url = typeof o.url === 'string' ? o.url : '';
      if (!url) return;
      const raw = typeof o.status === 'string' ? o.status : 'fetching';
      const nextStatus: CompetitorUrl['status'] =
        raw === 'done' ? 'done' : raw === 'error' ? 'error' : raw === 'pending' ? 'pending' : 'fetching';
      setUrls((prev) => prev.map((u) => (u.url === url ? { ...u, status: nextStatus } : u)));
    });

    listen('url_keywords', (p) => {
      const o = asRecord(p);
      const url = typeof o.url === 'string' ? o.url : '';
      if (!url) return;
      const found = coerceSource(o.keywords ?? o.keywordsFound);
      setUrls((prev) => prev.map((u) => (u.url === url ? { ...u, keywordsFound: found, status: 'done' } : u)));
    });

    listen('allKeywords', (p) => {
      const o = asRecord(p);
      const list = Array.isArray(p) ? p : asArray(o.keywords ?? o.allKeywords);
      const coerced = coerceSource(list);
      allKeywordsRef.current = coerced;
      setAllKeywords(coerced);
    });

    listen('result', (p) => {
      const o = asRecord(p);
      const payload: ResultPayload = {
        primary: coercePrimary(o.primary),
        secondary: coerceSecondary(o.secondary),
        warning: typeof o.warning === 'string' && o.warning ? o.warning : null,
      };
      resultRef.current = payload;
      setResult(payload);
    });

    listen('fail', (p) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      const o = asRecord(p);
      const message = typeof o.message === 'string' && o.message ? o.message : 'The keyword research run failed.';
      closeStream();
      setFailMessage(message);
      setStatus('failed');
      postToParent('keyword-research:finish', { keyword: inputs.keyword, outcome: 'fail' });
    });

    es.addEventListener('done', () => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      closeStream();
      setStages((prev) => {
        const next = { ...prev };
        STAGE_KEYS.forEach((k) => {
          next[k] = 'done';
        });
        return next;
      });
      setStatus('complete');
      setBalanceRefresh((n) => n + 1);
      void persistRun(inputs);
      postToParent('keyword-research:finish', { keyword: inputs.keyword, outcome: 'done' });
    });

    es.onerror = () => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      closeStream();
      setFailMessage('The connection to the research stream was lost. Retry to start a fresh run.');
      setStatus('failed');
      postToParent('keyword-research:finish', { keyword: inputs.keyword, outcome: 'error' });
    };
  }

  async function startRun(inputs: RunInputs) {
    startedRef.current = true;
    finishedRef.current = true; // invalidate any previous stream callbacks
    closeStream();
    resetRunState();
    setIsRestored(false);
    inputsRef.current = inputs;
    setStatus('initializing');

    let token = '';
    try {
      const res = await fetch('/api/keyword-research/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: inputs.keyword, intent: inputs.intent, client: inputs.client ?? '' }),
      });
      if (!res.ok) {
        let message = `Could not start the run (HTTP ${res.status}).`;
        try {
          const data = (await res.json()) as { error?: unknown };
          if (typeof data.error === 'string' && data.error) message = data.error;
        } catch {
          // keep default message
        }
        if (res.status === 429) message = 'Too many requests — try again in a minute.';
        setInitError(message);
        setStatus('idle');
        return;
      }
      const data = (await res.json()) as { token?: unknown };
      if (typeof data.token !== 'string' || !data.token) {
        setInitError('The server returned an unexpected response. Please try again.');
        setStatus('idle');
        return;
      }
      token = data.token;
    } catch {
      setInitError('Could not reach the server. Check your connection and try again.');
      setStatus('idle');
      return;
    }

    postToParent('keyword-research:start', { keyword: inputs.keyword, intent: inputs.intent });
    finishedRef.current = false;
    setStatus('streaming');
    openStream(token, inputs);
  }

  function handleSubmit() {
    const trimmed = keyword.trim();
    if (!trimmed) {
      setInitError('Enter a seed keyword to research.');
      return;
    }
    const inputs: RunInputs = { keyword: trimmed, intent };
    const c = clientName.trim();
    if (c) inputs.client = c;
    void startRun(inputs);
  }

  function handleCancel() {
    finishedRef.current = true;
    closeStream();
    resetRunState();
    setStatus('idle');
  }

  function handleRetry() {
    const inputs = inputsRef.current;
    if (inputs) void startRun(inputs);
  }

  function handleStartNew() {
    finishedRef.current = true;
    closeStream();
    resetRunState();
    setIsRestored(false);
    setStatus('idle');
    setKeyword('');
    setClientName('');
    setIntent('commercial');
  }

  function handleResultChange(next: ResultPayload) {
    resultRef.current = next;
    setResult(next);
  }

  const running = status === 'initializing' || status === 'streaming';
  const currentInputs: RunInputs = {
    keyword: keyword.trim() || (inputsRef.current?.keyword ?? ''),
    intent,
    client: clientName.trim() || undefined,
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Keyword Research</h1>
          <p className="mt-1 text-sm text-slate-500">
            Expand a seed keyword into a validated, competitor-backed shortlist.
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
        onSubmit={handleSubmit}
        onCancel={handleCancel}
      />

      {isRestored && status === 'complete' && (
        <div className="animate-rise mt-4 flex items-center justify-between rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-2.5 text-sm text-indigo-800">
          <span>Restored from your last run.</span>
          <button
            type="button"
            onClick={handleStartNew}
            className="rounded font-semibold underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            Start new research
          </button>
        </div>
      )}

      <div className="mt-8 space-y-6">
        {status === 'failed' && failMessage ? (
          <ErrorCard message={failMessage} onRetry={handleRetry} />
        ) : (
          <>
            {!isRestored && (status === 'streaming' || status === 'complete') && (
              <ProgressTracker stages={stages} variants={variants} />
            )}
            {!isRestored && urls.length > 0 && <CompetitorUrlsPanel urls={urls} />}
            {result && (
              <ResultsSection
                result={result}
                inputs={currentInputs}
                allKeywords={allKeywords}
                onResultChange={handleResultChange}
              />
            )}
            {allKeywords.length > 0 && <SourceKeywordsPanel keywords={allKeywords} />}
          </>
        )}
      </div>
    </div>
  );
}
