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
        // Render entry.score AS-IS — it is already a rounded number (~20-95).
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
    toNumOrNull(holder.total) ??
    (Array.isArray(holder.candidates) ? holder.candidates.length : null);
  return { rows, candidateTotal };
}

interface ExtractedOutput {
  variants: string[];
  serpResults: SerpResult[];
  selectedUrls: CompetitorUrl[];
  candidateTotal: number | null;
  semrushUrls: CompetitorUrl[];
  normalizedKeywords: NormalizedKeyword[];
  compositeCandidates: CompositeCandidate[];
  alignmentScores: ScoredKeyword[];
  allKeywords: SourceKeyword[];
  primary: PrimaryKeyword[];
  secondary: SecondaryKeyword[];
  warning: string | null;
  warningType: string | null;
}

const EMPTY_EXTRACTED: ExtractedOutput = {
  variants: [],
  serpResults: [],
  selectedUrls: [],
  candidateTotal: null,
  semrushUrls: [],
  normalizedKeywords: [],
  compositeCandidates: [],
  alignmentScores: [],
  allKeywords: [],
  primary: [],
  secondary: [],
  warning: null,
  warningType: null,
};

function buildAllKeywords(urls: CompetitorUrl[], normalized: NormalizedKeyword[]): SourceKeyword[] {
  const map = new Map<string, SourceKeyword>();
  for (const u of urls) {
    for (const k of u.keywordsFound ?? []) {
      const existing = map.get(k.keyword);
      if (existing) {
        existing.urlFrequency += 1;
        if (existing.volume === null) existing.volume = k.volume;
      } else {
        map.set(k.keyword, { ...k, urlFrequency: Math.max(k.urlFrequency, 1) });
      }
    }
  }
  for (const n of normalized) {
    if (!map.has(n.keyword)) {
      map.set(n.keyword, { keyword: n.keyword, urlFrequency: 1, volume: n.volume, difficulty: null, compositeScore: 0 });
    }
  }
  return Array.from(map.values());
}

function extractAll(output: Record<string, unknown>): ExtractedOutput {
  const variants = extractStringArray(pickOutput(output, 'queryexpansion', 'variants', Array.isArray));
  const serpResults = coerceSerp(pickOutput(output, 'serpfetch', 'result', (v) => flattenToArray(v).length > 0) ?? []);
  const { rows: selectedUrls, candidateTotal } = extractSelectedUrls(output);
  const semrushUrls = coerceSemrushGroups(
    pickOutput(output, 'aggregatesemrushrows', 'result', (v) => flattenToArray(v).length > 0) ?? []
  );
  const normalizedRaw = pickOutput(output, 'dedup&volumenormalize', 'result', (v) => flattenToArray(v).length > 0) ?? [];
  const normalizedKeywords = coerceNormalized(normalizedRaw);
  const compositeCandidates = coerceCandidates(
    flattenToArray(pickOutput(output, 'compositescoring', 'result', (v) => flattenToArray(v).length > 0) ?? [])
  );
  const alignmentScores = coerceScored(
    pickOutput(output, 'alignmentscoring', 'scores', (v) => flattenToArray(v).length > 0) ?? []
  );

  const dedupSource = coerceSource(normalizedRaw);
  const allKeywords = dedupSource.some((k) => k.urlFrequency > 0)
    ? dedupSource
    : buildAllKeywords(semrushUrls, normalizedKeywords);

  const validationPrimary = coercePrimary(pickOutput(output, 'validationpass', 'primary', Array.isArray));
  const shortlistPrimary = coercePrimary(pickOutput(output, 'aishortlisting', 'primary', Array.isArray));
  const primary = validationPrimary.length > 0 ? validationPrimary : shortlistPrimary;

  const validationSecondary = coerceSecondary(pickOutput(output, 'validationpass', 'secondary', Array.isArray));
  const shortlistSecondary = coerceSecondary(pickOutput(output, 'aishortlisting', 'secondary', Array.isArray));
  const secondary = validationSecondary.length > 0 ? validationSecondary : shortlistSecondary;

  const warningObj = asRecord(pickOutput(output, 'validationpass', 'warning'));
  const warningTypeRaw = pickOutput(output, 'validationpass', 'warning.type');
  const warningDescRaw = pickOutput(output, 'validationpass', 'warning.description');
  const warningType =
    typeof warningTypeRaw === 'string' && warningTypeRaw.length > 0
      ? warningTypeRaw
      : typeof warningObj.type === 'string' && warningObj.type.length > 0
        ? warningObj.type
        : null;
  const warning =
    typeof warningDescRaw === 'string' && warningDescRaw.length > 0
      ? warningDescRaw
      : typeof warningObj.description === 'string' && warningObj.description.length > 0
        ? warningObj.description
        : null;

  return {
    variants,
    serpResults,
    selectedUrls,
    candidateTotal,
    semrushUrls,
    normalizedKeywords,
    compositeCandidates,
    alignmentScores,
    allKeywords,
    primary,
    secondary,
    warning,
    warningType,
  };
}

