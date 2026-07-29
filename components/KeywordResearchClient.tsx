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
// tries: output["block.field"] \u2192 output[block][field] \u2192 any blockId entry that
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
        // Render entry.score AS-IS \u2014 it is already a rounded number (~20-95).
        score: toNumOrNull(o.score) ?? 0,
        title: typeof o.title === 'string' ? o.title : null,
        matchedQueries: null,
        totalQueries: null,
        status: 'done' as const,
      };
    })
    .filter((u) => u.url.length > 0);
  const candidateTotal =
    toNumOrNull(holder.candidateCount) ??
    toNumOrNull(holder.totalCandidates) ??
    toNumOrNull(holder.totalUrls) ??
    (Array.isArray(holder.allUrls) ? holder.allUrls.length : null);
  return { rows, candidateTotal };
}

interface ExtractedOutput {
  variants: string[];
  serp: SerpResult[];
  selectedUrls: CompetitorUrl[];
  candidateTotal: number | null;
  semrushUrls: CompetitorUrl[];
  normalized: NormalizedKeyword[];
  composite: CompositeCandidate[];
  alignment: ScoredKeyword[];
  shortlistPrimary: PrimaryKeyword[];
  shortlistSecondary: SecondaryKeyword[];
  validatedPrimary: PrimaryKeyword[];
  validatedSecondary: SecondaryKeyword[];
  warning: string | null;
  warningType: string | null;
}

function extractAll(output: Record<string, unknown>): ExtractedOutput {
  const variants = extractStringArray(
    pickOutput(output, 'queryexpansion', 'variants', (v) => extractStringArray(v).length > 0)
  );
  const serp = coerceSerp(pickOutput(output, 'serpfetch', 'result', (v) => coerceSerp(v).length > 0));
  const { rows: selectedUrls, candidateTotal } = extractSelectedUrls(output);
  const semrushUrls = coerceSemrushGroups(
    pickOutput(output, 'aggregatesemrushrows', 'result', (v) => coerceSemrushGroups(v).length > 0)
  );
  const normalized = coerceNormalized(
    pickOutput(output, 'dedup&volumenormalize', 'result', (v) => coerceNormalized(v).length > 0)
  );
  const composite = coerceCandidates(
    flattenToArray(pickOutput(output, 'compositescoring', 'result', (v) => coerceCandidates(flattenToArray(v)).length > 0))
  );
  const alignment = coerceScored(
    pickOutput(output, 'alignmentscoring', 'scores', (v) => coerceScored(v).length > 0)
  );
  const shortlistPrimary = coercePrimary(
    pickOutput(output, 'aishortlisting', 'primary', (v) => coercePrimary(v).length > 0)
  );
  const shortlistSecondary = coerceSecondary(
    pickOutput(output, 'aishortlisting', 'secondary', (v) => coerceSecondary(v).length > 0)
  );
  const validatedPrimary = coercePrimary(
    pickOutput(output, 'validationpass', 'primary', (v) => coercePrimary(v).length > 0)
  );
  const validatedSecondary = coerceSecondary(
    pickOutput(output, 'validationpass', 'secondary', (v) => coerceSecondary(v).length > 0)
  );
  const warningRec = asRecord(pickOutput(output, 'validationpass', 'warning'));
  const warningType =
    asStringOrNull(pickOutput(output, 'validationpass', 'warning.type')) ?? asStringOrNull(warningRec.type);
  const warning =
    asStringOrNull(pickOutput(output, 'validationpass', 'warning.description')) ??
    asStringOrNull(warningRec.description);
  return {
    variants,
    serp,
    selectedUrls,
    candidateTotal,
    semrushUrls,
    normalized,
    composite,
    alignment,
    shortlistPrimary,
    shortlistSecondary,
    validatedPrimary,
    validatedSecondary,
    warning,
    warningType,
  };
}

