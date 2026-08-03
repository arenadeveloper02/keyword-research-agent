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
// arrive — the final event always carries the complete outputs anyway.
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
          // incomplete or invalid fragment — ignore
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
        out.variants = strings.map((s) => s.trim());
      }
      return;
    }
    collectArraySignals(v, out);
    return;
  }
  if (typeof v !== 'object' || v === null) return;
  const rec = v as Record<string, unknown>;

  // Shortlist records: aishortlisting / validationpass blocks emit
  // { primary: [...], secondary: [...] } keyed by blockId in the final event.
  if (Array.isArray(rec.primary) || Array.isArray(rec.secondary)) {
    const primary = coercePrimary(rec.primary);
    const secondary = coerceSecondary(rec.secondary);
    if (primary.length + secondary.length > 0) {
      out.shortlists = [...(out.shortlists ?? []), { primary, secondary }];
    }
  }
  if (Array.isArray(rec.scores)) {
    const scores = coerceAlignment(rec.scores);
    if (scores.length > 0) out.alignment = scores;
  }
  if (Array.isArray(rec.variants)) {
    const variants = rec.variants
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      .map((s) => s.trim());
    if (variants.length > 0) out.variants = variants;
  }
  if (Array.isArray(rec.selectedUrls)) {
    const urls = coerceSelectedUrls(rec.selectedUrls);
    if (urls.length > 0) out.selectedUrls = urls;
  }
  if (Array.isArray(rec.organic)) {
    const serp = coerceSerpOrganic(rec.organic);
    if (serp.length > 0) out.serpResults = serp;
    const queries = new Set<string>();
    if (Array.isArray(rec.queries)) {
      for (const q of rec.queries) {
        if (typeof q === 'string' && q.trim().length > 0) queries.add(q.trim());
      }
    }
    for (const item of rec.organic) {
      const o = asRecord(item);
      if (typeof o.sourceQuery === 'string' && o.sourceQuery.trim().length > 0) {
        queries.add(o.sourceQuery.trim());
      }
    }
    if (queries.size > 0) out.searchQueries = Array.from(queries);
  }
  if (Array.isArray(rec.rows)) {
    const groups = groupSemrushRows(rec.rows);
    if (groups.length > 0) out.semrushGroups = groups;
  }
  if (Array.isArray(rec.candidates) && rec.candidates.length > 0) {
    const source = coerceSourceKeywords(rec.candidates);
    const scored = source.some((k) => k.compositeScore > 0);
    if (scored) {
      out.sourceKeywords = source;
      const composite = coerceComposite(rec.candidates);
      if (composite.length > 0) out.composite = composite;
    } else {
      if (!out.sourceKeywords && source.length > 0) out.sourceKeywords = source;
      const normalized = coerceNormalized(rec.candidates);
      if (normalized.length > 0 && !out.normalized) out.normalized = normalized;
    }
  }
  const w = parseMaybeJson(rec.warning);
  if (typeof w === 'string' && w.trim().length > 0) {
    out.warning = w.trim();
  } else {
    const wRec = asRecord(w);
    if (typeof wRec.description === 'string' && wRec.description.trim().length > 0) {
      out.warning = wRec.description.trim();
    }
    if (typeof wRec.type === 'string' && wRec.type.trim().length > 0) {
      out.warningType = wRec.type.trim();
    }
  }
  if (typeof rec.warningType === 'string' && rec.warningType.trim().length > 0) {
    out.warningType = rec.warningType.trim();
  }

  // Recurse into nested objects (final event: data -> output -> block -> result)
  // and into embedded JSON strings.
  for (const val of Object.values(rec)) {
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      extractSignals(val, out, depth + 1);
    } else if (typeof val === 'string') {
      const t = val.trim();
      if (t.startsWith('{') || t.startsWith('[')) extractSignals(t, out, depth + 1);
    }
  }
}

// Streamed chunk buffers can contain several JSON values back to back — e.g.
// the shortlisting block streams the primary array then the secondary array.
function processChunkBuffer(buffer: string, out: ExtractedData): void {
  const values = extractJsonValues(buffer);
  const shortlistFragments: unknown[][] = [];
  for (const v of values) {
    if (Array.isArray(v) && v.length > 0) {
      const first = asRecord(v[0]);
      if (
        typeof first.keyword === 'string' &&
        ('reasoning' in first || 'rationale' in first) &&
        !('alignment' in first)
      ) {
        shortlistFragments.push(v);
        continue;
      }
    }
    extractSignals(v, out);
  }
  if (shortlistFragments.length > 0) {
    const primary = coercePrimary(shortlistFragments[0]);
    const secondary = shortlistFragments.length > 1 ? coerceSecondary(shortlistFragments[1]) : [];
    if (primary.length + secondary.length > 0) {
      out.shortlists = [...(out.shortlists ?? []), { primary, secondary }];
    }
  }
}

