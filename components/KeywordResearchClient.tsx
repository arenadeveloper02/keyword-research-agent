"use client"

import { useEffect, useMemo, useRef, useState } from 'react';
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

interface ShortlistBlock {
  blockId: string;
  shortlist: Shortlist;
}

interface CollectedData {
  variants: string[];
  serpResults: SerpResult[];
  selectedUrls: CompetitorUrl[];
  semrushGroups: CompetitorUrl[];
  normalizedKeywords: NormalizedKeyword[];
  compositeCandidates: CompositeCandidate[];
  alignmentScores: ScoredKeyword[];
  allKeywords: SourceKeyword[];
  shortlistBlocks: ShortlistBlock[];
  warning: string | null;
  warningType: string | null;
}

function emptyCollected(): CollectedData {
  return {
    variants: [],
    serpResults: [],
    selectedUrls: [],
    semrushGroups: [],
    normalizedKeywords: [],
    compositeCandidates: [],
    alignmentScores: [],
    allKeywords: [],
    shortlistBlocks: [],
    warning: null,
    warningType: null,
  };
}

interface ExtractedData {
  variants?: string[];
  serpResults?: SerpResult[];
  selectedUrls?: CompetitorUrl[];
  semrushGroups?: CompetitorUrl[];
  normalized?: NormalizedKeyword[];
  composite?: CompositeCandidate[];
  sourceKeywords?: SourceKeyword[];
  alignment?: ScoredKeyword[];
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
// arrive -- the final event always carries the complete outputs anyway.
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
          // incomplete or invalid fragment -- ignore
        }
        start = -1;
      }
      if (depth < 0) depth = 0;
    }
  }
  return values;
}

// Bare keyword arrays: alignment rows, composite candidates, dedup rows.
// Shortlist fragments (with `reasoning`) are handled separately.
function collectArraySignals(arr: unknown[], out: ExtractedData): void {
  if (arr.length === 0) return;
  const first = asRecord(arr[0]);
  if (typeof first.keyword !== 'string') return;
  if ('reasoning' in first || 'rationale' in first) return;
  if ('alignment' in first) {
    if (!(out.alignment && out.alignment.length > 0)) {
      const rows = coerceAlignment(arr);
      if (rows.length > 0) out.alignment = rows;
    }
    return;
  }
  if ('compositeScore' in first) {
    if (!(out.sourceKeywords && out.sourceKeywords.length > 0)) {
      const rows = coerceSourceKeywords(arr);
      if (rows.length > 0) out.sourceKeywords = rows;
    }
    if (!(out.composite && out.composite.length > 0)) {
      const composite = coerceComposite(arr);
      if (composite.length > 0) out.composite = composite;
    }
    return;
  }
  // dedup&volumenormalize candidates: urlFrequency / volumeScore / position / cpc
  if (!(out.normalized && out.normalized.length > 0)) {
    const rows = coerceNormalized(arr);
    if (rows.length > 0) out.normalized = rows;
  }
}

// Classify any array found in the payload by element shape and key hint.
function classifyArray(arr: unknown[], out: ExtractedData, keyHint: string): void {
  if (arr.length === 0) return;
  const strings = arr.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
  if (strings.length === arr.length) {
    if (
      (keyHint.includes('queries') || keyHint.includes('variants')) &&
      !(out.variants && out.variants.length > 0)
    ) {
      out.variants = strings;
    }
    return;
  }
  const first = asRecord(arr[0]);
  // SEMrush rows -> group by source URL for the "keywords by page" panel.
  if (typeof first.Keyword === 'string' || typeof first._sourceUrl === 'string') {
    if (!(out.semrushGroups && out.semrushGroups.length > 0)) {
      const groups = groupSemrushRows(arr);
      if (groups.length > 0) out.semrushGroups = groups;
    }
    return;
  }
  // SERP organic entries carry `link`.
  if (typeof first.link === 'string') {
    if (!(out.serpResults && out.serpResults.length > 0)) {
      const rows = coerceSerpOrganic(arr);
      if (rows.length > 0) out.serpResults = rows;
    }
    return;
  }
  // Scored / selected competitor URLs.
  if (typeof first.url === 'string') {
    if ('score' in first || 'scoreBreakdown' in first || keyHint.includes('selectedurls')) {
      if (!(out.selectedUrls && out.selectedUrls.length > 0)) {
        const urls = coerceSelectedUrls(arr);
        if (urls.length > 0) out.selectedUrls = urls;
      }
    }
    return;
  }
  if (typeof first.keyword !== 'string') return;
  if ('alignment' in first || keyHint.includes('scores')) {
    if (!(out.alignment && out.alignment.length > 0)) {
      const rows = coerceAlignment(arr);
      if (rows.length > 0) out.alignment = rows;
    }
    return;
  }
  collectArraySignals(arr, out);
}

