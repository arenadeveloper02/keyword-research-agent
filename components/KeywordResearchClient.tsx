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

// The verified API returns the final output keyed by opaque block UUIDs, so
// extraction is signature-based: each block is recognized by the fields it
// carries (primary/secondary, scores, data string, result.selectedUrls,
// result.organic/queries, result.rows, result.candidates).
function extractFromOutput(output: Record<string, unknown>): ExtractedData {
  const out: ExtractedData = {};
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

    if (typeof block.data === 'string' && block.data.trim().startsWith('{')) {
      const fromFinal = parseFinalResponseData(block.data);
      if (fromFinal.shortlist) out.shortlists = [...(out.shortlists ?? []), fromFinal.shortlist];
      if (fromFinal.warning && !out.warning) out.warning = fromFinal.warning;
    }

    const result = asRecord(parseMaybeJson(block.result));

    if (Array.isArray(result.selectedUrls)) {
      const urls = coerceSelectedUrls(result.selectedUrls);
      if (urls.length > 0) out.selectedUrls = urls;
    }

    if (Array.isArray(result.queries)) {
      const queries = result.queries.filter(
        (q): q is string => typeof q === 'string' && q.trim().length > 0
      );
      if (queries.length > 0) out.variants = queries;
    }

    if (Array.isArray(result.organic)) {
      const serp = coerceSerpOrganic(result.organic);
      if (serp.length > 0) out.serpResults = serp;
    }

    if (Array.isArray(result.rows)) {
      const groups = groupSemrushRows(result.rows);
      if (groups.length > 0) out.semrushGroups = groups;
    }

    if (Array.isArray(result.candidates)) {
      const arr = result.candidates;
      const isComposite = arr.some((item) => {
        const o = asRecord(item);
        return o.compositeScore !== undefined || o.alignmentScore !== undefined;
      });
      if (isComposite) {
        const composite = coerceComposite(arr);
        if (composite.length > 0) out.composite = composite;
        const source = coerceSourceKeywords(arr);
        if (source.length > 0) out.sourceKeywords = source;
      } else {
        const normalized = coerceNormalized(arr);
        if (normalized.length > 0) out.normalized = normalized;
        if (!out.sourceKeywords) {
          const source = coerceSourceKeywords(arr);
          if (source.length > 0) out.sourceKeywords = source;
        }
      }
    }
  }

  return out;
}

function pickBestShortlist(lists: Shortlist[]): Shortlist | null {
  let best: Shortlist | null = null;
  for (const s of lists) {
    const size = s.primary.length + s.secondary.length;
    const bestSize = best ? best.primary.length + best.secondary.length : -1;
    if (size >= bestSize) best = s;
  }
  return best && best.primary.length + best.secondary.length > 0 ? best : null;
}

function advanceStages(prev: Record<Stage, StageStatus>, stage: Stage): Record<Stage, StageStatus> {
  const idx = STAGE_ORDER.indexOf(stage);
  if (idx === -1) return prev;
  const next: Record<Stage, StageStatus> = { ...prev };
  STAGE_ORDER.forEach((s, i) => {
    if (i <= idx) next[s] = 'done';
    else if (i === idx + 1 && next[s] === 'pending') next[s] = 'active';
  });
  return next;
}

async function saveRun(inputs: RunInputs, result: ResultPayload, c: CollectedData): Promise<void> {
  const output: SavedRunOutput = {
    primary: result.primary,
    secondary: result.secondary,
    warning: result.warning ?? null,
    warningType: result.warningType ?? null,
    allKeywords: c.allKeywords,
    variants: c.variants,
    urls: c.mergedUrls,
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
        label: inputs.keyword,
        status: 'completed',
        inputs,
        output,
      }),
    });
  } catch {
    // Saving is best-effort — never break the UI over it.
  }
}