function computeStages(c: CollectedData, finished: boolean): Record<Stage, StageStatus> {
  if (finished) return { ...ALL_DONE_STAGES };
  const flags: boolean[] = [
    c.variants.length > 0,
    c.serpResults.length > 0,
    c.selectedUrls.length > 0,
    c.mergedUrls.some((u) => (u.keywordsFound?.length ?? 0) > 0),
    c.alignmentScores.length > 0,
    c.compositeCandidates.length > 0 || c.allKeywords.some((k) => k.compositeScore > 0),
    c.shortlists.length > 0,
  ];
  const stages: Record<Stage, StageStatus> = { ...INITIAL_STAGES };
  STAGE_ORDER.forEach((stage, i) => {
    if (flags[i]) stages[stage] = 'done';
  });
  for (const stage of STAGE_ORDER) {
    if (stages[stage] !== 'done') {
      stages[stage] = 'active';
      break;
    }
  }
  return stages;
}

export default function KeywordResearchClient() {
  const [status, setStatus] = useState<RunStatus>('idle');
  const [stages, setStages] = useState<Record<Stage, StageStatus>>({ ...INITIAL_STAGES });
  const [collected, setCollected] = useState<CollectedData>(emptyCollected());
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [inputs, setInputs] = useState<RunInputs | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dataRef = useRef<CollectedData>(emptyCollected());
  const buffersRef = useRef<Map<string, string>>(new Map());
  const savedRef = useRef(false);
  const streamErrorRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  function fail(message: string): void {
    setError(message);
    setStatus('failed');
  }

  function applyExtracted(out: ExtractedData): void {
    const prev = dataRef.current;
    const next: CollectedData = { ...prev };
    if (out.variants && out.variants.length > 0) {
      next.variants = out.variants;
    } else if (out.searchQueries && out.searchQueries.length > 0 && next.variants.length === 0) {
      next.variants = out.searchQueries;
    }
    if (out.serpResults && out.serpResults.length > 0) next.serpResults = out.serpResults;
    if (out.selectedUrls && out.selectedUrls.length > 0) {
      next.selectedUrls = out.selectedUrls;
      next.mergedUrls = mergeUrlLists(out.selectedUrls, next.mergedUrls);
    }
    if (out.semrushGroups && out.semrushGroups.length > 0) {
      next.mergedUrls = mergeUrlLists(
        next.selectedUrls.length > 0 ? next.selectedUrls : next.mergedUrls,
        out.semrushGroups
      );
    }
    if (out.normalized && out.normalized.length > 0) next.normalizedKeywords = out.normalized;
    if (out.composite && out.composite.length > 0) next.compositeCandidates = out.composite;
    if (out.alignment && out.alignment.length > 0) next.alignmentScores = out.alignment;
    if (out.sourceKeywords && out.sourceKeywords.length > 0) {
      const incomingScored = out.sourceKeywords.some((k) => k.compositeScore > 0);
      const existingScored = next.allKeywords.some((k) => k.compositeScore > 0);
      if (next.allKeywords.length === 0 || incomingScored || !existingScored) {
        next.allKeywords = out.sourceKeywords;
      }
    }
    if (out.shortlists && out.shortlists.length > 0) {
      next.shortlists = [...next.shortlists, ...out.shortlists];
    }
    if (out.warning) next.warning = out.warning;
    if (out.warningType) next.warningType = out.warningType;
    dataRef.current = next;
    setCollected(next);
    setStages(computeStages(next, false));
  }

  function handleSseLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return;
    const payload = trimmed.slice(5).trim();
    if (!payload) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return;
    }
    if (typeof parsed !== 'object' || parsed === null) return; // "[DONE]" sentinel
    const rec = asRecord(parsed);
    if (typeof rec.blockId === 'string' && typeof rec.chunk === 'string') {
      const buffer = (buffersRef.current.get(rec.blockId) ?? '') + rec.chunk;
      buffersRef.current.set(rec.blockId, buffer);
      const out: ExtractedData = {};
      processChunkBuffer(buffer, out);
      applyExtracted(out);
      return;
    }
    if (rec.event === 'error' || typeof rec.error === 'string') {
      const message =
        typeof rec.error === 'string'
          ? rec.error
          : typeof rec.message === 'string'
            ? rec.message
            : null;
      if (message && message.trim().length > 0) streamErrorRef.current = message.trim();
      return;
    }
    const out: ExtractedData = {};
    if (rec.event === 'final') {
      extractSignals(rec.data, out);
    } else {
      extractSignals(rec, out);
    }
    applyExtracted(out);
  }

  async function persistRun(
    runInputs: RunInputs,
    payload: ResultPayload,
    c: CollectedData
  ): Promise<void> {
    if (savedRef.current) return;
    savedRef.current = true;
    const output: SavedRunOutput = {
      primary: payload.primary,
      secondary: payload.secondary,
      warning: payload.warning ?? null,
      warningType: payload.warningType ?? null,
      allKeywords: c.allKeywords,
      variants: c.variants,
      urls: c.mergedUrls.length > 0 ? c.mergedUrls : c.selectedUrls,
      serpResults: c.serpResults,
      normalizedKeywords: c.normalizedKeywords,
      compositeCandidates: c.compositeCandidates,
      alignmentScores: c.alignmentScores,
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
      // best-effort persistence — never surface as a run failure
    }
  }

  function finishRun(runInputs: RunInputs): void {
    const c = dataRef.current;
    const withBoth = [...c.shortlists]
      .reverse()
      .find((s) => s.primary.length > 0 && s.secondary.length > 0);
    const fallback = c.shortlists.length > 0 ? c.shortlists[c.shortlists.length - 1] : null;
    const shortlist = withBoth ?? fallback;
    if (!shortlist || shortlist.primary.length + shortlist.secondary.length === 0) {
      fail(streamErrorRef.current ?? 'The pipeline finished without returning a keyword shortlist.');
      return;
    }
    const payload: ResultPayload = {
      primary: shortlist.primary,
      secondary: shortlist.secondary,
      warning: c.warning,
      warningType: c.warningType,
    };
    setResult(payload);
    setStages({ ...ALL_DONE_STAGES });
    setStatus('complete');
    void persistRun(runInputs, payload, c);
  }

  async function startRun(runInputs: RunInputs): Promise<void> {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setInputs(runInputs);
    setStatus('initializing');
    setError(null);
    setResult(null);
    dataRef.current = emptyCollected();
    setCollected(dataRef.current);
    setStages({ ...INITIAL_STAGES, variants: 'active' });
    buffersRef.current = new Map();
    savedRef.current = false;
    streamErrorRef.current = null;

    let token = '';
    try {
      const res = await fetch('/api/keyword-research/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(runInputs),
        signal: controller.signal,
      });
      const data = (await res.json()) as { token?: string; error?: string };
      if (!res.ok || typeof data.token !== 'string' || data.token.length === 0) {
        fail(data.error ?? 'Failed to start the research run.');
        return;
      }
      token = data.token;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      fail('Failed to start the research run.');
      return;
    }

    setStatus('streaming');
    try {
      const res = await fetch(`/api/keyword-research/stream/${token}`, {
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '');
        fail(text.trim() || 'The research stream could not be opened.');
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop() ?? '';
        for (const line of lines) handleSseLine(line);
      }
      sseBuffer += decoder.decode();
      if (sseBuffer.trim().length > 0) {
        for (const line of sseBuffer.split('\n')) handleSseLine(line);
      }
      finishRun(runInputs);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      fail('The research stream was interrupted. Please retry.');
    }
  }

  const semrushUrls = collected.mergedUrls.filter((u) => (u.keywordsFound?.length ?? 0) > 0);
  const competitorUrls = collected.mergedUrls.length > 0 ? collected.mergedUrls : collected.selectedUrls;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Keyword Research</h1>
          <p className="mt-1 text-sm text-slate-600">
            Expand a seed keyword into a validated, competitor-backed shortlist.
          </p>
        </div>
        <SemrushBalanceWidget />
      </header>

      <ResearchForm
        onSubmit={(runInputs) => {
          void startRun(runInputs);
        }}
        loading={status === 'initializing' || status === 'streaming'}
      />

      {status === 'failed' && error && (
        <ErrorCard
          message={error}
          onRetry={() => {
            if (inputs) {
              void startRun(inputs);
            }
          }}
        />
      )}

      {(status === 'initializing' || status === 'streaming' || status === 'complete') && (
        <ProgressTracker stages={stages} variants={collected.variants} />
      )}

      {status !== 'idle' && status !== 'failed' && collected.variants.length > 0 && (
        <QueryVariantsPanel variants={collected.variants} />
      )}
      {collected.serpResults.length > 0 && <SerpResultsPanel results={collected.serpResults} />}
      {collected.selectedUrls.length > 0 && <CompetitorUrlsPanel urls={collected.selectedUrls} />}
      {semrushUrls.length > 0 && <SemrushKeywordsPanel urls={semrushUrls} />}
      {collected.normalizedKeywords.length > 0 && (
        <DedupKeywordsPanel keywords={collected.normalizedKeywords} />
      )}
      {collected.compositeCandidates.length > 0 && (
        <CompositeScoringPanel candidates={collected.compositeCandidates} />
      )}
      {collected.alignmentScores.length > 0 && (
        <AlignmentScoresPanel scores={collected.alignmentScores} />
      )}
      {collected.allKeywords.length > 0 && <SourceKeywordsPanel keywords={collected.allKeywords} />}

      {status === 'complete' && result && inputs && (
        <ResultsSection
          result={result}
          inputs={inputs}
          allKeywords={collected.allKeywords}
          variants={collected.variants}
          competitorUrls={competitorUrls}
          serpResults={collected.serpResults}
          normalizedKeywords={collected.normalizedKeywords}
          compositeCandidates={collected.compositeCandidates}
          alignmentScores={collected.alignmentScores}
          onResultChange={(next) => setResult(next)}
        />
      )}
    </main>
  );
}