function buildAllKeywords(urls: CompetitorUrl[]): SourceKeyword[] {
  const map = new Map<string, SourceKeyword>();
  for (const u of urls) {
    for (const k of u.keywordsFound ?? []) {
      const existing = map.get(k.keyword);
      if (existing) {
        existing.urlFrequency += 1;
        if (existing.volume === null && k.volume !== null) existing.volume = k.volume;
        if (existing.difficulty === null && k.difficulty !== null) existing.difficulty = k.difficulty;
        if (existing.compositeScore === 0 && k.compositeScore !== 0) existing.compositeScore = k.compositeScore;
      } else {
        map.set(k.keyword, { ...k, urlFrequency: Math.max(k.urlFrequency, 1) });
      }
    }
  }
  return Array.from(map.values());
}

function computeStages(done: Record<Stage, boolean>): Record<Stage, StageStatus> {
  const stages: Record<Stage, StageStatus> = { ...INITIAL_STAGES };
  let activeAssigned = false;
  for (const key of STAGE_KEYS) {
    if (done[key]) {
      stages[key] = 'done';
    } else if (!activeAssigned) {
      stages[key] = 'active';
      activeAssigned = true;
    }
  }
  return stages;
}

function mergeEvent(agg: Record<string, unknown>, o: Record<string, unknown>): void {
  const blockName =
    typeof o.blockName === 'string'
      ? o.blockName
      : typeof o.blockId === 'string'
        ? o.blockId
        : typeof o.block === 'string'
          ? o.block
          : null;
  const candidates = [o.output, o.result, o.data].filter((v) => v !== undefined && v !== null);
  for (const out of candidates) {
    if (blockName) {
      agg[blockName] = out;
    } else {
      const rec = asRecord(out);
      if (Object.keys(rec).length > 0) Object.assign(agg, rec);
    }
  }
  for (const [k, v] of Object.entries(o)) {
    if (k.includes('.') && v !== undefined) agg[k] = v;
  }
}

