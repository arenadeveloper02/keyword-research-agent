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

// The upstream now maps shortlist entries with `reasoning` — accept both
// `rationale` and `reasoning`.
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

// finalresponse.data is a JSON string, but the upstream sometimes emits an
// unquoted warning value (invalid JSON). Parse leniently: full JSON.parse
// first, then recover the warning text with a regex fallback — the shortlist
// still arrives from the validationpass block in that case.
function parseFinalResponseData(raw: string): { shortlist: Shortlist | null; warning: string | null } {
  try {
    const parsed = asRecord(JSON.parse(raw));
    const primary = coercePrimary(parsed.primary);
    const secondary = coerceSecondary(parsed.secondary);
    const warning =
      typeof parsed.warning === 'string' && parsed.warning.trim().length > 0
        ? parsed.warning.trim()
        : null;
    return {
      shortlist: primary.length + secondary.length > 0 ? { primary, secondary } : null,
      warning,
    };
  } catch {
    const match = raw.match(/"warning"\s*:\s*"?([^"\n}]+)"?/);
    const warning = match && match[1] ? match[1].trim().replace(/,\s*$/, '') : null;
    return { shortlist: null, warning: warning && warning.length > 0 ? warning : null };
  }
}

// Bare result arrays: dedup&volumenormalize.result is [{ keyword, volume }],
// compositescoring.result rows may carry position/cpc or urlFrequency/compositeScore.
function collectArraySignals(arr: unknown[], out: ExtractedData): void {
  if (arr.length === 0) return;
  const first = asRecord(arr[0]);
  if (typeof first.keyword !== 'string') return;
  if ('urlFrequency' in first || 'compositeScore' in first) {
    const rows = coerceSourceKeywords(arr);
    if (rows.length > 0) out.sourceKeywords = rows;
    return;
  }
  if ('position' in first || 'cpc' in first) {
    const rows = coerceComposite(arr);
    if (rows.length > 0) out.composite = rows;
    return;
  }
  const rows = coerceNormalized(arr);
  if (rows.length > 0) out.normalized = rows;
}

// Record-level signals: SERP organic + query variants, selected URLs,
// SEMrush rows, composite candidates.
function collectRecordSignals(rec: Record<string, unknown>, out: ExtractedData): void {
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
    if (queries.size > 0) out.variants = Array.from(queries);
  } else if (Array.isArray(rec.queries)) {
    const queries = rec.queries.filter(
      (q): q is string => typeof q === 'string' && q.trim().length > 0
    );
    if (queries.length > 0) out.variants = queries;
  }
  if (Array.isArray(rec.variants)) {
    const vs = rec.variants.filter(
      (q): q is string => typeof q === 'string' && q.trim().length > 0
    );
    if (vs.length > 0) out.variants = vs;
  }
  if (Array.isArray(rec.rows)) {
    const groups = groupSemrushRows(rec.rows);
    if (groups.length > 0) out.semrushGroups = groups;
  }
  if (Array.isArray(rec.candidates)) {
    const composite = coerceComposite(rec.candidates);
    if (composite.length > 0) out.composite = composite;
  }
}