function computeStages(x: ExtractedOutput): Record<Stage, StageStatus> {
  const done: Record<Stage, boolean> = {
    variants: x.variants.length > 0,
    search: x.serpResults.length > 0,
    url_scoring: x.selectedUrls.length > 0,
    semrush: x.semrushUrls.some((u) => (u.keywordsFound?.length ?? 0) > 0),
    analysis: x.normalizedKeywords.length > 0,
    scoring: x.compositeCandidates.length > 0 || x.alignmentScores.length > 0,
    validation: x.primary.length > 0 || x.secondary.length > 0,
  };
  const stages: Record<Stage, StageStatus> = { ...INITIAL_STAGES };
  let activeSet = false;
  for (const key of STAGE_KEYS) {
    if (done[key]) {
      stages[key] = 'done';
    } else if (!activeSet) {
      stages[key] = 'active';
      activeSet = true;
    }
  }
  return stages;
}

function parseSseChunk(buffer: string): { events: Record<string, unknown>[]; rest: string } {
  const events: Record<string, unknown>[] = [];
  const parts = buffer.split('\n');
  const rest = parts.pop() ?? '';
  for (const line of parts) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const jsonText = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
    if (!jsonText || jsonText === '[DONE]') continue;
    if (!jsonText.startsWith('{') && !jsonText.startsWith('[')) continue;
    try {
      const parsed: unknown = JSON.parse(jsonText);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        events.push(parsed as Record<string, unknown>);
      }
    } catch {
      // Partial or non-JSON line — ignore.
    }
  }
  return { events, rest };
}

function mergeEvent(target: Record<string, unknown>, evt: Record<string, unknown>): void {
  const inner = asRecord(evt.data);
  const source = Object.keys(inner).length > 0 ? inner : evt;

  const blockName =
    typeof source.blockName === 'string'
      ? source.blockName
      : typeof source.blockId === 'string'
        ? source.blockId
        : typeof source.block === 'string'
          ? source.block
          : '';

  if (blockName && source.output !== undefined && source.output !== null) {
    target[blockName] = source.output;
    return;
  }

  const out = asRecord(source.output);
  if (Object.keys(out).length > 0) {
    for (const [k, v] of Object.entries(out)) target[k] = v;
    return;
  }

  // Fallback: dotted keys directly on the event payload.
  for (const [k, v] of Object.entries(source)) {
    if (k.includes('.')) target[k] = v;
  }
}

