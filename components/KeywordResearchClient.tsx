"use client"

import { useRef, useState } from 'react';
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

function parseMaybeJson(v: unknown): unknown {
  if (typeof v === 'string') {
    const t = v.trim();
    if (t.startsWith('{') || t.startsWith('[')) {
      try {
        return JSON.parse(t);
      } catch {
        return v;
      }
    }
  }
  return v;
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
    toNumOrNull(holder.candidateCount) ??
    toNumOrNull(holder.totalCandidates) ??
    toNumOrNull(holder.total) ??
    (Array.isArray(holder.candidates) ? holder.candidates.length : null);
  return { rows, candidateTotal };
}

interface Snapshot {
  variants: string[];
  serp: SerpResult[];
  urls: CompetitorUrl[];
  candidateTotal: number | null;
  normalized: NormalizedKeyword[];
  composite: CompositeCandidate[];
  alignment: ScoredKeyword[];
  allKeywords: SourceKeyword[];
  result: ResultPayload | null;
}

function computeSnapshot(output: Record<string, unknown>): Snapshot {
  const variants = extractStringArray(pickOutput(output, 'queryexpansion', 'variants'));
  const serp = coerceSerp(pickOutput(output, 'serpfetch', 'result') ?? []);
  const sel = extractSelectedUrls(output);
  const semrushGroups = coerceSemrushGroups(pickOutput(output, 'aggregatesemrushrows', 'result') ?? []);
  const urls = mergeUrlLists(sel.rows, semrushGroups);
  const normalized = coerceNormalized(pickOutput(output, 'dedup&volumenormalize', 'result') ?? []);
  const composite = coerceCandidates(flattenToArray(pickOutput(output, 'compositescoring', 'result') ?? []));
  const alignment = coerceScored(pickOutput(output, 'alignmentscoring', 'scores') ?? []);

  // Build the tiered source keyword list from SEMrush keywords grouped per URL.
  const kwMap = new Map<string, SourceKeyword>();
  for (const u of urls) {
    for (const k of u.keywordsFound ?? []) {
      const existing = kwMap.get(k.keyword);
      if (existing) {
        existing.urlFrequency += 1;
        if ((k.volume ?? -1) > (existing.volume ?? -1)) existing.volume = k.volume;
        if (k.compositeScore > existing.compositeScore) existing.compositeScore = k.compositeScore;
      } else {
        kwMap.set(k.keyword, { ...k, urlFrequency: k.urlFrequency > 0 ? k.urlFrequency : 1 });
      }
    }
  }
  const allKeywords = Array.from(kwMap.values());

  const vp = coercePrimary(pickOutput(output, 'validationpass', 'primary'));
  const vs = coerceSecondary(pickOutput(output, 'validationpass', 'secondary'));
  const primary = vp.length > 0 ? vp : coercePrimary(pickOutput(output, 'aishortlisting', 'primary'));
  const secondary = vs.length > 0 ? vs : coerceSecondary(pickOutput(output, 'aishortlisting', 'secondary'));
  const warnRaw = pickOutput(output, 'validationpass', 'warning');
  const warnRec = asRecord(warnRaw);
  const warningType =
    asStringOrNull(pickOutput(output, 'validationpass', 'warning.type')) ?? asStringOrNull(warnRec.type);
  const warning =
    asStringOrNull(pickOutput(output, 'validationpass', 'warning.description')) ??
    asStringOrNull(warnRec.description) ??
    asStringOrNull(warnRaw);
  const result: ResultPayload | null =
    primary.length > 0 || secondary.length > 0 ? { primary, secondary, warning, warningType } : null;

  return {
    variants,
    serp,
    urls,
    candidateTotal: sel.candidateTotal,
    normalized,
    composite,
    alignment,
    allKeywords,
    result,
  };
}

function computeStages(s: Snapshot): Record<Stage, StageStatus> {
  const hasSemrush = s.urls.some((u) => (u.keywordsFound?.length ?? 0) > 0);
  const hasScoring = s.composite.length > 0 || s.alignment.length > 0;
  return {
    variants: s.variants.length > 0 ? 'done' : 'active',
    search: s.serp.length > 0 ? 'done' : s.variants.length > 0 ? 'active' : 'pending',
    url_scoring: s.urls.length > 0 ? 'done' : s.serp.length > 0 ? 'active' : 'pending',
    semrush: hasSemrush ? 'done' : s.urls.length > 0 ? 'active' : 'pending',
    analysis: s.normalized.length > 0 ? 'done' : hasSemrush ? 'active' : 'pending',
    scoring: hasScoring ? 'done' : s.normalized.length > 0 ? 'active' : 'pending',
    validation: s.result ? 'done' : hasScoring ? 'active' : 'pending',
  };
}