export default function KeywordResearchClient() {
  const [keyword, setKeyword] = useState('');
  const [intent, setIntent] = useState<Intent>('commercial');
  const [client, setClient] = useState('');

  const [status, setStatus] = useState<RunStatus>('idle');
  const [initError, setInitError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runInputs, setRunInputs] = useState<RunInputs | null>(null);

  const [stages, setStages] = useState<Record<Stage, StageStatus>>(INITIAL_STAGES);
  const [variants, setVariants] = useState<string[]>([]);
  const [serpResults, setSerpResults] = useState<SerpResult[]>([]);
  const [competitorUrls, setCompetitorUrls] = useState<CompetitorUrl[]>([]);
  const [candidateTotal, setCandidateTotal] = useState<number | null>(null);
  const [normalizedKeywords, setNormalizedKeywords] = useState<NormalizedKeyword[]>([]);
  const [compositeCandidates, setCompositeCandidates] = useState<CompositeCandidate[]>([]);
  const [alignmentScores, setAlignmentScores] = useState<ScoredKeyword[]>([]);
  const [allKeywords, setAllKeywords] = useState<SourceKeyword[]>([]);
  const [primaryCandidates, setPrimaryCandidates] = useState<number | null>(null);
  const [secondaryCandidates, setSecondaryCandidates] = useState<number | null>(null);
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [refreshSignal, setRefreshSignal] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const aggRef = useRef<Record<string, unknown>>({});

  // By default the page starts CLEAR: no previous responses are restored on load.
  // Runs are still saved server-side for auditing, but never auto-shown.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  function resetRunState(): void {
    aggRef.current = {};
    setStages(INITIAL_STAGES);
    setVariants([]);
    setSerpResults([]);
    setCompetitorUrls([]);
    setCandidateTotal(null);
    setNormalizedKeywords([]);
    setCompositeCandidates([]);
    setAlignmentScores([]);
    setAllKeywords([]);
    setPrimaryCandidates(null);
    setSecondaryCandidates(null);
    setResult(null);
  }

  function syncFromAggregate(final: boolean): ExtractedOutput {
    const ex = extractAll(aggRef.current);
    const mergedUrls = mergeUrlLists(ex.selectedUrls, ex.semrushUrls);

    setVariants(ex.variants);
    setSerpResults(ex.serp);
    setCompetitorUrls(mergedUrls);
    setCandidateTotal(ex.candidateTotal);
    setNormalizedKeywords(ex.normalized);
    setCompositeCandidates(ex.composite);
    setAlignmentScores(ex.alignment);
    setAllKeywords(buildAllKeywords(mergedUrls));
    setPrimaryCandidates(ex.shortlistPrimary.length > 0 ? ex.shortlistPrimary.length : null);
    setSecondaryCandidates(ex.shortlistSecondary.length > 0 ? ex.shortlistSecondary.length : null);

    const primary = ex.validatedPrimary.length > 0 ? ex.validatedPrimary : final ? ex.shortlistPrimary : [];
    const secondary = ex.validatedSecondary.length > 0 ? ex.validatedSecondary : final ? ex.shortlistSecondary : [];
    if (primary.length > 0) {
      setResult({ primary, secondary, warning: ex.warning, warningType: ex.warningType });
    }

    if (final) {
      setStages(ALL_DONE_STAGES);
    } else {
      setStages(
        computeStages({
          variants: ex.variants.length > 0,
          search: ex.serp.length > 0,
          url_scoring: ex.selectedUrls.length > 0,
          semrush: ex.semrushUrls.length > 0,
          analysis: ex.alignment.length > 0 || ex.normalized.length > 0,
          scoring: ex.shortlistPrimary.length > 0,
          validation: ex.validatedPrimary.length > 0,
        })
      );
    }
    return ex;
  }

  function saveRun(inputsSnapshot: RunInputs, ex: ExtractedOutput): void {
    const mergedUrls = mergeUrlLists(ex.selectedUrls, ex.semrushUrls);
    const primary = ex.validatedPrimary.length > 0 ? ex.validatedPrimary : ex.shortlistPrimary;
    const secondary = ex.validatedSecondary.length > 0 ? ex.validatedSecondary : ex.shortlistSecondary;
    const output: SavedRunOutput = {
      primary,
      secondary,
      warning: ex.warning,
      warningType: ex.warningType,
      allKeywords: buildAllKeywords(mergedUrls),
      variants: ex.variants,
      urls: mergedUrls,
      serpResults: ex.serp,
      normalizedKeywords: ex.normalized,
      compositeCandidates: ex.composite,
      alignmentScores: ex.alignment,
    };
    void fetch('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: 'keyword-research',
        label: inputsSnapshot.keyword,
        status: 'completed',
        inputs: inputsSnapshot,
        output,
      }),
    }).catch(() => undefined);
  }

  async function startRun(): Promise<void> {
    const trimmed = keyword.trim();
    if (!trimmed || status === 'initializing' || status === 'streaming') return;

    setInitError(null);
    setError(null);
    resetRunState();
    setStatus('initializing');

    const inputsSnapshot: RunInputs = { keyword: trimmed, intent, client: client.trim() || undefined };
    setRunInputs(inputsSnapshot);

    let token = '';
    try {
      const initRes = await fetch('/api/keyword-research/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: trimmed, intent, client: client.trim() }),
      });
      const data = (await initRes.json().catch(() => ({}))) as { token?: unknown; error?: unknown };
      if (!initRes.ok || typeof data.token !== 'string' || data.token.length === 0) {
        setInitError(typeof data.error === 'string' ? data.error : 'Could not start the research run.');
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
        throw new Error(text || `The research stream failed (${res.status}).`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // Read the SSE stream and merge every event into the aggregate output.
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine.startsWith('data:')) continue;
          const payload = trimmedLine.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          let evt: unknown;
          try {
            evt = JSON.parse(payload);
          } catch {
            devWarn('Unparseable SSE payload', payload);
            continue;
          }
          const rec = asRecord(evt);
          const errMsg =
            typeof rec.error === 'string'
              ? rec.error
              : typeof asRecord(rec.data).error === 'string'
                ? (asRecord(rec.data).error as string)
                : null;
          if (errMsg) throw new Error(errMsg);
          mergeEvent(aggRef.current, rec);
          syncFromAggregate(false);
        }
      }

      const finalData = syncFromAggregate(true);
      const primary = finalData.validatedPrimary.length > 0 ? finalData.validatedPrimary : finalData.shortlistPrimary;
      if (primary.length === 0) {
        throw new Error('The pipeline finished without returning any keywords. Please try again.');
      }

      setStatus('complete');
      setRefreshSignal((n) => n + 1);
      saveRun(inputsSnapshot, finalData);
    } catch (err) {
      const isAbort =
        (err instanceof DOMException && err.name === 'AbortError') ||
        (err instanceof Error && err.name === 'AbortError');
      if (isAbort) {
        resetRunState();
        setStatus('idle');
        return;
      }
      devWarn('Research run failed', err);
      setError(err instanceof Error && err.message ? err.message : 'The research run failed unexpectedly.');
      setStatus('failed');
    } finally {
      abortRef.current = null;
    }
  }

  function handleCancel(): void {
    if (abortRef.current) {
      abortRef.current.abort();
    } else {
      resetRunState();
      setStatus('idle');
    }
  }

  function handleReset(): void {
    abortRef.current?.abort();
    resetRunState();
    setKeyword('');
    setClient('');
    setIntent('commercial');
    setRunInputs(null);
    setError(null);
    setInitError(null);
    setStatus('idle');
  }

  const running = status === 'initializing' || status === 'streaming';

  // Default view: a clean, FULL-SCREEN form with no restored responses.
  if (status === 'idle' && result === null) {
    return (
      <main className="flex min-h-screen flex-col px-4 py-6">
        <header className="mx-auto flex w-full max-w-6xl flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Keyword Research</h1>
            <p className="mt-1 text-sm text-slate-500">
              Expand a seed keyword into a validated, competitor-backed shortlist.
            </p>
          </div>
          <SemrushBalanceWidget refreshSignal={refreshSignal} />
        </header>
        <div className="flex w-full flex-1 items-center justify-center py-8">
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
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-5 px-4 py-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Keyword Research</h1>
          <p className="mt-1 text-sm text-slate-500">
            Expand a seed keyword into a validated, competitor-backed shortlist.
          </p>
        </div>
        <SemrushBalanceWidget refreshSignal={refreshSignal} />
      </header>

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

      {status === 'failed' && error && (
        <ErrorCard
          message={error}
          onRetry={() => {
            void startRun();
          }}
        />
      )}

      {running && <ProgressTracker stages={stages} variants={variants} />}

      {variants.length > 0 && (
        <QueryVariantsPanel
          seedKeyword={runInputs?.keyword ?? keyword}
          intent={runInputs?.intent ?? intent}
          variants={variants}
          done={stages.variants === 'done'}
        />
      )}

      {serpResults.length > 0 && <SerpResultsPanel results={serpResults} />}

      {competitorUrls.length > 0 && (
        <CompetitorUrlsPanel urls={competitorUrls} done={stages.url_scoring === 'done'} candidateCount={candidateTotal} />
      )}

      {competitorUrls.some((u) => (u.keywordsFound?.length ?? 0) > 0) && (
        <SemrushKeywordsPanel urls={competitorUrls} done={stages.semrush === 'done'} />
      )}

      {normalizedKeywords.length > 0 && <DedupKeywordsPanel keywords={normalizedKeywords} />}

      {compositeCandidates.length > 0 && <CompositeScoringPanel candidates={compositeCandidates} />}

      {alignmentScores.length > 0 && <AlignmentScoresPanel rows={alignmentScores} />}

      {result && runInputs && (
        <ResultsSection
          result={result}
          inputs={runInputs}
          allKeywords={allKeywords}
          variants={variants}
          competitorUrls={competitorUrls}
          serpResults={serpResults}
          normalizedKeywords={normalizedKeywords}
          compositeCandidates={compositeCandidates}
          alignmentScores={alignmentScores}
          primaryCandidates={primaryCandidates}
          secondaryCandidates={secondaryCandidates}
          onResultChange={setResult}
        />
      )}

      {allKeywords.length > 0 && <SourceKeywordsPanel keywords={allKeywords} />}
    </main>
  );
}
