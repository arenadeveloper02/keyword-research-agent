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
        // Render entry.score AS-IS - it is already a rounded number
        score: toNumOrNull(o.score) ?? 0,
        title: typeof o.title === 'string' ? o.title : null,
        matchedQueries: toNumOrNull(o.matchedQueries),
        totalQueries: toNumOrNull(o.totalQueries),
        status: 'done' as const,
      };
    })
    .filter((u) => u.url.length > 0);
  const candidateTotal =
    toNumOrNull(holder.candidateCount) ?? toNumOrNull(holder.totalCandidates) ?? toNumOrNull(holder.candidates);
  return { rows, candidateTotal };
}

// Builds the tiered "all source keywords" list by counting how many competitor
// URLs each keyword appears on.
function buildSourceKeywords(urls: CompetitorUrl[]): SourceKeyword[] {
  const map = new Map<string, SourceKeyword>();
  for (const u of urls) {
    for (const k of u.keywordsFound ?? []) {
      const key = k.keyword.toLowerCase();
      const existing = map.get(key);
      if (existing) {
        map.set(key, {
          ...existing,
          urlFrequency: existing.urlFrequency + 1,
          volume: existing.volume ?? k.volume,
          difficulty: existing.difficulty ?? k.difficulty,
          compositeScore: Math.max(existing.compositeScore, k.compositeScore),
        });
      } else {
        map.set(key, { ...k, urlFrequency: k.urlFrequency > 0 ? k.urlFrequency : 1 });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1));
}

interface RunSnapshot {
  variants: string[];
  serpResults: SerpResult[];
  selectedUrls: CompetitorUrl[];
  candidateTotal: number | null;
  mergedUrls: CompetitorUrl[];
  normalizedKeywords: NormalizedKeyword[];
  compositeCandidates: CompositeCandidate[];
  alignmentScores: ScoredKeyword[];
  allKeywords: SourceKeyword[];
  result: ResultPayload | null;
}

function buildSnapshot(output: Record<string, unknown>): RunSnapshot {
  const variants = extractStringArray(parseMaybeJson(pickOutput(output, 'queryexpansion', 'variants')));
  const serpResults = coerceSerp(parseMaybeJson(pickOutput(output, 'serpfetch', 'result')));
  const { rows: selectedUrls, candidateTotal } = extractSelectedUrls(output);
  const groups = coerceSemrushGroups(parseMaybeJson(pickOutput(output, 'aggregatesemrushrows', 'result')));
  const mergedUrls = mergeUrlLists(selectedUrls, groups);
  const normalizedKeywords = coerceNormalized(parseMaybeJson(pickOutput(output, 'dedup&volumenormalize', 'result')));
  const compositeCandidates = coerceCandidates(
    flattenToArray(parseMaybeJson(pickOutput(output, 'compositescoring', 'result')))
  );
  const alignmentScores = coerceScored(parseMaybeJson(pickOutput(output, 'alignmentscoring', 'scores')));
  const allKeywords = buildSourceKeywords(mergedUrls);

  let primary = coercePrimary(parseMaybeJson(pickOutput(output, 'validationpass', 'primary')));
  if (primary.length === 0) {
    primary = coercePrimary(parseMaybeJson(pickOutput(output, 'aishortlisting', 'primary')));
  }
  let secondary = coerceSecondary(parseMaybeJson(pickOutput(output, 'validationpass', 'secondary')));
  if (secondary.length === 0) {
    secondary = coerceSecondary(parseMaybeJson(pickOutput(output, 'aishortlisting', 'secondary')));
  }

  const warningRec = asRecord(parseMaybeJson(pickOutput(output, 'validationpass', 'warning')));
  const warningType =
    asStringOrNull(parseMaybeJson(pickOutput(output, 'validationpass', 'warning.type'))) ??
    asStringOrNull(warningRec.type);
  const warning =
    asStringOrNull(parseMaybeJson(pickOutput(output, 'validationpass', 'warning.description'))) ??
    asStringOrNull(warningRec.description);

  const result: ResultPayload | null =
    primary.length > 0 || secondary.length > 0
      ? { primary, secondary, warning: warning ?? null, warningType: warningType ?? null }
      : null;

  return {
    variants,
    serpResults,
    selectedUrls,
    candidateTotal,
    mergedUrls,
    normalizedKeywords,
    compositeCandidates,
    alignmentScores,
    allKeywords,
    result,
  };
}

function computeStages(
  d: {
    variants: boolean;
    serp: boolean;
    urls: boolean;
    semrush: boolean;
    normalized: boolean;
    composite: boolean;
    final: boolean;
  },
  streaming: boolean
): Record<Stage, StageStatus> {
  const order: [Stage, boolean][] = [
    ['variants', d.variants],
    ['search', d.serp],
    ['url_scoring', d.urls],
    ['semrush', d.semrush],
    ['analysis', d.normalized],
    ['scoring', d.composite],
    ['validation', d.final],
  ];
  const out: Record<Stage, StageStatus> = { ...INITIAL_STAGES };
  let activeSet = false;
  for (const [stage, has] of order) {
    if (has) {
      out[stage] = 'done';
    } else if (streaming && !activeSet) {
      out[stage] = 'active';
      activeSet = true;
    }
  }
  return out;
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
  const [candidateTotal, setCandidateTotal] = useState<number | null>(null);
  const [normalizedKeywords, setNormalizedKeywords] = useState<NormalizedKeyword[]>([]);
  const [compositeCandidates, setCompositeCandidates] = useState<CompositeCandidate[]>([]);
  const [alignmentScores, setAlignmentScores] = useState<ScoredKeyword[]>([]);
  const [allKeywords, setAllKeywords] = useState<SourceKeyword[]>([]);
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [inputs, setInputs] = useState<RunInputs | null>(null);
  const [balanceSignal, setBalanceSignal] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const outputRef = useRef<Record<string, unknown>>({});
  const savedRef = useRef(false);
  const startedRef = useRef(false);

  // Restore the most recent saved run so a reload keeps the last result visible.
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
        const savedInputs = asRecord(parseMaybeJson(run.inputs));
        const out = asRecord(parseMaybeJson(run.output));
        const primary = coercePrimary(parseMaybeJson(out.primary));
        const secondary = coerceSecondary(parseMaybeJson(out.secondary));
        if (primary.length === 0 && secondary.length === 0) return;
        const kw = typeof savedInputs.keyword === 'string' ? savedInputs.keyword : '';
        if (!kw) return;
        if (cancelled || startedRef.current) return;
        const restoredIntent: Intent = savedInputs.intent === 'informational' ? 'informational' : 'commercial';
        const restoredClient = typeof savedInputs.client === 'string' ? savedInputs.client : '';
        setKeyword(kw);
        setIntent(restoredIntent);
        setClient(restoredClient);
        setInputs({ keyword: kw, intent: restoredIntent, client: restoredClient || undefined });
        setResult({
          primary,
          secondary,
          warning: asStringOrNull(out.warning),
          warningType: asStringOrNull(out.warningType),
        });
        setVariants(extractStringArray(parseMaybeJson(out.variants)));
        setUrls(coerceUrls(parseMaybeJson(out.urls)));
        setSerpResults(coerceSerp(parseMaybeJson(out.serpResults)));
        setNormalizedKeywords(coerceNormalized(parseMaybeJson(out.normalizedKeywords)));
        setCompositeCandidates(coerceCandidates(flattenToArray(parseMaybeJson(out.compositeCandidates))));
        setAlignmentScores(coerceScored(parseMaybeJson(out.alignmentScores)));
        setAllKeywords(coerceSource(parseMaybeJson(out.allKeywords)));
        setStages(ALL_DONE_STAGES);
        setStatus('complete');
      } catch (err) {
        devWarn('restore failed', err);
      }
    }
    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  function applySnapshot(snap: RunSnapshot, streaming: boolean): void {
    if (snap.variants.length > 0) setVariants(snap.variants);
    if (snap.serpResults.length > 0) setSerpResults(snap.serpResults);
    if (snap.mergedUrls.length > 0) setUrls(snap.mergedUrls);
    if (snap.candidateTotal !== null) setCandidateTotal(snap.candidateTotal);
    if (snap.normalizedKeywords.length > 0) setNormalizedKeywords(snap.normalizedKeywords);
    if (snap.compositeCandidates.length > 0) setCompositeCandidates(snap.compositeCandidates);
    if (snap.alignmentScores.length > 0) setAlignmentScores(snap.alignmentScores);
    if (snap.allKeywords.length > 0) setAllKeywords(snap.allKeywords);
    if (snap.result) setResult(snap.result);
    setStages(
      computeStages(
        {
          variants: snap.variants.length > 0,
          serp: snap.serpResults.length > 0,
          urls: snap.selectedUrls.length > 0,
          semrush: snap.mergedUrls.some((u) => (u.keywordsFound?.length ?? 0) > 0),
          normalized: snap.normalizedKeywords.length > 0,
          composite: snap.compositeCandidates.length > 0 || snap.alignmentScores.length > 0,
          final: snap.result !== null,
        },
        streaming
      )
    );
  }

  function mergeChunk(chunk: unknown): void {
    const rec = asRecord(chunk);
    const layers: Record<string, unknown>[] = [rec];
    if (rec.output !== undefined) layers.push(asRecord(parseMaybeJson(rec.output)));
    if (rec.data !== undefined) layers.push(asRecord(parseMaybeJson(rec.data)));
    if (typeof rec.result === 'object' && rec.result !== null && !Array.isArray(rec.result)) {
      layers.push(asRecord(rec.result));
    }
    for (const layer of layers) {
      for (const [k, v] of Object.entries(layer)) {
        if (v !== undefined && v !== null) outputRef.current[k] = v;
      }
    }
  }

  function handleSseLine(rawLine: string): void {
    const line = rawLine.trim();
    if (!line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') return;
    try {
      mergeChunk(JSON.parse(payload));
      applySnapshot(buildSnapshot(outputRef.current), true);
    } catch {
      // Skip non-JSON SSE lines.
    }
  }

  async function persistRun(runInputs: RunInputs, snap: RunSnapshot): Promise<void> {
    if (savedRef.current || !snap.result) return;
    savedRef.current = true;
    const output: SavedRunOutput = {
      primary: snap.result.primary,
      secondary: snap.result.secondary,
      warning: snap.result.warning ?? null,
      warningType: snap.result.warningType ?? null,
      allKeywords: snap.allKeywords,
      variants: snap.variants,
      urls: snap.mergedUrls,
      serpResults: snap.serpResults,
      normalizedKeywords: snap.normalizedKeywords,
      compositeCandidates: snap.compositeCandidates,
      alignmentScores: snap.alignmentScores,
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
          output,
        }),
      });
    } catch (err) {
      devWarn('failed to save run', err);
    }
  }

  function finishRun(runInputs: RunInputs): void {
    const snap = buildSnapshot(outputRef.current);
    applySnapshot(snap, false);
    if (snap.result) {
      setStages(ALL_DONE_STAGES);
      setStatus('complete');
      setBalanceSignal((s) => s + 1);
      void persistRun(runInputs, snap);
    } else {
      setRunError('The pipeline finished without returning keyword results. Please try again.');
      setStatus('failed');
    }
  }

  function clearRunData(): void {
    outputRef.current = {};
    savedRef.current = false;
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
    setRunError(null);
    setInitError(null);
  }

  async function startRun(): Promise<void> {
    const kw = keyword.trim();
    if (!kw) return;
    startedRef.current = true;
    clearRunData();
    const runInputs: RunInputs = { keyword: kw, intent, client: client.trim() || undefined };
    setInputs(runInputs);
    setStatus('initializing');
    try {
      const initRes = await fetch('/api/keyword-research/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: kw, intent, client: client.trim() }),
      });
      const initData = (await initRes.json().catch(() => ({}))) as { token?: string; error?: string };
      if (!initRes.ok || !initData.token) {
        setInitError(initData.error ?? 'Could not start the research run.');
        setStatus('idle');
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      setStatus('streaming');
      setStages({ ...INITIAL_STAGES, variants: 'active' });

      const streamRes = await fetch(`/api/keyword-research/stream/${initData.token}`, {
        signal: controller.signal,
      });
      if (!streamRes.ok || !streamRes.body) {
        const text = await streamRes.text().catch(() => '');
        setRunError(text || 'The research stream could not be opened.');
        setStatus('failed');
        return;
      }

      const reader = streamRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
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
      if ((err as { name?: string }).name === 'AbortError') {
        setStatus('idle');
        return;
      }
      devWarn('run failed', err);
      setRunError('The research run failed unexpectedly. Please try again.');
      setStatus('failed');
    } finally {
      abortRef.current = null;
    }
  }

  function cancelRun(): void {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus('idle');
  }

  function resetAll(): void {
    abortRef.current?.abort();
    abortRef.current = null;
    startedRef.current = true;
    clearRunData();
    setKeyword('');
    setClient('');
    setIntent('commercial');
    setInputs(null);
    setStatus('idle');
  }

  const running = status === 'initializing' || status === 'streaming';
  const hasSemrushKeywords = urls.some((u) => (u.keywordsFound?.length ?? 0) > 0);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6">
      <header className="text-center">
        <h1 className="text-2xl font-bold text-slate-900">Keyword Research Agent</h1>
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
        onSubmit={() => {
          void startRun();
        }}
        onCancel={cancelRun}
        onReset={resetAll}
      />

      {running && inputs && (
        <h2 className="text-center text-base font-semibold text-slate-700">
          {`Working on \u201c${inputs.keyword}\u201d${inputs.client ? ` for ${inputs.client}` : ''}\u2026`}
        </h2>
      )}

      {(running || status === 'complete') && <ProgressTracker stages={stages} variants={variants} />}

      {status === 'failed' && runError && (
        <ErrorCard
          message={runError}
          onRetry={() => {
            void startRun();
          }}
        />
      )}

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

      {hasSemrushKeywords && <SemrushKeywordsPanel urls={urls} done={stages.semrush === 'done'} />}

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
          onResultChange={(next) => setResult(next)}
        />
      )}
    </main>
  );
}