// Merge a parsed SSE chunk into the cumulative output record. Tolerates
// { output: {...} } wrappers, { blockName/blockId, output } shapes, and
// JSON-encoded string values.
function mergeChunk(acc: Record<string, unknown>, parsed: unknown): void {
  const rec = asRecord(parsed);
  const blockName = asStringOrNull(rec.blockName) ?? asStringOrNull(rec.blockId);
  for (const [key, value] of Object.entries(rec)) {
    const v = parseMaybeJson(value);
    if ((key === 'output' || key === 'outputs' || key === 'data' || key === 'result') && !Array.isArray(v)) {
      const inner = asRecord(v);
      if (Object.keys(inner).length > 0) {
        for (const [ik, iv] of Object.entries(inner)) acc[ik] = parseMaybeJson(iv);
        if (blockName) acc[blockName] = inner;
        continue;
      }
    }
    if (blockName && (key === 'output' || key === 'result')) {
      acc[blockName] = v;
      continue;
    }
    acc[key] = v;
  }
}

// Persist the completed run (with the FULL pipeline output) so History can
// render every section. Best-effort — failures never break the UI.
async function saveRun(runInputs: RunInputs, snap: Snapshot): Promise<void> {
  if (!snap.result) return;
  const payload: SavedRunOutput = {
    primary: snap.result.primary,
    secondary: snap.result.secondary,
    warning: snap.result.warning ?? null,
    warningType: snap.result.warningType ?? null,
    allKeywords: snap.allKeywords,
    variants: snap.variants,
    urls: snap.urls,
    serpResults: snap.serp,
    normalizedKeywords: snap.normalized,
    compositeCandidates: snap.composite,
    alignmentScores: snap.alignment,
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
        output: payload,
      }),
    });
  } catch (err) {
    devWarn('Failed to save run', err);
  }
}

