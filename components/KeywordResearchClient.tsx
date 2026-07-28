"use client"

import { useEffect, useRef, useState } from 'react';
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
// tries: output["block.field"] → output[block][field] → any blockId entry that
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

// FIX 1: URL scoring data lives at the output's `.selectedUrls` array.
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
        // Render entry.score AS-IS — it is already a rounded number (~20-95).
        score: toNumOrNull(o.score) ?? 0,
        title: typeof o.title === 'string' ? o.title : null,
        matchedQueries: null,
        totalQueries: null,
        status: 'done' as const,
      };
    })
    .filter((u) => u.url.length > 0);
  const candidateTotal = Array.isArray(holder.urls) ? holder.urls.length : null;
  return { rows, candidateTotal };
}

// FIX 3: composite scoring data lives at the output's `.candidates` array.
function findCandidatesArray(output: Record<string, unknown>): unknown {
  for (const value of Object.values(output)) {
    const rec = asRecord(value);
    if (Array.isArray(rec.candidates)) return rec.candidates;
    for (const inner of Object.values(rec)) {
      const ir = asRecord(inner);
      if (Array.isArray(ir.candidates)) return ir.candidates;
    }
  }
  return undefined;
}

function extractCompositeCandidates(output: Record<string, unknown>): CompositeCandidate[] {
  const direct = asRecord(
    pickOutput(output, 'compositescoring', 'result', (v) => Array.isArray(asRecord(v).candidates))
  );
  if (Array.isArray(direct.candidates)) return coerceCandidates(direct.candidates);
  return coerceCandidates(findCandidatesArray(output));
}

function extractWarning(output: Record<string, unknown>): { type: string | null; description: string | null } {
  const asStr = (v: unknown): string | null => (typeof v === 'string' && v.trim().length > 0 ? v : null);
  let type = asStr(output['validationpass.warning.type']);
  let description = asStr(output['validationpass.warning.description']);
  if (type === null || description === null) {
    const warning = asRecord(pickOutput(output, 'validationpass', 'warning'));
    if (type === null) type = asStr(warning.type);
    if (description === null) description = asStr(warning.description);
  }
  return { type, description };
}

function buildSourceKeywords(urls: CompetitorUrl[]): SourceKeyword[] {
  const map = new Map<string, SourceKeyword>();
  for (const u of urls) {
    const seenInUrl = new Set<string>();
    for (const k of u.keywordsFound ?? []) {
      if (seenInUrl.has(k.keyword)) continue;
      seenInUrl.add(k.keyword);
      const existing = map.get(k.keyword);
      if (existing) {
        existing.urlFrequency += 1;
        existing.volume = existing.volume ?? k.volume;
        existing.difficulty = existing.difficulty ?? k.difficulty;
        existing.compositeScore = Math.max(existing.compositeScore, k.compositeScore);
      } else {
        map.set(k.keyword, { ...k, urlFrequency: Math.max(1, k.urlFrequency > 0 ? 1 : 1) });
      }
    }
  }
  return Array.from(map.values());
}

function notifyParent(event: string, payload?: Record<string, unknown>): void {
  if (typeof window === 'undefined' || window.parent === window) return;
  try {
    window.parent.postMessage({ source: 'keyword-research-agent', event, ...(payload ?? {}) }, '*');
  } catch {
    // Cross-origin restrictions — ignore.
  }
}

function persistRun(inputs: RunInputs, output: SavedRunOutput): void {
  void fetch('/api/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool: 'keyword-research', label: inputs.keyword, status: 'completed', inputs, output }),
  }).catch(() => undefined);
}