// Recursively walk any upstream value (streamed chunk JSON, the final event
// payload keyed by blockId, or nested `result` objects) and collect every
// pipeline signal we can recognize.
function extractSignals(value: unknown, out: ExtractedData, depth = 0): void {
  if (depth > 6) return;
  const v = parseMaybeJson(value);
  if (Array.isArray(v)) {
    classifyArray(v, out, '');
    return;
  }
  if (typeof v !== 'object' || v === null) return;
  const rec = v as Record<string, unknown>;
  for (const [rawKey, raw] of Object.entries(rec)) {
    const key = sanitizeKey(rawKey);
    const val = parseMaybeJson(raw);
    if (Array.isArray(val)) {
      classifyArray(val, out, key);
      continue;
    }
    if (typeof val === 'object' && val !== null) {
      extractSignals(val, out, depth + 1);
    }
  }
}

// Extract the { primary, secondary } shortlist from a block value (final event).
function extractShortlist(value: unknown): Shortlist | null {
  const rec = asRecord(parseMaybeJson(value));
  const primary = coercePrimary(parseMaybeJson(rec.primary));
  const secondary = coerceSecondary(parseMaybeJson(rec.secondary));
  if (primary.length === 0 && secondary.length === 0) return null;
  return { primary, secondary };
}

// Find validation warning type / description anywhere in the payload. Also
// tolerates the raw pass-through block whose `data` string is not valid JSON
// (e.g. `"warning": Removed duplicate ...` without quotes).
function scanWarning(value: unknown, out: ExtractedData, depth = 0): void {
  if (depth > 6 || value === null || value === undefined) return;
  if (typeof value === 'string') {
    const parsed = parseMaybeJson(value);
    if (typeof parsed !== 'string') {
      scanWarning(parsed, out, depth + 1);
      return;
    }
    if (!out.warning && value.includes('"warning"')) {
      const m = value.match(/"warning"\s*:\s*"?([^"}\n]+)"?/);
      if (m && m[1]) {
        const text = m[1].trim();
        if (text && text.toLowerCase() !== 'null') out.warning = text;
      }
    }
    return;
  }
  if (Array.isArray(value) || typeof value !== 'object') return;
  const rec = value as Record<string, unknown>;
  for (const [rawKey, v] of Object.entries(rec)) {
    const key = sanitizeKey(rawKey);
    if (key.includes('warning')) {
      if (typeof v === 'string' && v.trim().length > 0) {
        if (key.includes('type')) {
          if (!out.warningType) out.warningType = v.trim();
        } else if (!out.warning) {
          out.warning = v.trim();
        }
      } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        const w = v as Record<string, unknown>;
        if (!out.warningType && typeof w.type === 'string' && w.type.trim().length > 0) {
          out.warningType = w.type.trim();
        }
        const desc =
          typeof w.description === 'string'
            ? w.description
            : typeof w.message === 'string'
              ? w.message
              : '';
        if (!out.warning && desc.trim().length > 0) out.warning = desc.trim();
      }
    } else if (typeof v === 'object' && v !== null) {
      scanWarning(v, out, depth + 1);
    } else if (typeof v === 'string' && v.includes('warning')) {
      scanWarning(v, out, depth + 1);
    }
  }
}