export default function KeywordResearchClient() {
  const [keyword, setKeyword] = useState('');
  const [intent, setIntent] = useState<Intent>('commercial');
  const [client, setClient] = useState('');
  const [status, setStatus] = useState<RunStatus>('idle');
  const [initError, setInitError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [stages, setStages] = useState<Record<Stage, StageStatus>>({ ...INITIAL_STAGES });
  const [extracted, setExtracted] = useState<ExtractedOutput>(EMPTY_EXTRACTED);
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [runInputs, setRunInputs] = useState<RunInputs | null>(null);
  const [balanceRefresh, setBalanceRefresh] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const outputRef = useRef<Record<string, unknown>>({});
  const savedRef = useRef(false);

  // Restore the most recent saved run so a reload never loses results.
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
        const inputs = asRecord(run.inputs);
        const saved = asRecord(run.output);
        const primary = coercePrimary(saved.primary);
        const secondary = coerceSecondary(saved.secondary);
        if (primary.length === 0 && secondary.length === 0) return;

        const restoredInputs: RunInputs = {
          keyword: typeof inputs.keyword === 'string' ? inputs.keyword : '',
          intent: inputs.intent === 'informational' ? 'informational' : 'commercial',
          client: typeof inputs.client === 'string' ? inputs.client : '',
        };
        const urls = coerceUrls(saved.urls ?? []);
        const warning = typeof saved.warning === 'string' && saved.warning.length > 0 ? saved.warning : null;
        const warningType =
          typeof saved.warningType === 'string' && saved.warningType.length > 0 ? saved.warningType : null;
        const ext: ExtractedOutput = {
          variants: extractStringArray(saved.variants),
          serpResults: coerceSerp(saved.serpResults ?? []),
          selectedUrls: urls,
          candidateTotal: null,
          semrushUrls: urls.filter((u) => (u.keywordsFound?.length ?? 0) > 0),
          normalizedKeywords: coerceNormalized(saved.normalizedKeywords ?? []),
          compositeCandidates: coerceCandidates(asArray(saved.compositeCandidates)),
          alignmentScores: coerceScored(saved.alignmentScores ?? []),
          allKeywords: coerceSource(saved.allKeywords ?? []),
          primary,
          secondary,
          warning,
          warningType,
        };
        if (cancelled) return;
        setExtracted(ext);
        setResult({ primary, secondary, warning, warningType });
        setRunInputs(restoredInputs);
        setKeyword(restoredInputs.keyword);
        setIntent(restoredInputs.intent);
        setClient(restoredInputs.client ?? '');
        setStages({ ...ALL_DONE_STAGES });
        setStatus('complete');
      } catch (err) {
        devWarn('failed to restore last run', err);
      }
    }
    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveRun(inputs: RunInputs, ext: ExtractedOutput, finalResult: ResultPayload): Promise<void> {
    if (savedRef.current) return;
    savedRef.current = true;
    const output: SavedRunOutput = {
      primary: finalResult.primary,
      secondary: finalResult.secondary,
      warning: finalResult.warning ?? null,
      warningType: finalResult.warningType ?? null,
      allKeywords: ext.allKeywords,
      variants: ext.variants,
      urls: mergeUrlLists(ext.selectedUrls, ext.semrushUrls),
      serpResults: ext.serpResults,
      normalizedKeywords: ext.normalizedKeywords,
      compositeCandidates: ext.compositeCandidates,
      alignmentScores: ext.alignmentScores,
    };
    try {
      await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'keyword-research',
          label: inputs.keyword,
          status: 'completed',
          inputs,
          output,
        }),
      });
    } catch (err) {
      devWarn('failed to save run', err);
    }
  }

  async function startRun(): Promise<void> {
    const seed = keyword.trim();
    if (!seed) return;

    setInitError(null);
    setRunError(null);
    setResult(null);
    setExtracted(EMPTY_EXTRACTED);
    setStages({ ...INITIAL_STAGES, variants: 'active' });
    setStatus('initializing');
    outputRef.current = {};
    savedRef.current = false;

    const inputs: RunInputs = { keyword: seed, intent, client: client.trim() };
    setRunInputs(inputs);

    let token = '';
    try {
      const initRes = await fetch('/api/keyword-research/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: seed, intent, client: client.trim() }),
      });
      const initData = (await initRes.json()) as { token?: unknown; error?: unknown };
      if (!initRes.ok || typeof initData.token !== 'string' || initData.token.length === 0) {
        setInitError(typeof initData.error === 'string' ? initData.error : 'Could not start the research run.');
        setStatus('idle');
        return;
      }
      token = initData.token;
    } catch {
      setInitError('Could not start the research run. Check your connection and try again.');
      setStatus('idle');
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('streaming');

    try {
      const res = await fetch(`/api/keyword-research/stream/${token}`, { signal: controller.signal });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '');
        setRunError(text || `The pipeline returned an error (${res.status}).`);
        setStatus('failed');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = parseSseChunk(buffer);
        buffer = rest;
        if (events.length > 0) {
          for (const evt of events) mergeEvent(outputRef.current, evt);
          const ext = extractAll(outputRef.current);
          setExtracted(ext);
          setStages(computeStages(ext));
        }
      }
      // Flush any trailing buffered line.
      const { events: tailEvents } = parseSseChunk(`${buffer}\n`);
      for (const evt of tailEvents) mergeEvent(outputRef.current, evt);

      const finalExt = extractAll(outputRef.current);
      if (finalExt.primary.length === 0 && finalExt.secondary.length === 0) {
        setExtracted(finalExt);
        setRunError('The pipeline finished without returning any keywords. Please try again.');
        setStatus('failed');
        return;
      }

      const finalResult: ResultPayload = {
        primary: finalExt.primary,
        secondary: finalExt.secondary,
        warning: finalExt.warning,
        warningType: finalExt.warningType,
      };
      setExtracted(finalExt);
      setStages({ ...ALL_DONE_STAGES });
      setResult(finalResult);
      setStatus('complete');
      setBalanceRefresh((n) => n + 1);
      void saveRun(inputs, finalExt, finalResult);
    } catch (err) {
      if (controller.signal.aborted) {
        setStatus('idle');
        setStages({ ...INITIAL_STAGES });
        return;
      }
      devWarn('stream failed', err);
      setRunError('The research stream was interrupted. Please retry.');
      setStatus('failed');
    } finally {
      abortRef.current = null;
    }
  }

  function cancelRun(): void {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus('idle');
    setStages({ ...INITIAL_STAGES });
  }

  function resetAll(): void {
    abortRef.current?.abort();
    abortRef.current = null;
    setKeyword('');
    setIntent('commercial');
    setClient('');
    setStatus('idle');
    setInitError(null);
    setRunError(null);
    setStages({ ...INITIAL_STAGES });
    setExtracted(EMPTY_EXTRACTED);
    setResult(null);
    setRunInputs(null);
    outputRef.current = {};
    savedRef.current = false;
  }

  const running = status === 'initializing' || status === 'streaming';
  const showPipeline = running || status === 'complete' || status === 'failed';
  const displayUrls = mergeUrlLists(extracted.selectedUrls, extracted.semrushUrls);
  const hasSemrushKeywords = displayUrls.some((u) => (u.keywordsFound?.length ?? 0) > 0);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Keyword Research Agent</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            Expand a seed keyword into a validated, competitor-backed shortlist — streamed live from the research
            pipeline.
          </p>
        </div>
        <SemrushBalanceWidget refreshSignal={balanceRefresh} />
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
        onSubmit={startRun}
        onCancel={cancelRun}
        onReset={resetAll}
      />

      {showPipeline && <ProgressTracker stages={stages} variants={extracted.variants} />}

      {status === 'failed' && runError && <ErrorCard message={runError} onRetry={startRun} />}

      {showPipeline && extracted.variants.length > 0 && (
        <QueryVariantsPanel
          seedKeyword={runInputs?.keyword ?? keyword}
          intent={runInputs?.intent ?? intent}
          variants={extracted.variants}
          done={stages.variants === 'done'}
        />
      )}

      {extracted.serpResults.length > 0 && <SerpResultsPanel results={extracted.serpResults} />}

      {extracted.selectedUrls.length > 0 && (
        <CompetitorUrlsPanel
          urls={extracted.selectedUrls}
          done={stages.url_scoring === 'done'}
          candidateCount={extracted.candidateTotal}
        />
      )}

      {hasSemrushKeywords && <SemrushKeywordsPanel urls={displayUrls} done={stages.semrush === 'done'} />}

      {extracted.normalizedKeywords.length > 0 && <DedupKeywordsPanel keywords={extracted.normalizedKeywords} />}

      {extracted.compositeCandidates.length > 0 && <CompositeScoringPanel candidates={extracted.compositeCandidates} />}

      {extracted.alignmentScores.length > 0 && <AlignmentScoresPanel rows={extracted.alignmentScores} />}

      {extracted.allKeywords.length > 0 && <SourceKeywordsPanel keywords={extracted.allKeywords} />}

      {result && runInputs && (
        <ResultsSection
          result={result}
          inputs={runInputs}
          allKeywords={extracted.allKeywords}
          variants={extracted.variants}
          competitorUrls={displayUrls}
          serpResults={extracted.serpResults}
          normalizedKeywords={extracted.normalizedKeywords}
          compositeCandidates={extracted.compositeCandidates}
          alignmentScores={extracted.alignmentScores}
          onResultChange={setResult}
        />
      )}
    </div>
  );
}