export default function KeywordResearchClient() {
  const [keyword, setKeyword] = useState('');
  const [intent, setIntent] = useState<Intent>('commercial');
  const [clientName, setClientName] = useState('');
  const [status, setStatus] = useState<RunStatus>('idle');
  const [initError, setInitError] = useState<string | null>(null);
  const [stages, setStages] = useState<Record<Stage, StageStatus>>(INITIAL_STAGES);
  const [variants, setVariants] = useState<string[]>([]);
  const [serpResults, setSerpResults] = useState<SerpResult[]>([]);
  const [urls, setUrls] = useState<CompetitorUrl[]>([]);
  const [candidateCount, setCandidateCount] = useState<number | null>(null);
  const [normalizedKeywords, setNormalizedKeywords] = useState<NormalizedKeyword[]>([]);
  const [compositeCandidates, setCompositeCandidates] = useState<CompositeCandidate[]>([]);
  const [alignmentScores, setAlignmentScores] = useState<ScoredKeyword[]>([]);
  const [allKeywords, setAllKeywords] = useState<SourceKeyword[]>([]);
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [runInputs, setRunInputs] = useState<RunInputs | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [primaryCandidates, setPrimaryCandidates] = useState<number | null>(null);
  const [secondaryCandidates, setSecondaryCandidates] = useState<number | null>(null);
  const [semrushRefresh, setSemrushRefresh] = useState(0);

  const eventSourceRef = useRef<EventSource | null>(null);
  // Set when "[DONE]" or the event:"final" payload field has been received —
  // a socket close after this point is SUCCESS, never an error.
  const completionRef = useRef(false);
  const seenBlocksRef = useRef<Set<string>>(new Set());
  const startedRef = useRef(false);

  const running = status === 'initializing' || status === 'streaming';

  // Restore the most recent persisted run (best-effort — never blocks the page).
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
        const inputs = asRecord(run.inputs);
        const output = asRecord(run.output);
        const kw = typeof inputs.keyword === 'string' ? inputs.keyword : '';
        if (!kw || cancelled || startedRef.current) return;
        const primary = coercePrimary(output.primary);
        const secondary = coerceSecondary(output.secondary);
        if (primary.length === 0 && secondary.length === 0) return;
        const restoredIntent: Intent = inputs.intent === 'informational' ? 'informational' : 'commercial';
        const restoredClient = typeof inputs.client === 'string' ? inputs.client : '';
        setKeyword(kw);
        setIntent(restoredIntent);
        setClientName(restoredClient);
        setRunInputs({ keyword: kw, intent: restoredIntent, client: restoredClient || undefined });
        setResult({
          primary,
          secondary,
          warning: typeof output.warning === 'string' ? output.warning : null,
          warningType: typeof output.warningType === 'string' ? output.warningType : null,
        });
        setVariants(extractStringArray(output.variants));
        setSerpResults(coerceSerp(output.serpResults));
        setUrls(coerceUrls(output.urls));
        setNormalizedKeywords(coerceNormalized(output.normalizedKeywords));
        setCompositeCandidates(coerceCandidates(output.compositeCandidates));
        setAlignmentScores(coerceScored(output.alignmentScores));
        setAllKeywords(coerceSource(output.allKeywords));
        setStages(ALL_DONE_STAGES);
        setStatus('complete');
      } catch {
        // Restore is best-effort only.
      }
    }
    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  // Close any open stream on unmount.
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, []);

  function resetRunState(): void {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    completionRef.current = false;
    seenBlocksRef.current = new Set();
    setStages(INITIAL_STAGES);
    setVariants([]);
    setSerpResults([]);
    setUrls([]);
    setCandidateCount(null);
    setNormalizedKeywords([]);
    setCompositeCandidates([]);
    setAlignmentScores([]);
    setAllKeywords([]);
    setResult(null);
    setRunError(null);
    setPrimaryCandidates(null);
    setSecondaryCandidates(null);
  }

  function handleChunk(blockId: string): void {
    // Best-effort stage advancement: each newly-seen blockId moves the tracker
    // one step forward. Chunks that do not map cleanly are simply absorbed.
    const seen = seenBlocksRef.current;
    if (seen.has(blockId)) return;
    seen.add(blockId);
    const index = Math.min(seen.size - 1, STAGE_KEYS.length - 1);
    setStages(() => {
      const next: Record<Stage, StageStatus> = { ...INITIAL_STAGES };
      STAGE_KEYS.forEach((key, i) => {
        next[key] = i < index ? 'done' : i === index ? 'active' : 'pending';
      });
      return next;
    });
  }

  function handleFinal(output: Record<string, unknown>, inputs: RunInputs): void {
    completionRef.current = true;

    // Extract EVERY selected output from the 14-key contract (dotted-key or blockId shapes).
    const variantList = extractStringArray(pickOutput(output, 'queryexpansion', 'variants'));
    const serp = coerceSerp(pickOutput(output, 'serpfetch', 'result'));
    const { rows: scoredUrls, candidateTotal } = extractSelectedUrls(output);
    const semrushGroups = coerceSemrushGroups(pickOutput(output, 'aggregatesemrushrows', 'result'));
    const mergedUrls = mergeUrlLists(scoredUrls, semrushGroups);
    const normalized = coerceNormalized(pickOutput(output, 'dedup&volumenormalize', 'result'));
    const candidates = extractCompositeCandidates(output);
    const alignment = coerceScored(pickOutput(output, 'alignmentscoring', 'scores'));
    const aiPrimary = coercePrimary(pickOutput(output, 'aishortlisting', 'primary'));
    const aiSecondary = coerceSecondary(pickOutput(output, 'aishortlisting', 'secondary'));
    const validatedPrimary = coercePrimary(pickOutput(output, 'validationpass', 'primary'));
    const validatedSecondary = coerceSecondary(pickOutput(output, 'validationpass', 'secondary'));
    const warning = extractWarning(output);
    // exasearch.results stays in the request contract but is intentionally NOT rendered (UI fix #2).

    const primary = validatedPrimary.length > 0 ? validatedPrimary : aiPrimary;
    const secondary = validatedSecondary.length > 0 ? validatedSecondary : aiSecondary;
    const finalResult: ResultPayload = {
      primary,
      secondary,
      warning: warning.description,
      warningType: warning.type,
    };
    const sourceKeywords = buildSourceKeywords(mergedUrls);

    setVariants(variantList);
    setSerpResults(serp);
    setUrls(mergedUrls);
    setCandidateCount(candidateTotal);
    setNormalizedKeywords(normalized);
    setCompositeCandidates(candidates);
    setAlignmentScores(alignment);
    setAllKeywords(sourceKeywords);
    setPrimaryCandidates(aiPrimary.length > 0 ? aiPrimary.length : null);
    setSecondaryCandidates(aiSecondary.length > 0 ? aiSecondary.length : null);
    setResult(finalResult);
    setStages(ALL_DONE_STAGES);
    setStatus('complete');
    setSemrushRefresh((n) => n + 1);
    notifyParent('run-complete', { keyword: inputs.keyword });

    persistRun(inputs, {
      primary,
      secondary,
      warning: warning.description,
      warningType: warning.type,
      allKeywords: sourceKeywords,
      variants: variantList,
      urls: mergedUrls,
      serpResults: serp,
      normalizedKeywords: normalized,
      compositeCandidates: candidates,
      alignmentScores: alignment,
    });
  }

  function startStream(token: string, inputs: RunInputs): void {
    const es = new EventSource(`/api/keyword-research/stream/${token}`);
    eventSourceRef.current = es;

    // The upstream emits ONLY default `message` events — never named SSE events.
    es.onmessage = (event: MessageEvent<string>) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        devWarn('Skipping unparseable SSE message', event.data);
        return;
      }

      // Terminator: data: "[DONE]" — a JSON string literal, the ONLY completion signal.
      if (parsed === '[DONE]') {
        completionRef.current = true;
        es.close();
        eventSourceRef.current = null;
        setStages(ALL_DONE_STAGES);
        setStatus('complete');
        setSemrushRefresh((n) => n + 1);
        notifyParent('run-done', { keyword: inputs.keyword });
        return;
      }

      const obj = asRecord(parsed);

      // Final payload: {"event":"final","data":{"output":{...}}} — "final" is a FIELD, not an SSE event name.
      if (obj.event === 'final') {
        try {
          const data = asRecord(obj.data);
          handleFinal(asRecord(data.output), inputs);
        } catch (err) {
          devWarn('Failed to process final payload', err);
        }
        return;
      }

      // Progress chunk: {"blockId":"<uuid>","chunk":"..."}
      if (typeof obj.blockId === 'string' && obj.blockId.length > 0) {
        handleChunk(obj.blockId);
      }
    };

    es.onerror = () => {
      // Only surface an error if NO "[DONE]" and NO "final" arrived yet.
      if (completionRef.current) {
        es.close();
        eventSourceRef.current = null;
        return;
      }
      es.close();
      eventSourceRef.current = null;
      setStatus('failed');
      setRunError('Connection to the research stream was lost. Please retry.');
      notifyParent('run-failed', { keyword: inputs.keyword });
    };
  }

  async function handleSubmit(): Promise<void> {
    const kw = keyword.trim();
    if (!kw || running) return;
    startedRef.current = true;
    resetRunState();
    setInitError(null);
    setStatus('initializing');
    const inputs: RunInputs = { keyword: kw, intent, client: clientName.trim() || undefined };
    setRunInputs(inputs);
    notifyParent('run-started', { keyword: kw });
    try {
      const res = await fetch('/api/keyword-research/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: kw, intent, client: clientName.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setInitError(data?.error ?? 'Could not start the research run. Please try again.');
        setStatus('idle');
        return;
      }
      const data = (await res.json()) as { token?: unknown };
      if (typeof data.token !== 'string' || data.token.length === 0) {
        setInitError('The server did not return a valid stream token.');
        setStatus('idle');
        return;
      }
      setStatus('streaming');
      setStages({ ...INITIAL_STAGES, variants: 'active' });
      startStream(data.token, inputs);
    } catch {
      setInitError('Could not start the research run. Please try again.');
      setStatus('idle');
    }
  }

  function handleCancel(): void {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setStatus('idle');
  }

  function handleReset(): void {
    resetRunState();
    setKeyword('');
    setClientName('');
    setIntent('commercial');
    setRunInputs(null);
    setInitError(null);
    setStatus('idle');
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Keyword Research</h1>
          <p className="mt-1 text-sm text-slate-500">
            Expand a seed keyword into a validated, competitor-backed shortlist.
          </p>
        </div>
        <SemrushBalanceWidget refreshSignal={semrushRefresh} />
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
          void handleSubmit();
        }}
        onCancel={handleCancel}
        onReset={handleReset}
      />

      {status !== 'idle' && <ProgressTracker stages={stages} variants={variants} />}

      {status === 'failed' && runError && (
        <ErrorCard
          message={runError}
          onRetry={() => {
            void handleSubmit();
          }}
        />
      )}

      <div className="flex flex-col gap-6">
        {variants.length > 0 && (
          <QueryVariantsPanel
            seedKeyword={runInputs?.keyword ?? keyword}
            intent={runInputs?.intent ?? intent}
            variants={variants}
            done={stages.variants === 'done'}
          />
        )}
        {serpResults.length > 0 && <SerpResultsPanel results={serpResults} />}
        {urls.length > 0 && (
          <CompetitorUrlsPanel urls={urls} done={stages.url_scoring === 'done'} candidateCount={candidateCount} />
        )}
        {urls.some((u) => (u.keywordsFound?.length ?? 0) > 0) && (
          <SemrushKeywordsPanel urls={urls} done={stages.semrush === 'done'} />
        )}
        {normalizedKeywords.length > 0 && <DedupKeywordsPanel keywords={normalizedKeywords} />}
        {compositeCandidates.length > 0 && <CompositeScoringPanel candidates={compositeCandidates} />}
        {alignmentScores.length > 0 && <AlignmentScoresPanel rows={alignmentScores} />}
        {allKeywords.length > 0 && <SourceKeywordsPanel keywords={allKeywords} />}
        {result && runInputs && (
          <ResultsSection
            result={result}
            inputs={runInputs}
            allKeywords={allKeywords}
            variants={variants}
            competitorUrls={urls}
            serpResults={serpResults}
            normalizedKeywords={normalizedKeywords}
            compositeCandidates={compositeCandidates}
            alignmentScores={alignmentScores}
            primaryCandidates={primaryCandidates}
            secondaryCandidates={secondaryCandidates}
            onResultChange={setResult}
          />
        )}
      </div>
    </div>
  );
}