export default function KeywordResearchClient() {
  const [status, setStatus] = useState<RunStatus>('idle');
  const [inputs, setInputs] = useState<RunInputs | null>(null);
  const [collected, setCollected] = useState<CollectedData>(emptyCollected());
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const chunkBuffersRef = useRef<Map<string, string>>(new Map());
  const collectedRef = useRef<CollectedData>(emptyCollected());
  const savedRef = useRef(false);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const running = status === 'initializing' || status === 'streaming';

  function commitCollected(next: CollectedData): void {
    collectedRef.current = next;
    setCollected(next);
  }

  function mergeIntoCollected(prev: CollectedData, ex: ExtractedData): CollectedData {
    return {
      variants: ex.variants && ex.variants.length > 0 ? ex.variants : prev.variants,
      serpResults: ex.serpResults && ex.serpResults.length > 0 ? ex.serpResults : prev.serpResults,
      selectedUrls:
        ex.selectedUrls && ex.selectedUrls.length > 0 ? ex.selectedUrls : prev.selectedUrls,
      semrushGroups:
        ex.semrushGroups && ex.semrushGroups.length > 0 ? ex.semrushGroups : prev.semrushGroups,
      normalizedKeywords:
        ex.normalized && ex.normalized.length > 0 ? ex.normalized : prev.normalizedKeywords,
      compositeCandidates:
        ex.composite && ex.composite.length > 0 ? ex.composite : prev.compositeCandidates,
      alignmentScores:
        ex.alignment && ex.alignment.length > 0 ? ex.alignment : prev.alignmentScores,
      allKeywords:
        ex.sourceKeywords && ex.sourceKeywords.length > 0 ? ex.sourceKeywords : prev.allKeywords,
      shortlistBlocks: prev.shortlistBlocks,
      warning: prev.warning ?? ex.warning ?? null,
      warningType: prev.warningType ?? ex.warningType ?? null,
    };
  }

  function applyExtracted(ex: ExtractedData, shortlistBlock?: ShortlistBlock): void {
    const prev = collectedRef.current;
    const next = mergeIntoCollected(prev, ex);
    if (shortlistBlock) {
      const others = prev.shortlistBlocks.filter((b) => b.blockId !== shortlistBlock.blockId);
      next.shortlistBlocks = [...others, shortlistBlock];
    }
    commitCollected(next);
  }

  // Streaming chunks: the buffer for a block may contain several bare JSON
  // arrays (e.g. the shortlist stream emits the primary array followed by the
  // secondary array). Re-scan the whole buffer on every chunk.
  function handleChunk(blockId: string, chunk: string): void {
    const buffers = chunkBuffersRef.current;
    const buffer = (buffers.get(blockId) ?? '') + chunk;
    buffers.set(blockId, buffer);
    const values = extractJsonValues(buffer);
    const ex: ExtractedData = {};
    const reasoningArrays: unknown[][] = [];
    for (const v of values) {
      if (Array.isArray(v) && v.length > 0) {
        const first = asRecord(v[0]);
        if (typeof first.keyword === 'string' && ('reasoning' in first || 'rationale' in first)) {
          reasoningArrays.push(v);
          continue;
        }
      }
      extractSignals(v, ex);
      scanWarning(v, ex);
    }
    let shortlistBlock: ShortlistBlock | undefined;
    if (reasoningArrays.length > 0) {
      const primary = coercePrimary(reasoningArrays[0]);
      const secondary = reasoningArrays.length > 1 ? coerceSecondary(reasoningArrays[1]) : [];
      if (primary.length > 0 || secondary.length > 0) {
        shortlistBlock = { blockId, shortlist: { primary, secondary } };
      }
    }
    applyExtracted(ex, shortlistBlock);
  }

  function finishRun(data: CollectedData): void {
    const blocks = data.shortlistBlocks;
    const last = blocks.length > 0 ? blocks[blocks.length - 1].shortlist : null;
    if (!last || (last.primary.length === 0 && last.secondary.length === 0)) {
      setError('The pipeline finished without a keyword shortlist. Please try again.');
      setStatus('failed');
      return;
    }
    setResult({
      primary: last.primary,
      secondary: last.secondary,
      warning: data.warning,
      warningType: data.warningType,
    });
    setStatus('complete');
  }

  // Final event: `data.output` is keyed by blockId; each block value carries
  // result / primary / secondary / scores payloads for the 12 selected outputs.
  function handleFinalOutput(output: Record<string, unknown>): void {
    const ex: ExtractedData = {};
    const shortlists: ShortlistBlock[] = [];
    for (const [blockId, blockValue] of Object.entries(output)) {
      extractSignals(blockValue, ex);
      scanWarning(blockValue, ex);
      const shortlist = extractShortlist(blockValue);
      if (shortlist) shortlists.push({ blockId, shortlist });
    }
    const prev = collectedRef.current;
    const next = mergeIntoCollected(prev, ex);
    // Prefer warning info found in the final payload over anything streamed.
    if (ex.warning) next.warning = ex.warning;
    if (ex.warningType) next.warningType = ex.warningType;
    if (shortlists.length > 0) next.shortlistBlocks = shortlists;
    commitCollected(next);
    finishRun(next);
  }

  // Returns true when the event was the final one.
  function handleEvent(parsed: unknown): boolean {
    const rec = asRecord(parsed);
    const dataRec = asRecord(rec.data);
    if (rec.event === 'final' || dataRec.output !== undefined) {
      if (dataRec.success === false) {
        const msg =
          typeof dataRec.error === 'string' && dataRec.error
            ? dataRec.error
            : 'The pipeline reported a failure.';
        setError(msg);
        setStatus('failed');
        return true;
      }
      handleFinalOutput(asRecord(dataRec.output));
      return true;
    }
    const blockId = typeof rec.blockId === 'string' ? rec.blockId : '';
    const chunk = typeof rec.chunk === 'string' ? rec.chunk : '';
    if (blockId && chunk) handleChunk(blockId, chunk);
    return false;
  }

  async function runResearch(runInputs: RunInputs): Promise<void> {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    chunkBuffersRef.current = new Map();
    savedRef.current = false;
    collectedRef.current = emptyCollected();
    setCollected(collectedRef.current);
    setResult(null);
    setError(null);
    setInputs(runInputs);
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
      const initData = (await initRes.json()) as { token?: unknown };
      const token = typeof initData.token === 'string' ? initData.token : '';
      if (!token) throw new Error('Could not start the research run.');

      setStatus('streaming');
      const streamRes = await fetch(`/api/keyword-research/stream/${token}`, {
        signal: controller.signal,
      });
      if (!streamRes.ok || !streamRes.body) {
        const text = await streamRes.text().catch(() => '');
        throw new Error(text || 'The research stream could not be opened.');
      }

      const reader = streamRes.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';
      let sawFinal = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        let idx = sseBuffer.indexOf('\n');
        while (idx >= 0) {
          const line = sseBuffer.slice(0, idx).trim();
          sseBuffer = sseBuffer.slice(idx + 1);
          if (line.startsWith('data:')) {
            const payload = line.slice(5).trim();
            if (payload && payload !== '[DONE]') {
              try {
                const parsedEvent: unknown = JSON.parse(payload);
                if (handleEvent(parsedEvent)) sawFinal = true;
              } catch {
                // Skip non-JSON SSE lines.
              }
            }
          }
          idx = sseBuffer.indexOf('\n');
        }
      }
      if (!sawFinal) {
        // The stream ended without an explicit final event: finish with what we
        // collected from the chunks.
        finishRun(collectedRef.current);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      const message =
        err instanceof Error && err.message ? err.message : 'The research run failed unexpectedly.';
      setError(message);
      setStatus('failed');
    }
  }

  // Persist completed runs so the History tab can restore every pipeline section.
  useEffect(() => {
    if (status !== 'complete' || !result || !inputs || savedRef.current) return;
    savedRef.current = true;
    const data = collectedRef.current;
    const output: SavedRunOutput = {
      primary: result.primary,
      secondary: result.secondary,
      warning: result.warning ?? null,
      warningType: result.warningType ?? null,
      allKeywords: data.allKeywords,
      variants: data.variants,
      urls: mergeUrlLists(data.selectedUrls, data.semrushGroups),
      serpResults: data.serpResults,
      normalizedKeywords: data.normalizedKeywords,
      compositeCandidates: data.compositeCandidates,
      alignmentScores: data.alignmentScores,
    };
    void fetch('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: 'keyword-research',
        label: inputs.keyword,
        status: 'completed',
        inputs,
        output,
      }),
    }).catch(() => undefined);
  }, [status, result, inputs]);

  const stages = useMemo<Record<Stage, StageStatus>>(() => {
    if (status === 'complete') return ALL_DONE_STAGES;
    if (status === 'idle') return INITIAL_STAGES;
    const doneMap: Record<Stage, boolean> = {
      variants: collected.variants.length > 0,
      search: collected.serpResults.length > 0,
      url_scoring: collected.selectedUrls.length > 0,
      semrush: collected.semrushGroups.length > 0,
      analysis: collected.normalizedKeywords.length > 0 || collected.alignmentScores.length > 0,
      scoring: collected.compositeCandidates.length > 0 || collected.shortlistBlocks.length > 0,
      validation: false,
    };
    const out = {} as Record<Stage, StageStatus>;
    let activeAssigned = false;
    for (const stage of STAGE_ORDER) {
      if (doneMap[stage]) {
        out[stage] = 'done';
      } else if (!activeAssigned) {
        out[stage] = 'active';
        activeAssigned = true;
      } else {
        out[stage] = 'pending';
      }
    }
    return out;
  }, [status, collected]);

  const mergedUrls = useMemo(
    () => mergeUrlLists(collected.selectedUrls, collected.semrushGroups),
    [collected]
  );

  const primaryCandidates = useMemo(() => {
    const lens = collected.shortlistBlocks.map((b) => b.shortlist.primary.length);
    return lens.length > 0 ? Math.max(...lens) : null;
  }, [collected]);

  const secondaryCandidates = useMemo(() => {
    const lens = collected.shortlistBlocks.map((b) => b.shortlist.secondary.length);
    return lens.length > 0 ? Math.max(...lens) : null;
  }, [collected]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Keyword Research</h1>
          <p className="mt-1 text-sm text-slate-500">
            Expand a seed keyword into a validated, competitor-backed shortlist streamed live from
            the research pipeline.
          </p>
        </div>
        <SemrushBalanceWidget />
      </header>

      <ResearchForm onSubmit={(i) => void runResearch(i)} loading={running} />

      {status !== 'idle' && status !== 'failed' && (
        <ProgressTracker stages={stages} variants={collected.variants} />
      )}

      {status === 'failed' && error && (
        <ErrorCard
          message={error}
          onRetry={() => {
            if (inputs) void runResearch(inputs);
          }}
        />
      )}

      {status === 'complete' && result && inputs && (
        <ResultsSection
          result={result}
          inputs={inputs}
          allKeywords={collected.allKeywords}
          variants={collected.variants}
          competitorUrls={mergedUrls}
          serpResults={collected.serpResults}
          normalizedKeywords={collected.normalizedKeywords}
          compositeCandidates={collected.compositeCandidates}
          alignmentScores={collected.alignmentScores}
          primaryCandidates={primaryCandidates}
          secondaryCandidates={secondaryCandidates}
          onResultChange={(r) => setResult(r)}
        />
      )}

      {status === 'complete' && collected.variants.length > 0 && (
        <QueryVariantsPanel variants={collected.variants} />
      )}
      {collected.serpResults.length > 0 && <SerpResultsPanel results={collected.serpResults} />}
      {collected.selectedUrls.length > 0 && <CompetitorUrlsPanel urls={collected.selectedUrls} />}
      {mergedUrls.some((u) => (u.keywordsFound?.length ?? 0) > 0) && (
        <SemrushKeywordsPanel urls={mergedUrls} />
      )}
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
    </main>
  );
}