// The generator ALWAYS starts empty: no saved-run restore on mount. Data only
// appears after the user starts a run, and the whole component unmounts (and
// therefore clears) when the user switches tabs.
export default function KeywordResearchClient() {
  const [keyword, setKeyword] = useState('');
  const [intent, setIntent] = useState<Intent>('commercial');
  const [client, setClient] = useState('');

  const [status, setStatus] = useState<RunStatus>('idle');
  const [stages, setStages] = useState<Record<Stage, StageStatus>>({ ...INITIAL_STAGES });
  const [initError, setInitError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const [variants, setVariants] = useState<string[]>([]);
  const [serpResults, setSerpResults] = useState<SerpResult[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<CompetitorUrl[]>([]);
  const [mergedUrls, setMergedUrls] = useState<CompetitorUrl[]>([]);
  const [normalizedKeywords, setNormalizedKeywords] = useState<NormalizedKeyword[]>([]);
  const [compositeCandidates, setCompositeCandidates] = useState<CompositeCandidate[]>([]);
  const [alignmentScores, setAlignmentScores] = useState<ScoredKeyword[]>([]);
  const [allKeywords, setAllKeywords] = useState<SourceKeyword[]>([]);
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [runInputs, setRunInputs] = useState<RunInputs | null>(null);
  const [refreshSignal, setRefreshSignal] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const collectedRef = useRef<CollectedData>(emptyCollected());
  const finalizedRef = useRef(false);
  const runInputsRef = useRef<RunInputs | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  function resetRunData(): void {
    collectedRef.current = emptyCollected();
    finalizedRef.current = false;
    setVariants([]);
    setSerpResults([]);
    setSelectedUrls([]);
    setMergedUrls([]);
    setNormalizedKeywords([]);
    setCompositeCandidates([]);
    setAlignmentScores([]);
    setAllKeywords([]);
    setResult(null);
    setRunError(null);
    setStages({ ...INITIAL_STAGES });
  }

  const advance = (stage: Stage): void => setStages((prev) => advanceStages(prev, stage));

  function applyExtracted(d: ExtractedData): void {
    const c = collectedRef.current;
    const seed = runInputsRef.current?.keyword ?? '';

    if (d.variants) {
      const filtered = d.variants.filter(
        (v) => v.trim().toLowerCase() !== seed.trim().toLowerCase()
      );
      c.variants = filtered;
      setVariants(filtered);
      advance('variants');
    }
    if (d.serpResults && d.serpResults.length > 0) {
      c.serpResults = d.serpResults;
      setSerpResults(d.serpResults);
      advance('search');
    }
    if (d.selectedUrls && d.selectedUrls.length > 0) {
      c.selectedUrls = d.selectedUrls;
      c.mergedUrls = mergeUrlLists(c.mergedUrls, d.selectedUrls);
      setSelectedUrls(c.selectedUrls);
      setMergedUrls(c.mergedUrls);
      advance('url_scoring');
    }
    if (d.semrushGroups && d.semrushGroups.length > 0) {
      c.mergedUrls = mergeUrlLists(c.mergedUrls, d.semrushGroups);
      setMergedUrls(c.mergedUrls);
      advance('semrush');
    }
    if (d.normalized && d.normalized.length > 0) {
      c.normalizedKeywords = d.normalized;
      setNormalizedKeywords(d.normalized);
      advance('analysis');
    }
    if (d.composite && d.composite.length > 0) {
      c.compositeCandidates = d.composite;
      setCompositeCandidates(d.composite);
      advance('scoring');
    }
    if (d.alignment && d.alignment.length > 0) {
      c.alignmentScores = d.alignment;
      setAlignmentScores(d.alignment);
      advance('scoring');
    }
    if (d.sourceKeywords && d.sourceKeywords.length >= c.allKeywords.length) {
      c.allKeywords = d.sourceKeywords;
      setAllKeywords(d.sourceKeywords);
    }
    if (d.shortlists && d.shortlists.length > 0) {
      c.shortlists.push(...d.shortlists);
    }
    if (d.warning) c.warning = d.warning;
    if (d.warningType) c.warningType = d.warningType;
  }

  function finalizeRun(): void {
    if (finalizedRef.current) return;
    finalizedRef.current = true;
    const c = collectedRef.current;
    const best = pickBestShortlist(c.shortlists);
    if (!best) {
      setRunError('The pipeline finished without returning any keywords. Please try again.');
      setStatus('failed');
      return;
    }
    const payload: ResultPayload = {
      primary: best.primary,
      secondary: best.secondary,
      warning: c.warning,
      warningType: c.warningType,
    };
    setResult(payload);
    setStages({ ...ALL_DONE_STAGES });
    setStatus('complete');
    setRefreshSignal((n) => n + 1);
    const inputs = runInputsRef.current;
    if (inputs) void saveRun(inputs, payload, c);
  }

  function handleStreamEvent(parsed: unknown): void {
    const rec = asRecord(parsed);
    const evt = typeof rec.event === 'string' ? rec.event : '';
    const data = asRecord(rec.data);
    const output = asRecord(data.output ?? rec.output);
    if (Object.keys(output).length > 0) {
      applyExtracted(extractFromOutput(output));
    } else {
      applyExtracted(extractFromOutput(rec));
    }
    if (evt === 'final' || evt === 'done' || evt === 'complete') {
      finalizeRun();
    }
  }

  async function startRun(inputs: RunInputs): Promise<void> {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    resetRunData();
    runInputsRef.current = inputs;
    setRunInputs(inputs);
    setInitError(null);
    setStatus('initializing');

    try {
      const initRes = await fetch('/api/keyword-research/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: inputs.keyword,
          intent: inputs.intent,
          client: inputs.client ?? '',
        }),
        signal: controller.signal,
      });
      const initData = (await initRes.json().catch(() => ({}))) as { token?: string; error?: string };
      if (!initRes.ok || typeof initData.token !== 'string' || initData.token.length === 0) {
        setInitError(
          typeof initData.error === 'string' && initData.error
            ? initData.error
            : 'Could not start the research run. Please try again.'
        );
        setStatus('idle');
        return;
      }

      setStatus('streaming');
      setStages((prev) => ({ ...prev, variants: 'active' }));

      const res = await fetch(`/api/keyword-research/stream/${initData.token}`, {
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `The keyword research stream failed (${res.status}).`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const processLine = (rawLine: string): void => {
        const line = rawLine.trim();
        if (!line.startsWith('data:')) return;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') return;
        try {
          handleStreamEvent(JSON.parse(payload));
        } catch {
          // Skip non-JSON SSE lines.
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const l of lines) processLine(l);
      }
      if (buffer) processLine(buffer);

      if (!controller.signal.aborted && !finalizedRef.current) {
        finalizeRun();
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      const message =
        err instanceof Error && err.message ? err.message : 'The research run failed unexpectedly.';
      setRunError(message);
      setStatus('failed');
    }
  }

  function handleSubmit(): void {
    const trimmed = keyword.trim();
    if (!trimmed) return;
    void startRun({ keyword: trimmed, intent, client: client.trim() || undefined });
  }

  function handleRetry(): void {
    const inputs = runInputsRef.current;
    if (inputs) {
      void startRun(inputs);
    } else {
      setRunError(null);
      setStatus('idle');
    }
  }

  function handleCancel(): void {
    abortRef.current?.abort();
    setStatus('idle');
  }

  function handleReset(): void {
    abortRef.current?.abort();
    setKeyword('');
    setClient('');
    setIntent('commercial');
    setRunInputs(null);
    runInputsRef.current = null;
    setInitError(null);
    resetRunData();
    setStatus('idle');
  }

  const running = status === 'initializing' || status === 'streaming';
  const hasSemrushKeywords = mergedUrls.some((u) => (u.keywordsFound?.length ?? 0) > 0);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6">
      <header className="text-center">
        <h1 className="text-2xl font-bold text-slate-900">Keyword Research</h1>
        <p className="mt-1 text-sm text-slate-500">
          Expand a seed keyword into a validated, competitor-backed shortlist.
        </p>
      </header>

      <SemrushBalanceWidget refreshSignal={refreshSignal} />

      <ResearchForm
        keyword={keyword}
        intent={intent}
        client={client}
        running={running}
        initError={initError}
        onKeywordChange={setKeyword}
        onIntentChange={setIntent}
        onClientChange={setClient}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        onReset={handleReset}
      />

      {status !== 'idle' && <ProgressTracker stages={stages} variants={variants} />}

      {status === 'failed' && runError && <ErrorCard message={runError} onRetry={handleRetry} />}

      {variants.length > 0 && runInputs && (
        <QueryVariantsPanel
          seedKeyword={runInputs.keyword}
          intent={runInputs.intent}
          variants={variants}
          done={stages.variants === 'done'}
        />
      )}

      {serpResults.length > 0 && <SerpResultsPanel results={serpResults} />}

      {selectedUrls.length > 0 && (
        <CompetitorUrlsPanel urls={selectedUrls} done={stages.url_scoring === 'done'} candidateCount={null} />
      )}

      {hasSemrushKeywords && <SemrushKeywordsPanel urls={mergedUrls} done={stages.semrush === 'done'} />}

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
          competitorUrls={mergedUrls}
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