// The verified API returns the final output keyed by opaque block UUIDs (or
// dotted output names like 'validationpass.primary'), so extraction is
// signature-based: each block is recognized by the fields it carries.
function extractFromOutput(output: Record<string, unknown>): ExtractedData {
  const out: ExtractedData = {};
  const primaryByPrefix = new Map<string, PrimaryKeyword[]>();
  const secondaryByPrefix = new Map<string, SecondaryKeyword[]>();

  // 1. Keyed pass — handles dotted output keys like 'validationpass.primary',
  // 'alignmentscoring.scores', 'dedup&volumenormalize.result'.
  for (const [key, rawValue] of Object.entries(output)) {
    const value = parseMaybeJson(rawValue);
    const k = key.toLowerCase();
    const parts = k.split('.');
    const prefix = parts[0] ?? k;
    const leaf = parts[parts.length - 1] ?? k;

    if (leaf === 'primary') {
      const rows = coercePrimary(value);
      if (rows.length > 0) primaryByPrefix.set(prefix, rows);
      continue;
    }
    if (leaf === 'secondary') {
      const rows = coerceSecondary(value);
      if (rows.length > 0) secondaryByPrefix.set(prefix, rows);
      continue;
    }
    if (k.includes('warning')) {
      if (typeof value === 'string' && value.trim().length > 0) {
        if (leaf === 'type') {
          out.warningType = value.trim();
        } else {
          out.warning = value.trim();
        }
      } else {
        const w = asRecord(value);
        if (typeof w.description === 'string' && w.description.trim().length > 0) {
          out.warning = w.description.trim();
        }
        if (typeof w.type === 'string' && w.type.trim().length > 0) {
          out.warningType = w.type.trim();
        }
      }
      continue;
    }
    if (Array.isArray(value)) {
      if (leaf === 'scores' || k.includes('alignment')) {
        const rows = coerceAlignment(value);
        if (rows.length > 0) out.alignment = rows;
      } else {
        collectArraySignals(value, out);
      }
    }
  }

  // Pair primary/secondary lists per source block; keep the validation pass
  // last so it wins as the final shortlist.
  const prefixes = Array.from(new Set([...primaryByPrefix.keys(), ...secondaryByPrefix.keys()]));
  prefixes.sort((a, b) => Number(a.includes('validation')) - Number(b.includes('validation')));
  for (const p of prefixes) {
    const primary = primaryByPrefix.get(p) ?? [];
    const secondary = secondaryByPrefix.get(p) ?? [];
    if (primary.length + secondary.length > 0) {
      out.shortlists = [...(out.shortlists ?? []), { primary, secondary }];
    }
  }

  // 2. Block pass — signature-based over the output itself and every nested
  // record value (handles opaque block-UUID keys and JSON-string payloads).
  const blocks: Record<string, unknown>[] = [output];
  for (const value of Object.values(output)) {
    const rec = asRecord(parseMaybeJson(value));
    if (Object.keys(rec).length > 0) blocks.push(rec);
  }

  for (const block of blocks) {
    if (Array.isArray(block.primary) || Array.isArray(block.secondary)) {
      const primary = coercePrimary(block.primary);
      const secondary = coerceSecondary(block.secondary);
      if (primary.length + secondary.length > 0) {
        out.shortlists = [...(out.shortlists ?? []), { primary, secondary }];
      }
    }

    if (Array.isArray(block.scores)) {
      const rows = coerceAlignment(block.scores);
      if (rows.length > 0) out.alignment = rows;
    }

    if (typeof block.warning === 'string' && block.warning.trim().length > 0) {
      out.warning = block.warning.trim();
    } else if (block.warning !== undefined) {
      const w = asRecord(parseMaybeJson(block.warning));
      if (typeof w.description === 'string' && w.description.trim().length > 0) {
        out.warning = w.description.trim();
      }
      if (typeof w.type === 'string' && w.type.trim().length > 0) {
        out.warningType = w.type.trim();
      }
    }
    if (typeof block.warningType === 'string' && block.warningType.trim().length > 0) {
      out.warningType = block.warningType.trim();
    }

    if (typeof block.data === 'string' && block.data.trim().startsWith('{')) {
      const fromFinal = parseFinalResponseData(block.data);
      if (fromFinal.shortlist) {
        out.shortlists = [...(out.shortlists ?? []), fromFinal.shortlist];
      }
      if (fromFinal.warning && !out.warning) out.warning = fromFinal.warning;
    }

    collectRecordSignals(block, out);
    const resultValue = parseMaybeJson(block.result);
    if (Array.isArray(resultValue)) {
      collectArraySignals(resultValue, out);
    } else {
      const resultRec = asRecord(resultValue);
      if (Object.keys(resultRec).length > 0) collectRecordSignals(resultRec, out);
    }
  }

  return out;
}

function applyExtracted(prev: CollectedData, ex: ExtractedData): CollectedData {
  const next: CollectedData = { ...prev };
  if (ex.variants && ex.variants.length > 0) next.variants = ex.variants;
  if (ex.serpResults && ex.serpResults.length > 0) next.serpResults = ex.serpResults;
  if (ex.selectedUrls && ex.selectedUrls.length > 0) {
    next.selectedUrls = ex.selectedUrls;
    next.mergedUrls = mergeUrlLists(ex.selectedUrls, next.mergedUrls);
  }
  if (ex.semrushGroups && ex.semrushGroups.length > 0) {
    const base = next.mergedUrls.length > 0 ? next.mergedUrls : next.selectedUrls;
    next.mergedUrls = mergeUrlLists(base, ex.semrushGroups);
  }
  if (ex.normalized && ex.normalized.length > 0) next.normalizedKeywords = ex.normalized;
  if (ex.composite && ex.composite.length > 0) next.compositeCandidates = ex.composite;
  if (ex.alignment && ex.alignment.length > 0) next.alignmentScores = ex.alignment;
  if (ex.sourceKeywords && ex.sourceKeywords.length > 0) next.allKeywords = ex.sourceKeywords;
  if (ex.shortlists && ex.shortlists.length > 0) {
    let shortlists = next.shortlists;
    for (const sl of ex.shortlists) {
      const sig = JSON.stringify(sl);
      if (!shortlists.some((s) => JSON.stringify(s) === sig)) {
        shortlists = [...shortlists, sl];
      }
    }
    next.shortlists = shortlists;
  }
  if (ex.warning) next.warning = ex.warning;
  if (ex.warningType) next.warningType = ex.warningType;
  return next;
}

