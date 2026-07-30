"use client"

import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  CompetitorUrl,
  CompositeCandidate,
  Intent,
  NormalizedKeyword,
  PrimaryKeyword,
  ResultPayload,
  RunInputs,
  SavedRunOutput,
  ScoredKeyword,
  SecondaryKeyword,
  SerpResult,
  SourceKeyword,
  Stage,
  StageStatus,
} from '@/lib/types';
import ResearchForm from '@/components/ResearchForm';
import ProgressTracker from '@/components/ProgressTracker';
import QueryVariantsPanel from '@/components/QueryVariantsPanel';
import SerpResultsPanel from '@/components/SerpResultsPanel';
import CompetitorUrlsPanel from '@/components/CompetitorUrlsPanel';
import SemrushKeywordsPanel from '@/components/SemrushKeywordsPanel';
import DedupKeywordsPanel from '@/components/DedupKeywordsPanel';
import CompositeScoringPanel from '@/components/CompositeScoringPanel';
import AlignmentScoresPanel from '@/components/AlignmentScoresPanel';
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
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function asStringOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function extractStringArray(v: unknown): string[] {
  return asArray(v).filter((x): x is string => typeof x === 'string' && x.length > 0);
}

// Accepts an array directly, or an object wrapping an array under common keys,
// or an object of arrays (flattened).
function flattenToArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  const o = asRecord(v);
  if (Array.isArray(o.results)) return o.results;
  if (Array.isArray(o.result)) return o.result;
  if (Array.isArray(o.rows)) return o.rows;
  if (Array.isArray(o.items)) return o.items;
  if (Array.isArray(o.scores)) return o.scores;
  if (Array.isArray(o.keywords)) return o.keywords;
  const out: unknown[] = [];
  for (const value of Object.values(o)) {
    if (Array.isArray(value)) out.push(...value);
  }
  return out;
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
  return flattenToArray(v)
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

function domainOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function coerceUrls(v: unknown): CompetitorUrl[] {
  return flattenToArray(v)
    .map((item) => {
      const o = asRecord(item);
      const url = typeof o.url === 'string' ? o.url : typeof o.link === 'string' ? o.link : '';
      let domain = typeof o.domain === 'string' ? o.domain : '';
      if (!domain && url) domain = domainOf(url);
      const kwRaw = Array.isArray(o.keywords) ? o.keywords : Array.isArray(o.keywordsFound) ? o.keywordsFound : null;
      const keywords = kwRaw ? coerceSource(kwRaw) : undefined;
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

function coerceSerp(v: unknown): SerpResult[] {
  return flattenToArray(v)
    .map((item) => {
      const o = asRecord(item);
      const url = typeof o.url === 'string' ? o.url : typeof o.link === 'string' ? o.link : '';
      let domain = typeof o.domain === 'string' ? o.domain : '';
      if (!domain && url) domain = domainOf(url);
      return {
        rank: toNumOrNull(o.rank) ?? toNumOrNull(o.position),
        title: typeof o.title === 'string' ? o.title : null,
        url,
        domain,
      };
    })
    .filter((r) => r.url.length > 0);
}

function coerceNormalized(v: unknown): NormalizedKeyword[] {
  return flattenToArray(v)
    .map((item) => {
      const o = asRecord(item);
      return {
        keyword: typeof o.keyword === 'string' ? o.keyword : '',
        volume: toNumOrNull(o.volume),
      };
    })
    .filter((k) => k.keyword.length > 0);
}

function coerceScored(v: unknown): ScoredKeyword[] {
  return flattenToArray(v)
    .map((item) => {
      const o = asRecord(item);
      const keyword = typeof o.keyword === 'string' ? o.keyword : typeof o.entity === 'string' ? o.entity : '';
      return {
        keyword,
        score:
          toNumOrNull(o.score) ??
          toNumOrNull(o.compositeScore) ??
          toNumOrNull(o.alignment) ??
          toNumOrNull(o.value),
      };
    })
    .filter((k) => k.keyword.length > 0);
}

function coerceCandidates(v: unknown): CompositeCandidate[] {
  return asArray(v)
    .map((item) => {
      const o = asRecord(item);
      return {
        keyword: typeof o.keyword === 'string' ? o.keyword : '',
        volume: toNumOrNull(o.volume),
        position: toNumOrNull(o.position),
        cpc: toNumOrNull(o.cpc),
      };
    })
    .filter((c) => c.keyword.length > 0);
}

function coerceSemrushGroups(v: unknown): CompetitorUrl[] {
  const arr = flattenToArray(v);
  if (arr.some((item) => Array.isArray(asRecord(item).keywords) || Array.isArray(asRecord(item).keywordsFound))) {
    return coerceUrls(arr);
  }
  // Flat rows: { url, keyword, volume, difficulty }
  const byUrl = new Map<string, SourceKeyword[]>();
  for (const item of arr) {
    const o = asRecord(item);
    const url = typeof o.url === 'string' ? o.url : '';
    const kw = typeof o.keyword === 'string' ? o.keyword : '';
    if (!url || !kw) continue;
    const list = byUrl.get(url) ?? [];
    list.push({
      keyword: kw,
      urlFrequency: toNumOrNull(o.urlFrequency) ?? 0,
      volume: toNumOrNull(o.volume),
      difficulty: toNumOrNull(o.difficulty),
      compositeScore: toNumOrNull(o.compositeScore) ?? 0,
    });
    byUrl.set(url, list);
  }
  return Array.from(byUrl.entries()).map(([url, keywords]) => ({
    url,
    domain: domainOf(url),
    score: 0,
    keywordsFound: keywords,
    status: 'done' as const,
  }));
}

function mergeUrlLists(base: CompetitorUrl[], incoming: CompetitorUrl[]): CompetitorUrl[] {
  const map = new Map<string, CompetitorUrl>();
  for (const u of base) map.set(u.url, u);
  for (const u of incoming) {
    const existing = map.get(u.url);
    if (!existing) {
      map.set(u.url, u);
      continue;
    }
    map.set(u.url, {
      ...existing,
      score: u.score > 0 ? u.score : existing.score,
      title: u.title ?? existing.title,
      matchedQueries: u.matchedQueries ?? existing.matchedQueries,
      totalQueries: u.totalQueries ?? existing.totalQueries,
      keywordsFound: (u.keywordsFound?.length ?? 0) > 0 ? u.keywordsFound : existing.keywordsFound,
      status: 'done',
    });
  }
  return Array.from(map.values());
}

function sanitizeKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Robust accessor for the final output object. For selectedOutput "block.field"
// tries: output["block.field"] -> output[block][field] -> any blockId entry that
// nests the block name or carries the field directly. Never assumes a fixed blockId.
function pickOutput(
  output: Record<string, unknown>,
  block: string,
  field: string,
  validate?: (v: unknown) => boolean
): unknown {
  const target = sanitizeKey(block);
  const valid = (v: unknown): boolean => v !== undefined && v !== null && (!validate || validate(v));

  const dotted = output[`${block}.${field}`];
  if (valid(dotted)) return dotted;

  for (const [key, value] of Object.entries(output)) {
    if (sanitizeKey(key) === target) {
      const rec = asRecord(value);
      if (valid(rec[field])) return rec[field];
      if (valid(value)) return value;
    }
  }

  for (const value of Object.values(output)) {
    const rec = asRecord(value);
    if (valid(rec[`${block}.${field}`])) return rec[`${block}.${field}`];
    for (const [k, v] of Object.entries(rec)) {
      if (sanitizeKey(k) === target) {
        const inner = asRecord(v);
        if (valid(inner[field])) return inner[field];
        if (valid(v)) return v;
      }
    }
    if (valid(rec[field])) return rec[field];
  }

  return undefined;
}

// URL scoring data lives at the output's `.selectedUrls` array.
function findSelectedUrlsHolder(output: Record<string, unknown>): Record<string, unknown> | null {
  if (Array.isArray(output.selectedUrls)) return output;
  for (const value of Object.values(output)) {
    const rec = asRecord(value);
    if (Array.isArray(rec.selectedUrls)) return rec;
    for (const inner of Object.values(rec)) {
      const ir = asRecord(inner);
      if (Array.isArray(ir.selectedUrls)) return ir;
    }
  }
  return null;
}

function extractSelectedUrls(output: Record<string, unknown>): { rows: CompetitorUrl[]; candidateTotal: number | null } {
  const direct = asRecord(
    pickOutput(output, 'urlscoring&selection', 'result', (v) => Array.isArray(asRecord(v).selectedUrls))
  );
  const holder = Array.isArray(direct.selectedUrls) ? direct : findSelectedUrlsHolder(output);
  if (!holder) return { rows: [], candidateTotal: null };
  const rows = asArray(holder.selectedUrls)
    .map((item) => {
      const o = asRecord(item);
      const url = typeof o.url === 'string' ? o.url : '';
      const domain = typeof o.domain === 'string' && o.domain.length > 0 ? o.domain : domainOf(url);
      return {
        url,
        domain,
        // Render entry.score AS-IS - it is already a rounded number (~20-95).
        score: toNumOrNull(o.score) ?? 0,
        title: typeof o.title === 'string' ? o.title : null,
        matchedQueries: toNumOrNull(o.matchedQueries) ?? toNumOrNull(o.queriesMatched),
        totalQueries: toNumOrNull(o.totalQueries),
        status: 'done' as const,
      };
    })
    .filter((u) => u.url.length > 0);
  const candidateTotal =
    toNumOrNull(holder.candidateCount) ?? toNumOrNull(holder.totalCandidates) ?? toNumOrNull(holder.totalUrls);
  return { rows, candidateTotal };
}

function buildSourceKeywords(urlList: CompetitorUrl[]): SourceKeyword[] {
  const map = new Map<string, SourceKeyword>();
  for (const u of urlList) {
    for (const k of u.keywordsFound ?? []) {
      const key = k.keyword.toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.urlFrequency += 1;
        if (existing.volume === null && k.volume !== null) existing.volume = k.volume;
        if (existing.difficulty === null && k.difficulty !== null) existing.difficulty = k.difficulty;
      } else {
        map.set(key, { ...k, urlFrequency: Math.max(k.urlFrequency, 1) });
      }
    }
  }
  return Array.from(map.values());
}

export default function KeywordResearchClient() {
  const [keyword, setKeyword] = useState('');
  const [intent, setIntent] = useState<Intent>('commercial');
  const [client, setClient] = useState('');
  const [status, setStatus] = useState<RunStatus>('idle');
  const [initError, setInitError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [stages, setStages] = useState<Record<Stage, StageStatus>>(INITIAL_STAGES);
  const [variants, setVariants] = useState<string[]>([]);
  const [serpResults, setSerpResults] = useState<SerpResult[]>([]);
  const [urls, setUrls] = useState<CompetitorUrl[]>([]);
  const [normalized, setNormalized] = useState<NormalizedKeyword[]>([]);
  const [candidates, setCandidates] = useState<CompositeCandidate[]>([]);
  const [alignment, setAlignment] = useState<ScoredKeyword[]>([]);
  const [savedAllKeywords, setSavedAllKeywords] = useState<SourceKeyword[]>([]);
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [inputs, setInputs] = useState<RunInputs | null>(null);
  const [candidateCount, setCandidateCount] = useState<number | null>(null);
  const [primaryTotal, setPrimaryTotal] = useState<number | null>(null);
  const [secondaryTotal, setSecondaryTotal] = useState<number | null>(null);
  const [balanceSignal, setBalanceSignal] = useState(0);

  const outputRef = useRef<Record<string, unknown>>({});
  const abortRef = useRef<AbortController | null>(null);

  const running = status === 'initializing' || status === 'streaming';
  const showPipeline = running || status === 'complete';

  const allKeywords = useMemo(() => {
    const derived = buildSourceKeywords(urls);
    return derived.length > 0 ? derived : savedAllKeywords;
  }, [urls, savedAllKeywords]);

  // Restore the most recent saved run (best-effort) so a reload does not lose results.
  useEffect(() => {
    let cancelled = false;
    async function restore(): Promise<void> {
      try {
        const res = await fetch('/api/runs?tool=keyword-research&limit=1');
        if (!res.ok) return;
        const data = (await res.json()) as { runs?: unknown };
        const runs = asArray(data.runs);
        if (runs.length === 0) return;
        const run = asRecord(runs[0]);
        const savedInputs = asRecord(run.inputs);
        const saved = asRecord(run.output);
        const primary = coercePrimary(saved.primary);
        const secondary = coerceSecondary(saved.secondary);
        if (primary.length === 0 && secondary.length === 0) return;
        if (cancelled) return;
        const kw = typeof savedInputs.keyword === 'string' ? savedInputs.keyword : '';
        const restoredIntent: Intent = savedInputs.intent === 'informational' ? 'informational' : 'commercial';
        const cl = typeof savedInputs.client === 'string' ? savedInputs.client : '';
        setKeyword(kw);
        setIntent(restoredIntent);
        setClient(cl);
        setInputs({ keyword: kw, intent: restoredIntent, client: cl || undefined });
        setResult({
          primary,
          secondary,
          warning: asStringOrNull(saved.warning),
          warningType: asStringOrNull(saved.warningType),
        });
        setVariants(extractStringArray(saved.variants));
        setUrls(coerceUrls(saved.urls));
        setSerpResults(coerceSerp(saved.serpResults));
        setNormalized(coerceNormalized(saved.normalizedKeywords));
        setCandidates(coerceCandidates(asArray(saved.compositeCandidates)));
        setAlignment(coerceScored(saved.alignmentScores));
        setSavedAllKeywords(coerceSource(saved.allKeywords));
        setStages(ALL_DONE_STAGES);
        setStatus('complete');
      } catch {
        // Restore is best-effort - never break the page.
      }
    }
    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  // Abort any in-flight stream on unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Infer stage progress from the data received so far while streaming.
  useEffect(() => {
    if (status !== 'streaming') return;
    const done: Record<Stage, boolean> = {
      variants: variants.length > 0,
      search: serpResults.length > 0,
      url_scoring: urls.length > 0,
      semrush: urls.some((u) => (u.keywordsFound?.length ?? 0) > 0),
      analysis: alignment.length > 0,
      scoring: candidates.length > 0,
      validation: false,
    };
    setStages(() => {
      const next: Record<Stage, StageStatus> = { ...INITIAL_STAGES };
      let activeSet = false;
      for (const key of STAGE_KEYS) {
        if (done[key]) {
          next[key] = 'done';
        } else if (!activeSet) {
          next[key] = 'active';
          activeSet = true;
        }
      }
      return next;
    });
  }, [status, variants, serpResults, urls, alignment, candidates]);

  function resetRunState(): void {
    outputRef.current = {};
    setStages(INITIAL_STAGES);
    setVariants([]);
    setSerpResults([]);
    setUrls([]);
    setNormalized([]);
    setCandidates([]);
    setAlignment([]);
    setSavedAllKeywords([]);
    setResult(null);
    setCandidateCount(null);
    setPrimaryTotal(null);
    setSecondaryTotal(null);
  }

  function mergeChunk(chunk: unknown): void {
    const rec = asRecord(chunk);
    const out = asRecord(rec.output);
    const target = outputRef.current;
    if (Object.keys(out).length > 0) {
      const blockName = asStringOrNull(rec.blockName) ?? asStringOrNull(rec.blockId);
      if (blockName) {
        target[blockName] = { ...asRecord(target[blockName]), ...out };
      }
      for (const [k, v] of Object.entries(out)) {
        target[k] = v;
      }
    } else {
      for (const [k, v] of Object.entries(rec)) {
        if (k === 'event' || k === 'type') continue;
        target[k] = v;
      }
    }
  }

  function applyOutput(): void {
    const output = outputRef.current;

    const nextVariants = extractStringArray(pickOutput(output, 'queryexpansion', 'variants', (x) => Array.isArray(x)));
    if (nextVariants.length > 0) setVariants(nextVariants);

    const serp = coerceSerp(pickOutput(output, 'serpfetch', 'result'));
    if (serp.length > 0) setSerpResults(serp);

    const { rows: selectedUrls, candidateTotal } = extractSelectedUrls(output);
    const semrushGroups = coerceSemrushGroups(pickOutput(output, 'aggregatesemrushrows', 'result'));
    if (selectedUrls.length > 0 || semrushGroups.length > 0) {
      setUrls((prev) => mergeUrlLists(mergeUrlLists(prev, selectedUrls), semrushGroups));
    }
    if (candidateTotal !== null) setCandidateCount(candidateTotal);

    const norm = coerceNormalized(pickOutput(output, 'dedup&volumenormalize', 'result'));
    if (norm.length > 0) setNormalized(norm);

    const comp = coerceCandidates(flattenToArray(pickOutput(output, 'compositescoring', 'result')));
    if (comp.length > 0) setCandidates(comp);

    const align = coerceScored(pickOutput(output, 'alignmentscoring', 'scores'));
    if (align.length > 0) setAlignment(align);
  }

  function handleSseLine(rawLine: string): void {
    const line = rawLine.trim();
    if (!line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') return;
    try {
      mergeChunk(JSON.parse(payload));
      applyOutput();
    } catch {
      // Ignore non-JSON SSE lines.
    }
  }

  async function saveRun(runInputs: RunInputs, payload: ResultPayload): Promise<void> {
    const output = outputRef.current;
    const { rows: selectedUrls } = extractSelectedUrls(output);
    const groups = coerceSemrushGroups(pickOutput(output, 'aggregatesemrushrows', 'result'));
    const mergedUrls = mergeUrlLists(selectedUrls, groups);
    const saved: SavedRunOutput = {
      primary: payload.primary,
      secondary: payload.secondary,
      warning: payload.warning ?? null,
      warningType: payload.warningType ?? null,
      allKeywords: buildSourceKeywords(mergedUrls),
      variants: extractStringArray(pickOutput(output, 'queryexpansion', 'variants', (x) => Array.isArray(x))),
      urls: mergedUrls,
      serpResults: coerceSerp(pickOutput(output, 'serpfetch', 'result')),
      normalizedKeywords: coerceNormalized(pickOutput(output, 'dedup&volumenormalize', 'result')),
      compositeCandidates: coerceCandidates(flattenToArray(pickOutput(output, 'compositescoring', 'result'))),
      alignmentScores: coerceScored(pickOutput(output, 'alignmentscoring', 'scores')),
    };
    try {
      await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'keyword-research',
          label: runInputs.keyword,
          status: 'completed',
          inputs: runInputs,
          output: saved,
        }),
      });
    } catch (err) {
      devWarn('Failed to save run', err);
    }
  }

  function finishRun(runInputs: RunInputs): void {
    const output = outputRef.current;
    const shortlistPrimary = coercePrimary(pickOutput(output, 'aishortlisting', 'primary', (v) => Array.isArray(v)));
    const shortlistSecondary = coerceSecondary(pickOutput(output, 'aishortlisting', 'secondary', (v) => Array.isArray(v)));
    let primary = coercePrimary(pickOutput(output, 'validationpass', 'primary', (v) => Array.isArray(v)));
    if (primary.length === 0) primary = shortlistPrimary;
    let secondary = coerceSecondary(pickOutput(output, 'validationpass', 'secondary', (v) => Array.isArray(v)));
    if (secondary.length === 0) secondary = shortlistSecondary;

    if (primary.length === 0 && secondary.length === 0) {
      setRunError('The pipeline finished without returning any keywords. Please try again.');
      setStatus('failed');
      return;
    }

    const warningObj = asRecord(pickOutput(output, 'validationpass', 'warning'));
    const warningType =
      asStringOrNull(pickOutput(output, 'validationpass', 'warning.type')) ?? asStringOrNull(warningObj.type);
    const warning =
      asStringOrNull(pickOutput(output, 'validationpass', 'warning.description')) ??
      asStringOrNull(warningObj.description);

    setPrimaryTotal(shortlistPrimary.length > 0 ? shortlistPrimary.length : null);
    setSecondaryTotal(shortlistSecondary.length > 0 ? shortlistSecondary.length : null);

    const payload: ResultPayload = { primary, secondary, warning, warningType };
    setResult(payload);
    setStages(ALL_DONE_STAGES);
    setStatus('complete');
    setBalanceSignal((s) => s + 1);
    void saveRun(runInputs, payload);
  }

  async function startRun(): Promise<void> {
    const trimmed = keyword.trim();
    if (!trimmed || running) return;
    setInitError(null);
    setRunError(null);
    setStatus('initializing');
    resetRunState();
    const runInputs: RunInputs = { keyword: trimmed, intent, client: client.trim() || undefined };
    setInputs(runInputs);

    let token = '';
    try {
      const res = await fetch('/api/keyword-research/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: trimmed, intent, client: client.trim() }),
      });
      const data = (await res.json()) as { token?: string; error?: string };
      if (!res.ok || !data.token) {
        setInitError(data.error ?? 'Could not start the research run.');
        setStatus('idle');
        return;
      }
      token = data.token;
    } catch {
      setInitError('Could not start the research run.');
      setStatus('idle');
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('streaming');
    setStages({ ...INITIAL_STAGES, variants: 'active' });

    try {
      const res = await fetch(`/api/keyword-research/stream/${token}`, { signal: controller.signal });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '');
        throw new Error(text || 'The research stream could not be opened.');
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const rawLine of lines) {
          handleSseLine(rawLine);
        }
      }
      if (buffer) handleSseLine(buffer);
      finishRun(runInputs);
    } catch (err) {
      if (controller.signal.aborted) {
        setStatus('idle');
        return;
      }
      devWarn('Stream failed', err);
      setRunError(err instanceof Error && err.message ? err.message : 'The research run failed.');
      setStatus('failed');
    } finally {
      abortRef.current = null;
    }
  }

  function handleCancel(): void {
    abortRef.current?.abort();
    setStatus('idle');
  }

  function handleReset(): void {
    abortRef.current?.abort();
    resetRunState();
    setKeyword('');
    setClient('');
    setIntent('commercial');
    setInputs(null);
    setInitError(null);
    setRunError(null);
    setStatus('idle');
  }

  const hasSemrushKeywords = urls.some((u) => (u.keywordsFound?.length ?? 0) > 0);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
      <header className="text-center">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Keyword Research Agent</h1>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-500">
          Expand a seed keyword into a validated, competitor-backed shortlist of primary and secondary keywords.
        </p>
      </header>

      <SemrushBalanceWidget refreshSignal={balanceSignal} />

      <ResearchForm
        keyword={keyword}
        intent={intent}
        client={client}
        running={running}
        initError={initError}
        onKeywordChange={setKeyword}
        onIntentChange={setIntent}
        onClientChange={setClient}
        onSubmit={() => {
          void startRun();
        }}
        onCancel={handleCancel}
        onReset={handleReset}
      />

      {status === 'failed' && runError && (
        <ErrorCard
          message={runError}
          onRetry={() => {
            void startRun();
          }}
        />
      )}

      {showPipeline && (
        <div className="space-y-6">
          <ProgressTracker stages={stages} variants={variants} />

          {variants.length > 0 && (
            <QueryVariantsPanel
              seedKeyword={inputs?.keyword ?? keyword}
              intent={inputs?.intent ?? intent}
              variants={variants}
              done={stages.variants === 'done'}
            />
          )}

          {serpResults.length > 0 && <SerpResultsPanel results={serpResults} />}

          {urls.length > 0 && (
            <CompetitorUrlsPanel urls={urls} done={stages.url_scoring === 'done'} candidateCount={candidateCount} />
          )}

          {hasSemrushKeywords && <SemrushKeywordsPanel urls={urls} done={stages.semrush === 'done'} />}

          {normalized.length > 0 && <DedupKeywordsPanel keywords={normalized} />}

          {candidates.length > 0 && <CompositeScoringPanel candidates={candidates} />}

          {alignment.length > 0 && <AlignmentScoresPanel rows={alignment} />}

          {allKeywords.length > 0 && <SourceKeywordsPanel keywords={allKeywords} />}

          {status === 'complete' && result && inputs && (
            <ResultsSection
              result={result}
              inputs={inputs}
              allKeywords={allKeywords}
              variants={variants}
              competitorUrls={urls}
              serpResults={serpResults}
              normalizedKeywords={normalized}
              compositeCandidates={candidates}
              alignmentScores={alignment}
              primaryCandidates={primaryTotal}
              secondaryCandidates={secondaryTotal}
              onResultChange={setResult}
            />
          )}
        </div>
      )}
    </main>
  );
}