// NOTE: The generator intentionally starts EMPTY on every page load — it does
// NOT restore the last saved run. Past runs are only visible in the History tab.
export default function KeywordResearchClient() {
  const [keyword, setKeyword] = useState('');
  const [intent, setIntent] = useState<Intent>('commercial');
  const [client, setClient] = useState('');
  const [status, setStatus] = useState<RunStatus>('idle');
  const [initError, setInitError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [inputs, setInputs] = useState<RunInputs | null>(null);
  const [stages, setStages] = useState<Record<Stage, StageStatus>>(INITIAL_STAGES);
  const [variants, setVariants] = useState<string[]>([]);
  const [serpResults, setSerpResults] = useState<SerpResult[]>([]);
  const [urls, setUrls] = useState<CompetitorUrl[]>([]);
  const [candidateTotal, setCandidateTotal] = useState<number | null>(null);
  const [normalizedKeywords, setNormalizedKeywords] = useState<NormalizedKeyword[]>([]);
  const [compositeCandidates, setCompositeCandidates] = useState<CompositeCandidate[]>([]);
  const [alignmentScores, setAlignmentScores] = useState<ScoredKeyword[]>([]);
  const [allKeywords, setAllKeywords] = useState<SourceKeyword[]>([]);
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [balanceSignal, setBalanceSignal] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const running = status === 'initializing' || status === 'streaming';
  const hasSemrushData = urls.some((u) => (u.keywordsFound?.length ?? 0) > 0);

  function resetData(): void {
    setStages(INITIAL_STAGES);
    setVariants([]);
    setSerpResults([]);
    setUrls([]);
    setCandidateTotal(null);
    setNormalizedKeywords([]);
    setCompositeCandidates([]);
    setAlignmentScores([]);
    setAllKeywords([]);
    setResult(null);
  }

  function resetAll(): void {
    setKeyword('');
    setIntent('commercial');
    setClient('');
    setInitError(null);
    setRunError(null);
    setInputs(null);
    setStatus('idle');
    resetData();
  }

  function cancelRun(): void {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus('idle');
  }

  function applyOutput(acc: Record<string, unknown>): Snapshot {
    const snap = computeSnapshot(acc);
    if (snap.variants.length > 0) setVariants(snap.variants);
    if (snap.serp.length > 0) setSerpResults(snap.serp);
    if (snap.urls.length > 0) setUrls(snap.urls);
    if (snap.candidateTotal !== null) setCandidateTotal(snap.candidateTotal);
    if (snap.normalized.length > 0) setNormalizedKeywords(snap.normalized);
    if (snap.composite.length > 0) setCompositeCandidates(snap.composite);
    if (snap.alignment.length > 0) setAlignmentScores(snap.alignment);
    if (snap.allKeywords.length > 0) setAllKeywords(snap.allKeywords);
    if (snap.result) setResult(snap.result);
    setStages(computeStages(snap));
    return snap;
  }

  async function startRun(): Promise<void> {
    const trimmed = keyword.trim();
    if (!trimmed || running) return;
    setInitError(null);
    setRunError(null);
    resetData();
    const runInputs: RunInputs = { keyword: trimmed, intent, client: client.trim() || undefined };
    setInputs(runInputs);
    setStatus('initializing');
    setStages({ ...INITIAL_STAGES, variants: 'active' });

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

    setStatus('streaming');
    const controller = new AbortController();
    abortRef.current = controller;
    const acc: Record<string, unknown> = {};
    let snapshot: Snapshot | null = null;

    const handleLine = (rawLine: string): void => {
      const line = rawLine.trim();
      if (!line.startsWith('data:')) return;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') return;
      try {
        const parsed: unknown = JSON.parse(payload);
        mergeChunk(acc, parsed);
        snapshot = applyOutput(acc);
      } catch {
        // Skip non-JSON SSE lines.
      }
    };

    try {
      const res = await fetch(`/api/keyword-research/stream/${encodeURIComponent(token)}`, {
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `The research stream failed (${res.status}).`);
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
        for (const rawLine of lines) handleLine(rawLine);
      }
      buffer += decoder.decode();
      for (const rawLine of buffer.split('\n')) handleLine(rawLine);

      snapshot = applyOutput(acc);
      if (!snapshot.result) {
        throw new Error('The pipeline finished without returning keyword results.');
      }
      setStatus('complete');
      setStages(ALL_DONE_STAGES);
      setBalanceSignal((s) => s + 1);
      void saveRun(runInputs, snapshot);
    } catch (err) {
      if (controller.signal.aborted) {
        setStatus('idle');
        return;
      }
      setRunError(err instanceof Error && err.message ? err.message : 'The research run failed.');
      setStatus('failed');
    } finally {
      abortRef.current = null;
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6">
      <header className="text-center">
        <h1 className="text-2xl font-bold text-slate-900">Keyword Research</h1>
        <p className="mt-1 text-sm text-slate-500">
          Expand a seed keyword into a validated, competitor-backed shortlist.
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
        onSubmit={() => void startRun()}
        onCancel={cancelRun}
        onReset={resetAll}
      />

      {status === 'failed' && runError && <ErrorCard message={runError} onRetry={() => void startRun()} />}

      {(running || status === 'complete') && <ProgressTracker stages={stages} variants={variants} />}

      {variants.length > 0 && inputs && (
        <QueryVariantsPanel
          seedKeyword={inputs.keyword}
          intent={inputs.intent}
          variants={variants}
          done={stages.variants === 'done'}
        />
      )}

      {serpResults.length > 0 && <SerpResultsPanel results={serpResults} />}

      {urls.length > 0 && (
        <CompetitorUrlsPanel urls={urls} done={stages.url_scoring === 'done'} candidateCount={candidateTotal} />
      )}

      {hasSemrushData && <SemrushKeywordsPanel urls={urls} done={stages.semrush === 'done'} />}

      {normalizedKeywords.length > 0 && <DedupKeywordsPanel keywords={normalizedKeywords} />}

      {compositeCandidates.length > 0 && <CompositeScoringPanel candidates={compositeCandidates} />}

      {alignmentScores.length > 0 && <AlignmentScoresPanel rows={alignmentScores} />}

      {allKeywords.length > 0 && <SourceKeywordsPanel keywords={allKeywords} />}

      {result && inputs && (
        <ResultsSection
          result={result}
          inputs={inputs}
          allKeywords={allKeywords}
          variants={variants}
          competitorUrls={urls}
          serpResults={serpResults}
          normalizedKeywords={normalizedKeywords}
          compositeCandidates={compositeCandidates}
          alignmentScores={alignmentScores}
          onResultChange={(r) => setResult(r)}
        />
      )}
    </div>
  );
}