function stagesUpTo(stage: Stage): Record<Stage, StageStatus> {
  const idx = STAGE_ORDER.indexOf(stage);
  const next: Record<Stage, StageStatus> = { ...INITIAL_STAGES };
  STAGE_ORDER.forEach((s, i) => {
    if (i <= idx) {
      next[s] = 'done';
    } else if (i === idx + 1) {
      next[s] = 'active';
    }
  });
  return next;
}

function computeStages(c: CollectedData): Record<Stage, StageStatus> {
  let reached: Stage | null = null;
  if (c.variants.length > 0) reached = 'variants';
  if (c.serpResults.length > 0) reached = 'search';
  if (c.selectedUrls.length > 0) reached = 'url_scoring';
  if (c.mergedUrls.some((u) => (u.keywordsFound?.length ?? 0) > 0)) reached = 'semrush';
  if (c.normalizedKeywords.length > 0 || c.compositeCandidates.length > 0) reached = 'analysis';
  if (c.alignmentScores.length > 0 || c.allKeywords.length > 0) reached = 'scoring';
  if (c.shortlists.length > 0) reached = 'validation';
  if (reached === null) return { ...INITIAL_STAGES, variants: 'active' };
  return stagesUpTo(reached);
}

// Persist the completed run (including SERP results and SEMrush keyword groups)
// so the History tab can render every pipeline section for past runs.
async function saveRun(inputs: RunInputs, output: SavedRunOutput): Promise<void> {
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
  } catch {
    // Best-effort — a failed history save must never break the run UI.
  }
}

