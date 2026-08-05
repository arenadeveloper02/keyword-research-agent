"use client"

import { useEffect, useRef, useState } from 'react';
import type {
  CompetitorUrl,
  CompositeCandidate,
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

const STAGE_ORDER: Stage[] = [
  'variants',
  'search',
  'url_scoring',
  'semrush',
  'analysis',
  'scoring',
  'validation',
];

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

function domainOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function sanitizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

interface Shortlist {
  primary: PrimaryKeyword[];
  secondary: SecondaryKeyword[];
}

interface CollectedData {
  variants: string[];
  serpResults: SerpResult[];
  selectedUrls: CompetitorUrl[];
  mergedUrls: CompetitorUrl[];
  normalizedKeywords: NormalizedKeyword[];
  compositeCandidates: CompositeCandidate[];
  alignmentScores: ScoredKeyword[];
  allKeywords: SourceKeyword[];
  shortlists: Shortlist[];
  warning: string | null;
  warningType: string | null;
}

function emptyCollected(): CollectedData {
  return {
    variants: [],
    serpResults: [],
    selectedUrls: [],
    mergedUrls: [],
    normalizedKeywords: [],
    compositeCandidates: [],
    alignmentScores: [],
    allKeywords: [],
    shortlists: [],
    warning: null,
    warningType: null,
  };
}

interface ExtractedData {
  variants?: string[];
  searchQueries?: string[];
  serpResults?: SerpResult[];
  selectedUrls?: CompetitorUrl[];
  semrushGroups?: CompetitorUrl[];
  normalized?: NormalizedKeyword[];
  composite?: CompositeCandidate[];
  sourceKeywords?: SourceKeyword[];
  alignment?: ScoredKeyword[];
  shortlists?: Shortlist[];
  warning?: string;
  warningType?: string;
}

// Shortlist entries may arrive with `reasoning` instead of `rationale`.
function coercePrimary(v: unknown): PrimaryKeyword[] {
  return asArray(v)
    .map((item) => {
      const o = asRecord(item);
      return {
        keyword: typeof o.keyword === 'string' ? o.keyword : '',
        volume: toNumOrNull(o.volume),
        difficulty: toNumOrNull(o.difficulty),
        rationale:
          typeof o.rationale === 'string'
            ? o.rationale
            : typeof o.reasoning === 'string'
              ? o.reasoning
              : null,
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

// serpfetch.result.organic entries: { link, title, snippet, position, sourceQuery }
function coerceSerpOrganic(v: unknown): SerpResult[] {
  return asArray(v)
    .map((item) => {
      const o = asRecord(item);
      const url = typeof o.link === 'string' ? o.link : typeof o.url === 'string' ? o.url : '';
      return {
        rank: toNumOrNull(o.position) ?? toNumOrNull(o.rank),
        title: typeof o.title === 'string' ? o.title : null,
        url,
        domain: url ? domainOf(url) : '',
      };
    })
    .filter((r) => r.url.length > 0);
}

// urlscoring&selection.result.selectedUrls entries: { url, title, snippet, position, domain, score }
function coerceSelectedUrls(v: unknown): CompetitorUrl[] {
  return asArray(v)
    .map((item) => {
      const o = asRecord(item);
      const url = typeof o.url === 'string' ? o.url : '';
      let domain = typeof o.domain === 'string' && o.domain.length > 0 ? o.domain : '';
      if (!domain && url) domain = domainOf(url);
      return {
        url,
        domain,
        score: toNumOrNull(o.score) ?? 0,
        title: typeof o.title === 'string' ? o.title : null,
        status: 'done' as const,
      };
    })
    .filter((u) => u.url.length > 0);
}

// alignmentscoring.scores entries: { keyword, alignment }
function coerceAlignment(v: unknown): ScoredKeyword[] {
  return asArray(v)
    .map((item) => {
      const o = asRecord(item);
      return {
        keyword: typeof o.keyword === 'string' ? o.keyword : '',
        score: toNumOrNull(o.alignment) ?? toNumOrNull(o.score),
      };
    })
    .filter((k) => k.keyword.length > 0);
}

function coerceComposite(v: unknown): CompositeCandidate[] {
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

function coerceNormalized(v: unknown): NormalizedKeyword[] {
  return asArray(v)
    .map((item) => {
      const o = asRecord(item);
      return {
        keyword: typeof o.keyword === 'string' ? o.keyword : '',
        volume: toNumOrNull(o.volume),
      };
    })
    .filter((k) => k.keyword.length > 0);
}

function coerceSourceKeywords(v: unknown): SourceKeyword[] {
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

// aggregatesemrushrows.result.rows entries: { "Keyword", "Search Volume", "CPC", "_sourceUrl" }
function groupSemrushRows(v: unknown): CompetitorUrl[] {
  const byUrl = new Map<string, SourceKeyword[]>();
  for (const item of asArray(v)) {
    const o = asRecord(item);
    const keyword =
      typeof o.Keyword === 'string' ? o.Keyword : typeof o.keyword === 'string' ? o.keyword : '';
    const url =
      typeof o._sourceUrl === 'string' ? o._sourceUrl : typeof o.url === 'string' ? o.url : '';
    if (!keyword || !url) continue;
    const volume = toNumOrNull(o['Search Volume']) ?? toNumOrNull(o.volume);
    const list = byUrl.get(url) ?? [];
    list.push({ keyword, urlFrequency: 0, volume, difficulty: null, compositeScore: 0 });
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
      keywordsFound: (u.keywordsFound?.length ?? 0) > 0 ? u.keywordsFound : existing.keywordsFound,
      status: 'done',
    });
  }
  return Array.from(map.values());
}

// Scan a streamed text buffer for complete top-level JSON values (arrays or
// objects). Incomplete trailing values are simply skipped until more chunks
// arrive \u2014 the final event always carries the complete outputs anyway.
function extractJsonValues(text: string): unknown[] {
  const values: unknown[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      if (depth > 0) inString = true;
      continue;
    }
    if (ch === '{' || ch === '[') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0 && start >= 0) {
        const raw = text.slice(start, i + 1);
        try {
          values.push(JSON.parse(raw));
        } catch {
          // incomplete or invalid fragment \u2014 ignore
        }
        start = -1;
      }
      if (depth < 0) depth = 0;
    }
  }
  return values;
}

// Bare result arrays streamed as chunks: alignment rows, composite candidates,
// dedup&volumenormalize rows. Shortlist fragments (with `reasoning`) are
// handled separately by processChunkBuffer.
function collectArraySignals(arr: unknown[], out: ExtractedData): void {
  if (arr.length === 0) return;
  const first = asRecord(arr[0]);
  if (typeof first.keyword !== 'string') return;
  if ('reasoning' in first || 'rationale' in first) return;
  if ('alignment' in first) {
    const rows = coerceAlignment(arr);
    if (rows.length > 0) out.alignment = rows;
    return;
  }
  if ('compositeScore' in first) {
    const rows = coerceSourceKeywords(arr);
    if (rows.length > 0) out.sourceKeywords = rows;
    const composite = coerceComposite(arr);
    if (composite.length > 0) out.composite = composite;
    return;
  }
  if ('urlFrequency' in first || 'position' in first || 'cpc' in first) {
    const composite = coerceComposite(arr);
    if (composite.length > 0) out.composite = composite;
    return;
  }
  const rows = coerceNormalized(arr);
  if (rows.length > 0) out.normalized = rows;
}

// Recursively walk any upstream value (streamed chunk JSON, the final event
// payload keyed by blockId, or nested `result` objects) and collect every
// pipeline signal we can recognize.
function extractSignals(value: unknown, out: ExtractedData, depth = 0): void {
  if (depth > 6) return;
  const v = parseMaybeJson(value);
  if (Array.isArray(v)) {
    const strings = v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
    if (strings.length > 0 && strings.length === v.length) {
      if (strings.every((s) => !/^https?:\/\//i.test(s))) {
        out.variants = strings;
      }
      return;
    }
    collectArraySignals(v, out);
    return;
  }
  if (typeof v !== 'object' || v === null) return;
  const rec = v as Record<string, unknown>;

  const aiShortlist: Shortlist = { primary: [], secondary: [] };
  const validationShortlist: Shortlist = { primary: [], secondary: [] };

  for (const [key, rawVal] of Object.entries(rec)) {
    const k = sanitizeKey(key);
    const val = parseMaybeJson(rawVal);

    if (k.includes('queryexpansion') || k === 'variants' || k.endsWith('variants')) {
      const arr = asArray(val).filter((x): x is string => typeof x === 'string' && x.length > 0);
      if (arr.length > 0) out.variants = arr;
      continue;
    }
    if (k.includes('serpfetch')) {
      const inner = asRecord(val);
      const organic = Array.isArray(val)
        ? val
        : (inner.organic ?? asRecord(inner.result).organic ?? inner.result);
      const rows = coerceSerpOrganic(organic);
      if (rows.length > 0) out.serpResults = rows;
      continue;
    }
    if (k.includes('urlscoring')) {
      const inner = asRecord(val);
      const selected = Array.isArray(val)
        ? val
        : (inner.selectedUrls ?? asRecord(inner.result).selectedUrls ?? inner.result);
      const rows = coerceSelectedUrls(selected);
      if (rows.length > 0) out.selectedUrls = rows;
      continue;
    }
    if (k.includes('aggregatesemrush')) {
      const inner = asRecord(val);
      const rows = Array.isArray(val) ? val : (inner.rows ?? asRecord(inner.result).rows ?? inner.result);
      const grouped = groupSemrushRows(rows);
      if (grouped.length > 0) out.semrushGroups = grouped;
      continue;
    }
    if (k.includes('dedup')) {
      const inner = asRecord(val);
      const rows = Array.isArray(val) ? val : (inner.rows ?? inner.result ?? val);
      const normalized = coerceNormalized(rows);
      if (normalized.length > 0) out.normalized = normalized;
      continue;
    }
    if (k.includes('compositescoring')) {
      const inner = asRecord(val);
      const rows = Array.isArray(val) ? val : (inner.result ?? val);
      const composite = coerceComposite(rows);
      if (composite.length > 0) out.composite = composite;
      const source = coerceSourceKeywords(rows);
      if (source.length > 0) out.sourceKeywords = source;
      continue;
    }
    if (k.includes('alignmentscoring')) {
      const inner = asRecord(val);
      const rows = Array.isArray(val) ? val : (inner.scores ?? inner.result ?? val);
      const scores = coerceAlignment(rows);
      if (scores.length > 0) out.alignment = scores;
      continue;
    }
    if (k.includes('aishortlisting') || k.includes('validationpass')) {
      const target = k.includes('validationpass') ? validationShortlist : aiShortlist;
      if (k.includes('warning')) {
        if (k.includes('type')) {
          if (typeof val === 'string' && val.trim().length > 0) out.warningType = val;
        } else if (k.includes('description')) {
          if (typeof val === 'string' && val.trim().length > 0) out.warning = val;
        } else {
          const w = asRecord(val);
          const desc =
            typeof w.description === 'string'
              ? w.description
              : typeof val === 'string' && val.trim().length > 0
                ? val
                : null;
          const type = typeof w.type === 'string' ? w.type : null;
          if (desc) out.warning = desc;
          if (type) out.warningType = type;
        }
        continue;
      }
      if (k.includes('primary')) {
        const rows = coercePrimary(val);
        if (rows.length > 0) target.primary = rows;
        continue;
      }
      if (k.includes('secondary')) {
        const rows = coerceSecondary(val);
        if (rows.length > 0) target.secondary = rows;
        continue;
      }
      const inner = asRecord(val);
      const p = coercePrimary(inner.primary);
      const s = coerceSecondary(inner.secondary);
      if (p.length > 0) target.primary = p;
      if (s.length > 0) target.secondary = s;
      continue;
    }
    if (typeof val === 'object' && val !== null) {
      extractSignals(val, out, depth + 1);
    }
  }

  if (aiShortlist.primary.length > 0 || aiShortlist.secondary.length > 0) {
    out.shortlists = [...(out.shortlists ?? []), aiShortlist];
  }
  if (validationShortlist.primary.length > 0 || validationShortlist.secondary.length > 0) {
    out.shortlists = [...(out.shortlists ?? []), validationShortlist];
  }
}

// Streamed chunk text can carry bare JSON fragments. Shortlist fragments
// (entries with `reasoning`) become shortlist candidates; other recognizable
// arrays go through collectArraySignals; objects go through extractSignals.
function processChunkBuffer(buffer: string, out: ExtractedData): void {
  const values = extractJsonValues(buffer);
  for (const value of values) {
    if (Array.isArray(value)) {
      const first = asRecord(value[0]);
      if (typeof first.keyword === 'string' && ('reasoning' in first || 'rationale' in first)) {
        const primary = coercePrimary(value);
        if (primary.length > 0) {
          out.shortlists = [...(out.shortlists ?? []), { primary, secondary: [] }];
        }
        continue;
      }
      collectArraySignals(value, out);
      continue;
    }
    if (typeof value === 'object' && value !== null) {
      extractSignals(value, out);
    }
  }
}

function applyExtracted(prev: CollectedData, e: ExtractedData): CollectedData {
  const next: CollectedData = { ...prev };
  if (e.variants && e.variants.length > 0) next.variants = e.variants;
  if (e.serpResults && e.serpResults.length > 0) next.serpResults = e.serpResults;
  if (e.selectedUrls && e.selectedUrls.length > 0) {
    next.selectedUrls = e.selectedUrls;
    next.mergedUrls = mergeUrlLists(next.mergedUrls, e.selectedUrls);
  }
  if (e.semrushGroups && e.semrushGroups.length > 0) {
    const base = next.mergedUrls.length > 0 ? next.mergedUrls : next.selectedUrls;
    next.mergedUrls = mergeUrlLists(base, e.semrushGroups);
  }
  if (e.normalized && e.normalized.length > 0) next.normalizedKeywords = e.normalized;
  if (e.composite && e.composite.length > 0) next.compositeCandidates = e.composite;
  if (e.alignment && e.alignment.length > 0) next.alignmentScores = e.alignment;
  if (e.sourceKeywords && e.sourceKeywords.length > 0) next.allKeywords = e.sourceKeywords;
  if (e.shortlists && e.shortlists.length > 0) next.shortlists = [...next.shortlists, ...e.shortlists];
  if (e.warning) next.warning = e.warning;
  if (e.warningType) next.warningType = e.warningType;
  return next;
}

function computeStages(c: CollectedData, final: boolean): Record<Stage, StageStatus> {
  if (final) return { ...ALL_DONE_STAGES };
  const done: Record<Stage, boolean> = {
    variants: c.variants.length > 0,
    search: c.serpResults.length > 0,
    url_scoring: c.selectedUrls.length > 0,
    semrush: c.mergedUrls.some((u) => (u.keywordsFound?.length ?? 0) > 0),
    analysis: c.alignmentScores.length > 0 || c.normalizedKeywords.length > 0,
    scoring: c.shortlists.length > 0 || c.compositeCandidates.length > 0,
    validation: false,
  };
  const stages: Record<Stage, StageStatus> = { ...INITIAL_STAGES };
  let activeSet = false;
  for (const stage of STAGE_ORDER) {
    if (done[stage]) {
      stages[stage] = 'done';
    } else if (!activeSet) {
      stages[stage] = 'active';
      activeSet = true;
    }
  }
  return stages;
}

async function saveRun(
  runInputs: RunInputs,
  finalResult: ResultPayload,
  data: CollectedData
): Promise<void> {
  const output: SavedRunOutput = {
    primary: finalResult.primary,
    secondary: finalResult.secondary,
    warning: finalResult.warning ?? null,
    warningType: finalResult.warningType ?? null,
    allKeywords: data.allKeywords,
    variants: data.variants,
    urls: data.mergedUrls.length > 0 ? data.mergedUrls : data.selectedUrls,
    serpResults: data.serpResults,
    normalizedKeywords: data.normalizedKeywords,
    compositeCandidates: data.compositeCandidates,
    alignmentScores: data.alignmentScores,
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
  } catch {
    // saving is best-effort \u2014 the run already rendered in the UI
  }
}

export default function KeywordResearchClient() {
  const [status, setStatus] = useState<RunStatus>('idle');
  const [stages, setStages] = useState<Record<Stage, StageStatus>>(INITIAL_STAGES);
  const [inputs, setInputs] = useState<RunInputs | null>(null);
  const [collected, setCollected] = useState<CollectedData>(emptyCollected());
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  async function startRun(runInputs: RunInputs): Promise<void> {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setInputs(runInputs);
    setResult(null);
    setError(null);
    setCollected(emptyCollected());
    setStages({ ...INITIAL_STAGES, variants: 'active' });
    setStatus('initializing');

    try {
      const initRes = await fetch('/api/keyword-research/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(runInputs),
        signal: controller.signal,
      });
      if (!initRes.ok) {
        const text = await initRes.text().catch(() => '');
        throw new Error(text || 'Could not start the research run.');
      }
      const initData = (await initRes.json()) as { token?: string };
      if (!initData.token) throw new Error('The server did not issue a stream token.');

      setStatus('streaming');
      const streamRes = await fetch(`/api/keyword-research/stream/${initData.token}`, {
        signal: controller.signal,
      });
      if (!streamRes.ok || !streamRes.body) {
        const text = await streamRes.text().catch(() => '');
        throw new Error(text || 'The research stream could not be opened.');
      }

      const reader = streamRes.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';
      let chunkText = '';
      let latest = emptyCollected();

      const applyEvent = (extracted: ExtractedData): void => {
        latest = applyExtracted(latest, extracted);
        setCollected(latest);
        setStages(computeStages(latest, false));
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop() ?? '';
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          let parsed: unknown;
          try {
            parsed = JSON.parse(payload);
          } catch {
            continue;
          }
          const rec = asRecord(parsed);
          const chunk =
            typeof rec.chunk === 'string'
              ? rec.chunk
              : typeof rec.content === 'string'
                ? rec.content
                : null;
          if (chunk !== null) {
            chunkText += chunk;
            const extracted: ExtractedData = {};
            processChunkBuffer(chunkText, extracted);
            applyEvent(extracted);
            continue;
          }
          const extracted: ExtractedData = {};
          extractSignals(rec.output ?? rec.outputs ?? rec, extracted);
          applyEvent(extracted);
        }
      }

      const shortlist =
        latest.shortlists.length > 0 ? latest.shortlists[latest.shortlists.length - 1] : null;
      if (!shortlist || (shortlist.primary.length === 0 && shortlist.secondary.length === 0)) {
        throw new Error('The pipeline finished without returning a keyword shortlist.');
      }

      const finalResult: ResultPayload = {
        primary: shortlist.primary,
        secondary: shortlist.secondary,
        warning: latest.warning,
        warningType: latest.warningType,
      };
      setCollected(latest);
      setResult(finalResult);
      setStages({ ...ALL_DONE_STAGES });
      setStatus('complete');
      void saveRun(runInputs, finalResult, latest);
    } catch (err) {
      if (controller.signal.aborted) return;
      setStatus('failed');
      setError(
        err instanceof Error && err.message ? err.message : 'The research run failed unexpectedly.'
      );
    }
  }

  function handleRetry(): void {
    if (inputs) void startRun(inputs);
  }

  const loading = status === 'initializing' || status === 'streaming';

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Keyword Research Agent</h1>
          <p className="mt-1 text-sm text-slate-500">
            Expand a seed keyword into a validated, competitor-backed shortlist \u2014 streamed live as
            the pipeline runs.
          </p>
        </div>
        <SemrushBalanceWidget />
      </header>

      <ResearchForm onSubmit={(runInputs) => void startRun(runInputs)} loading={loading} />

      {status === 'failed' && error && <ErrorCard message={error} onRetry={handleRetry} />}

      {(loading || status === 'complete') && (
        <ProgressTracker stages={stages} variants={collected.variants} />
      )}

      {status === 'complete' && result && inputs && (
        <ResultsSection
          result={result}
          inputs={inputs}
          allKeywords={collected.allKeywords}
          variants={collected.variants}
          competitorUrls={collected.mergedUrls.length > 0 ? collected.mergedUrls : collected.selectedUrls}
          serpResults={collected.serpResults}
          normalizedKeywords={collected.normalizedKeywords}
          compositeCandidates={collected.compositeCandidates}
          alignmentScores={collected.alignmentScores}
          onResultChange={(next) => setResult(next)}
        />
      )}

      {status !== 'idle' && status !== 'failed' && (
        <>
          <QueryVariantsPanel variants={collected.variants} />
          <SerpResultsPanel results={collected.serpResults} />
          <CompetitorUrlsPanel urls={collected.selectedUrls} />
          <SemrushKeywordsPanel
            urls={collected.mergedUrls.length > 0 ? collected.mergedUrls : collected.selectedUrls}
          />
          <DedupKeywordsPanel keywords={collected.normalizedKeywords} />
          <CompositeScoringPanel candidates={collected.compositeCandidates} />
          <AlignmentScoresPanel scores={collected.alignmentScores} />
          <SourceKeywordsPanel keywords={collected.allKeywords} />
        </>
      )}
    </main>
  );
}