export default function KeywordResearchClient() {
  const [keyword, setKeyword] = useState('');
  const [intent, setIntent] = useState<Intent>('commercial');
  const [client, setClient] = useState('');
  const [status, setStatus] = useState<RunStatus>('idle');
  const [stages, setStages] = useState<Record<Stage, StageStatus>>(INITIAL_STAGES);
  const [collected, setCollected] = useState<CollectedData>(emptyCollected());
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [inputs, setInputs] = useState<RunInputs>({ keyword: '', intent: 'commercial', client: '' });
  const [initError, setInitError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [balanceRefresh, setBalanceRefresh] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  async function startRun() {
    const trimmed = keyword.trim();
    if (trimmed.length === 0) return;
    abortRef.current?.abort();

    setInitError(null);
    setRunError(null);
    setResult(null);
    setCollected(emptyCollected());
    setStages({ ...INITIAL_STAGES, variants: 'active' });
    setStatus('initializing');

    const runInputs: RunInputs = { keyword: trimmed, intent, client: client.trim() };
    setInputs(runInputs);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const initRes = await fetch('/api/keyword-research/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(runInputs),
        signal: controller.signal,
      });
      if (!initRes.ok) {
        const text = await initRes.text().catch(() => '');
        throw new Error(text || 'Could not start the research run. Please try again.');
      }
      const initData = (await initRes.json()) as { token?: string };
      if (!initData.token) {
        throw new Error('The research pipeline did not return a stream token.');
      }

      setStatus('streaming');

      const streamRes = await fetch(`/api/keyword-research/stream/${initData.token}`, {
        signal: controller.signal,
      });
      if (!streamRes.ok || !streamRes.body) {
        const text = await streamRes.text().catch(() => '');
        throw new Error(text || `The research stream failed (${streamRes.status}).`);
      }

      const reader = streamRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let work = emptyCollected();

      const handlePayload = (payload: string): void => {
        if (!payload || payload === '[DONE]') return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(payload);
        } catch {
          return;
        }
        const rec = asRecord(parsed);
        const candidates: Record<string, unknown>[] = [rec];
        for (const key of ['output', 'data', 'result']) {
          const inner = asRecord(parseMaybeJson(rec[key]));
          if (Object.keys(inner).length > 0) candidates.push(inner);
        }
        for (const candidate of candidates) {
          const ex = extractFromOutput(candidate);
          work = applyExtracted(work, ex);
        }
        setCollected(work);
        setStages(computeStages(work));
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (line.startsWith('data:')) handlePayload(line.slice(5).trim());
        }
      }
      buffer += decoder.decode();
      for (const rawLine of buffer.split('\n')) {
        const line = rawLine.trim();
        if (line.startsWith('data:')) {
          handlePayload(line.slice(5).trim());
        } else if (line.startsWith('{')) {
          handlePayload(line);
        }
      }

      const finalShortlist =
        work.shortlists.length > 0 ? work.shortlists[work.shortlists.length - 1] : null;
      if (!finalShortlist) {
        throw new Error('The pipeline finished without returning a keyword shortlist.');
      }

      const finalResult: ResultPayload = {
        primary: finalShortlist.primary,
        secondary: finalShortlist.secondary,
        warning: work.warning,
        warningType: work.warningType,
      };

      setResult(finalResult);
      setCollected(work);
      setStages({ ...ALL_DONE_STAGES });
      setStatus('complete');
      setBalanceRefresh((n) => n + 1);

      // Save the full pipeline output — including SERP results and SEMrush
      // keyword groups — so the History view renders every section.
      const savedOutput: SavedRunOutput = {
        primary: finalResult.primary,
        secondary: finalResult.secondary,
        warning: finalResult.warning ?? null,
        warningType: finalResult.warningType ?? null,
        allKeywords: work.allKeywords,
        variants: work.variants,
        urls: work.mergedUrls.length > 0 ? work.mergedUrls : work.selectedUrls,
        serpResults: work.serpResults,
        normalizedKeywords: work.normalizedKeywords,
        compositeCandidates: work.compositeCandidates,
        alignmentScores: work.alignmentScores,
      };
      void saveRun(runInputs, savedOutput);
    } catch (err) {
      if (controller.signal.aborted) return;
      const message =
        err instanceof Error && err.message ? err.message : 'The research run failed unexpectedly.';
      setRunError(message);
      setStatus('failed');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus('idle');
    setStages(INITIAL_STAGES);
  }

  function handleReset() {
    abortRef.current?.abort();
    abortRef.current = null;
    setKeyword('');
    setClient('');
    setIntent('commercial');
    setStatus('idle');
    setStages(INITIAL_STAGES);
    setCollected(emptyCollected());
    setResult(null);
    setInitError(null);
    setRunError(null);
  }

  const running = status === 'initializing' || status === 'streaming';
  const showPipeline = status !== 'idle';
  const semrushUrls = collected.mergedUrls.filter((u) => (u.keywordsFound?.length ?? 0) > 0);
  const firstShortlist = collected.shortlists.length > 1 ? collected.shortlists[0] : null;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6">
      <header className="text-center">
        <h1 className="text-2xl font-bold text-slate-900">Keyword Research</h1>
        <p className="mx-auto mt-1 max-w-xl text-sm text-slate-500">
          Expand a seed keyword into a validated, competitor-backed shortlist — streamed live from the
          research pipeline.
        </p>
      </header>

      <SemrushBalanceWidget refreshSignal={balanceRefresh} />

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

      {showPipeline && <ProgressTracker stages={stages} variants={collected.variants} />}

      {showPipeline && collected.variants.length > 0 && (
        <QueryVariantsPanel
          seedKeyword={inputs.keyword}
          intent={inputs.intent}
          variants={collected.variants}
          done={stages.variants === 'done'}
        />
      )}

      {showPipeline && collected.serpResults.length > 0 && (
        <SerpResultsPanel results={collected.serpResults} />
      )}

      {showPipeline && collected.selectedUrls.length > 0 && (
        <CompetitorUrlsPanel
          urls={collected.selectedUrls}
          done={stages.url_scoring === 'done'}
          candidateCount={collected.serpResults.length > 0 ? collected.serpResults.length : null}
        />
      )}

      {showPipeline && semrushUrls.length > 0 && (
        <SemrushKeywordsPanel urls={semrushUrls} done={stages.semrush === 'done'} />
      )}

      {showPipeline && collected.normalizedKeywords.length > 0 && (
        <DedupKeywordsPanel keywords={collected.normalizedKeywords} />
      )}

      {showPipeline && collected.compositeCandidates.length > 0 && (
        <CompositeScoringPanel candidates={collected.compositeCandidates} />
      )}

      {showPipeline && collected.alignmentScores.length > 0 && (
        <AlignmentScoresPanel rows={collected.alignmentScores} />
      )}

      {showPipeline && collected.allKeywords.length > 0 && (
        <SourceKeywordsPanel keywords={collected.allKeywords} />
      )}

      {status === 'failed' && runError && (
        <ErrorCard
          message={runError}
          onRetry={() => {
            void startRun();
          }}
        />
      )}

      {status === 'complete' && result && (
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
          primaryCandidates={firstShortlist ? firstShortlist.primary.length : null}
          secondaryCandidates={firstShortlist ? firstShortlist.secondary.length : null}
          onResultChange={setResult}
        />
      )}
    </main>
  );
}
