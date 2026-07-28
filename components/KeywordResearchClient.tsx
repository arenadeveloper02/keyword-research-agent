"use client"

import { useEffect, useRef, useState } from 'react';
import type {
  CompetitorUrl,
  ExaResult,
  Intent,
  NormalizedKeyword,
  PrimaryKeyword,
  ResultPayload,
  RunInputs,
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
import ExaResearchPanel from '@/components/ExaResearchPanel';
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
      const keywords = Array.isArray(o.keywords) ? coerceSource(o.keywords) : undefined;
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

function coerceExa(v: unknown): ExaResult[] {
  return flattenToArray(v)
    .map((item) => {
      const o = asRecord(item);
      const url = typeof o.url === 'string' ? o.url : typeof o.link === 'string' ? o.link : '';
      const snippet =
        typeof o.snippet === 'string'
          ? o.snippet
          : typeof o.summary === 'string'
            ? o.summary
            : typeof o.text === 'string'
              ? o.text
              : null;
      return {
        title: typeof o.title === 'string' ? o.title : null,
        url,
        snippet,
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

function coerceSemrushGroups(v: unknown): CompetitorUrl[] {
  const arr = flattenToArray(v);
  if (arr.some((item) => Array.isArray(asRecord(item).keywords))) {
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

function looksLikeUrlRows(v: unknown): boolean {
  return flattenToArray(v).some((item) => {
    const o = asRecord(item);
    return typeof o.url === 'string' || typeof o.link === 'string';
  });
}

function looksLikeKeywordRows(v: unknown): boolean {
  return flattenToArray(v).some((item) => {
    const o = asRecord(item);
    return typeof o.keyword === 'string' || typeof o.entity === 'string';
  });
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
  const [normalizedKeywords, setNormalizedKeywords] = useState<NormalizedKeyword[]>([]);
  const [exaResults, setExaResults] = useState<ExaResult[]>([]);
  const [compositeScores, setCompositeScores] = useState<ScoredKeyword[]>([]);
  const [alignmentScores, setAlignmentScores] = useState<ScoredKeyword[]>([]);
  const [allKeywords, setAllKeywords] = useState<SourceKeyword[]>([]);
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [primaryCandidates, setPrimaryCandidates] = useState<number | null>(null);
  const [secondaryCandidates, setSecondaryCandidates] = useState<number | null>(null);
  const [failMessage, setFailMessage] = useState<string | null>(null);
  const [isRestored, setIsRestored] = useState(false);
  const [balanceRefresh, setBalanceRefresh] = useState(0);

  const esRef = useRef<EventSource | null>(null);
  const finishedRef = useRef(false);
  const startedRef = useRef(false);
  // Set once "[DONE]" or the embedded {event:"final"} marker arrives — a socket
  // close after this point is SUCCESS, never a connection error.
  const completionRef = useRef(false);
  const chunkBuffersRef = useRef<Map<string, string>>(new Map());
  const resultRef = useRef<ResultPayload | null>(null);
  const allKeywordsRef = useRef<SourceKeyword[]>([]);
  const variantsRef = useRef<string[]>([]);
  const urlsRef = useRef<CompetitorUrl[]>([]);
  const serpRef = useRef<SerpResult[]>([]);
  const exaRef = useRef<ExaResult[]>([]);
  const normalizedRef = useRef<NormalizedKeyword[]>([]);
  const compositeRef = useRef<ScoredKeyword[]>([]);
  const alignmentRef = useRef<ScoredKeyword[]>([]);
  const inputsRef = useRef<RunInputs | null>(null);

  useEffect(() => {
    return () => {
      if (esRef.current) esRef.current.close();
    };
  }, []);

  // Restore the last completed run on mount (static restore, no stream replay).
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
        const savedInputs = asRecord(run.inputs);
        const savedOutput = asRecord(run.output);
        const restoredKeyword = typeof savedInputs.keyword === 'string' ? savedInputs.keyword : '';
        if (!restoredKeyword) return;
        const primary = coercePrimary(savedOutput.primary);
        const secondary = coerceSecondary(savedOutput.secondary);
        if (primary.length === 0 && secondary.length === 0) return;
        if (cancelled || startedRef.current) return;
        const restoredIntent: Intent = savedInputs.intent === 'informational' ? 'informational' : 'commercial';
        const restoredClient = typeof savedInputs.client === 'string' ? savedInputs.client : '';
        const restoredResult: ResultPayload = {
          primary,
          secondary,
          warning: typeof savedOutput.warning === 'string' && savedOutput.warning ? savedOutput.warning : null,
          warningType:
            typeof savedOutput.warningType === 'string' && savedOutput.warningType ? savedOutput.warningType : null,
        };
        setKeyword(restoredKeyword);
        setIntent(restoredIntent);
        setClientName(restoredClient);
        inputsRef.current = { keyword: restoredKeyword, intent: restoredIntent, client: restoredClient || undefined };
        resultRef.current = restoredResult;
        setResult(restoredResult);

        const restoredSources = coerceSource(savedOutput.allKeywords);
        allKeywordsRef.current = restoredSources;
        setAllKeywords(restoredSources);

        const restoredVariants = extractStringArray(savedOutput.variants);
        variantsRef.current = restoredVariants;
        setVariants(restoredVariants);

        const restoredUrls = coerceUrls(savedOutput.urls);
        urlsRef.current = restoredUrls;
        setUrls(restoredUrls);

        const restoredSerp = coerceSerp(savedOutput.serpResults);
        serpRef.current = restoredSerp;
        setSerpResults(restoredSerp);

        const restoredExa = coerceExa(savedOutput.exaResults);
        exaRef.current = restoredExa;
        setExaResults(restoredExa);

        const restoredNormalized = coerceNormalized(savedOutput.normalizedKeywords);
        normalizedRef.current = restoredNormalized;
        setNormalizedKeywords(restoredNormalized);

        const restoredComposite = coerceScored(savedOutput.compositeScores);
        compositeRef.current = restoredComposite;
        setCompositeScores(restoredComposite);

        const restoredAlignment = coerceScored(savedOutput.alignmentScores);
        alignmentRef.current = restoredAlignment;
        setAlignmentScores(restoredAlignment);

        setIsRestored(true);
        setStatus('complete');
      } catch (err) {
        devWarn('Could not restore previous run', err);
      }
    }
    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  function postToParent(type: 'keyword-research:start' | 'keyword-research:finish', extra: Record<string, unknown>) {
    try {
      if (typeof window !== 'undefined' && window.parent !== window) {
        window.parent.postMessage({ type, tool: 'keyword-research', ...extra }, '*');
      }
    } catch (err) {
      devWarn('postMessage to parent failed', err);
    }
  }

  function closeStream() {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  }

  function resetRunState() {
    setStages(INITIAL_STAGES);
    setVariants([]);
    setSerpResults([]);
    setUrls([]);
    setNormalizedKeywords([]);
    setExaResults([]);
    setCompositeScores([]);
    setAlignmentScores([]);
    setAllKeywords([]);
    setResult(null);
    setPrimaryCandidates(null);
    setSecondaryCandidates(null);
    setFailMessage(null);
    setInitError(null);
    resultRef.current = null;
    allKeywordsRef.current = [];
    variantsRef.current = [];
    urlsRef.current = [];
    serpRef.current = [];
    exaRef.current = [];
    normalizedRef.current = [];
    compositeRef.current = [];
    alignmentRef.current = [];
    chunkBuffersRef.current = new Map();
  }

  async function persistRun(inputs: RunInputs) {
    const finalResult = resultRef.current;
    if (!finalResult) return;
    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'keyword-research',
          label: inputs.keyword,
          inputs,
          output: {
            primary: finalResult.primary,
            secondary: finalResult.secondary,
            warning: finalResult.warning ?? null,
            warningType: finalResult.warningType ?? null,
            allKeywords: allKeywordsRef.current,
            variants: variantsRef.current,
            urls: urlsRef.current,
            serpResults: serpRef.current,
            exaResults: exaRef.current,
            normalizedKeywords: normalizedRef.current,
            compositeScores: compositeRef.current,
            alignmentScores: alignmentRef.current,
          },
          status: 'completed',
        }),
      });
      if (!res.ok) devWarn('Failed to persist run', res.status);
    } catch (err) {
      devWarn('Failed to persist run', err);
    }
  }

  function finalizeSuccess(inputs: RunInputs) {
    completionRef.current = true;
    if (finishedRef.current) return;
    finishedRef.current = true;
    closeStream();
    setStages({ ...ALL_DONE_STAGES });
    setStatus('complete');
    setBalanceRefresh((n) => n + 1);
    void persistRun(inputs);
    postToParent('keyword-research:finish', { keyword: inputs.keyword, outcome: 'done' });
  }

  function advanceStage(stage: Stage) {
    setStages((prev) => {
      const idx = STAGE_KEYS.indexOf(stage);
      const next: Record<Stage, StageStatus> = { ...prev };
      STAGE_KEYS.forEach((key, i) => {
        if (i <= idx) next[key] = 'done';
        else if (i === idx + 1 && next[key] === 'pending') next[key] = 'active';
      });
      return next;
    });
  }

  // Best-effort mapping of a fully parsed intermediate chunk to panels/stages.
  // Unrecognized shapes are ignored — they never crash the run.
  function applyIntermediate(parsed: unknown): void {
    const rec = asRecord(parsed);

    const directVariants = extractStringArray(rec.variants);
    const variantList = directVariants.length > 0 ? directVariants : extractStringArray(parsed);
    if (variantList.length > 1) {
      variantsRef.current = variantList;
      setVariants(variantList);
      advanceStage('variants');
      return;
    }

    const payload = rec.result ?? rec.results ?? rec.scores ?? parsed;
    const arr = flattenToArray(payload);
    if (arr.length === 0) return;
    const first = asRecord(arr[0]);

    const hasUrl = typeof first.url === 'string' || typeof first.link === 'string';
    const hasKeyword = typeof first.keyword === 'string' || typeof first.entity === 'string';

    if (hasUrl && (Array.isArray(first.keywords) || typeof first.keyword === 'string')) {
      const groups = coerceSemrushGroups(payload);
      if (groups.length > 0) {
        urlsRef.current = mergeUrlLists(urlsRef.current, groups);
        setUrls(urlsRef.current);
        advanceStage('semrush');
      }
      return;
    }

    if (hasUrl && (first.score !== undefined || first.matchedQueries !== undefined)) {
      const scored = coerceUrls(payload);
      if (scored.length > 0) {
        urlsRef.current = mergeUrlLists(urlsRef.current, scored);
        setUrls(urlsRef.current);
        advanceStage('url_scoring');
      }
      return;
    }

    if (hasUrl) {
      if (first.snippet !== undefined || first.summary !== undefined || first.text !== undefined) {
        const exa = coerceExa(payload);
        if (exa.length > 0) {
          exaRef.current = exa;
          setExaResults(exa);
        }
      } else {
        const serp = coerceSerp(payload);
        if (serp.length > 0) {
          serpRef.current = serp;
          setSerpResults(serp);
          advanceStage('search');
        }
      }
      return;
    }

    if (hasKeyword) {
      if (first.compositeScore !== undefined || first.urlFrequency !== undefined) {
        const src = coerceSource(payload);
        if (src.length > 0) {
          allKeywordsRef.current = src;
          setAllKeywords(src);
        }
        const scored = coerceScored(payload);
        if (scored.length > 0) {
          compositeRef.current = scored;
          setCompositeScores(scored);
          advanceStage('scoring');
        }
        return;
      }
      if (first.score !== undefined || first.alignment !== undefined) {
        const scored = coerceScored(payload);
        if (scored.length > 0) {
          alignmentRef.current = scored;
          setAlignmentScores(scored);
          advanceStage('analysis');
        }
        return;
      }
      const normalized = coerceNormalized(payload);
      if (normalized.length > 0) {
        normalizedRef.current = normalized;
        setNormalizedKeywords(normalized);
        advanceStage('semrush');
      }
    }
  }

  function handleChunk(blockId: string, chunk: string): void {
    const prev = chunkBuffersRef.current.get(blockId) ?? '';
    const combined = prev + chunk;
    let parsed: unknown = null;
    let parsedOk = false;
    try {
      parsed = JSON.parse(combined);
      parsedOk = true;
    } catch {
      // Partial JSON — keep buffering.
    }
    if (parsedOk) {
      chunkBuffersRef.current.set(blockId, '');
      try {
        applyIntermediate(parsed);
      } catch (err) {
        devWarn('Failed to apply intermediate chunk', err);
      }
      return;
    }
    if (combined.length > 400000) {
      chunkBuffersRef.current.set(blockId, '');
      return;
    }
    chunkBuffersRef.current.set(blockId, combined);
  }

  // Reads results for ALL 14 selected outputs from the final payload's output object.
  function handleFinalOutput(output: Record<string, unknown>): void {
    try {
      // 1. queryexpansion.variants
      const variantsRaw = pickOutput(output, 'queryexpansion', 'variants');
      const directVariants = extractStringArray(variantsRaw);
      const variantList = directVariants.length > 0 ? directVariants : extractStringArray(asRecord(variantsRaw).variants);
      if (variantList.length > 0) {
        variantsRef.current = variantList;
        setVariants(variantList);
      }

      // 2. serpfetch.result
      const serp = coerceSerp(pickOutput(output, 'serpfetch', 'result', looksLikeUrlRows));
      if (serp.length > 0) {
        serpRef.current = serp;
        setSerpResults(serp);
      }

      // 3. urlscoring&selection.result + 4. aggregatesemrushrows.result
      const scoredUrls = coerceUrls(pickOutput(output, 'urlscoring&selection', 'result', looksLikeUrlRows));
      const semrushGroups = coerceSemrushGroups(
        pickOutput(output, 'aggregatesemrushrows', 'result', (v) => looksLikeUrlRows(v) || looksLikeKeywordRows(v))
      );
      let mergedUrls = urlsRef.current;
      if (scoredUrls.length > 0) mergedUrls = mergeUrlLists(mergedUrls, scoredUrls);
      if (semrushGroups.length > 0) mergedUrls = mergeUrlLists(mergedUrls, semrushGroups);
      if (mergedUrls.length > 0) {
        urlsRef.current = mergedUrls;
        setUrls(mergedUrls);
      }

      // 5. dedup&volumenormalize.result
      const normalized = coerceNormalized(pickOutput(output, 'dedup&volumenormalize', 'result', looksLikeKeywordRows));
      if (normalized.length > 0) {
        normalizedRef.current = normalized;
        setNormalizedKeywords(normalized);
      }

      // 6. exasearch.results
      const exa = coerceExa(pickOutput(output, 'exasearch', 'results', looksLikeUrlRows));
      if (exa.length > 0) {
        exaRef.current = exa;
        setExaResults(exa);
      }

      // 7. compositescoring.result + 8. alignmentscoring.scores
      const compositeRaw = pickOutput(output, 'compositescoring', 'result', looksLikeKeywordRows);
      const composite = coerceScored(compositeRaw);
      if (composite.length > 0) {
        compositeRef.current = composite;
        setCompositeScores(composite);
      }
      const alignRaw = pickOutput(output, 'alignmentscoring', 'scores', looksLikeKeywordRows);
      const alignment = coerceScored(alignRaw);
      if (alignment.length > 0) {
        alignmentRef.current = alignment;
        setAlignmentScores(alignment);
      }

      const sourceRows = coerceSource(compositeRaw);
      const alignSource = coerceSource(alignRaw);
      const allRows = sourceRows.length > 0 ? sourceRows : alignSource;
      if (allRows.length > 0) {
        allKeywordsRef.current = allRows;
        setAllKeywords(allRows);
      }

      // 9–12. aishortlisting + validationpass shortlists
      const aiPrimary = coercePrimary(pickOutput(output, 'aishortlisting', 'primary', looksLikeKeywordRows));
      const aiSecondary = coerceSecondary(pickOutput(output, 'aishortlisting', 'secondary', looksLikeKeywordRows));
      const vpPrimary = coercePrimary(pickOutput(output, 'validationpass', 'primary', looksLikeKeywordRows));
      const vpSecondary = coerceSecondary(pickOutput(output, 'validationpass', 'secondary', looksLikeKeywordRows));
      const primary = vpPrimary.length > 0 ? vpPrimary : aiPrimary;
      const secondary = vpSecondary.length > 0 ? vpSecondary : aiSecondary;
      setPrimaryCandidates(aiPrimary.length > 0 ? aiPrimary.length : primary.length > 0 ? primary.length : null);
      setSecondaryCandidates(aiSecondary.length > 0 ? aiSecondary.length : secondary.length > 0 ? secondary.length : null);

      // 13–14. validationpass.warning.type / .description
      let warningType: string | null = null;
      let warningDesc: string | null = null;
      const dottedType = output['validationpass.warning.type'];
      const dottedDesc = output['validationpass.warning.description'];
      if (typeof dottedType === 'string' && dottedType) warningType = dottedType;
      if (typeof dottedDesc === 'string' && dottedDesc) warningDesc = dottedDesc;
      if (!warningType || !warningDesc) {
        const warningVal = pickOutput(output, 'validationpass', 'warning');
        if (!warningDesc && typeof warningVal === 'string' && warningVal) warningDesc = warningVal;
        const wRec = asRecord(warningVal);
        if (!warningType && typeof wRec.type === 'string' && wRec.type) warningType = wRec.type;
        if (!warningDesc && typeof wRec.description === 'string' && wRec.description) warningDesc = wRec.description;
      }

      if (primary.length > 0 || secondary.length > 0) {
        const payload: ResultPayload = { primary, secondary, warning: warningDesc, warningType };
        resultRef.current = payload;
        setResult(payload);
      }
    } catch (err) {
      devWarn('Failed to map final output', err);
    }
  }

  async function startRun() {
    const trimmed = keyword.trim();
    if (!trimmed) return;
    startedRef.current = true;
    finishedRef.current = false;
    completionRef.current = false;
    setIsRestored(false);
    closeStream();
    resetRunState();
    setStatus('initializing');

    const inputs: RunInputs = { keyword: trimmed, intent, client: clientName.trim() || undefined };
    inputsRef.current = inputs;
    postToParent('keyword-research:start', { keyword: trimmed });

    let token = '';
    try {
      const res = await fetch('/api/keyword-research/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: trimmed, intent, client: clientName.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { token?: unknown; error?: unknown };
      if (!res.ok || typeof data.token !== 'string' || !data.token) {
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

    setStatus('streaming');
    setStages({ ...INITIAL_STAGES, variants: 'active' });

    // The upstream emits ONLY default `message` events — never named SSE events.
    // A single onmessage handler covers progress chunks, the embedded
    // {event:"final"} marker, and the terminating "[DONE]" string literal.
    const es = new EventSource(`/api/keyword-research/stream/${token}`);
    esRef.current = es;

    es.onmessage = (event: MessageEvent) => {
      const raw = typeof event.data === 'string' ? event.data : '';
      if (!raw) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        devWarn('Skipping unparseable SSE message', err);
        return;
      }

      // Terminator: data: "[DONE]" — a JSON string literal, the ONLY completion signal.
      if (parsed === '[DONE]') {
        completionRef.current = true;
        finalizeSuccess(inputs);
        return;
      }

      const rec = asRecord(parsed);

      // Embedded final marker: {event:"final", data:{output:{...}}}.
      if (rec.event === 'final') {
        completionRef.current = true;
        const dataRec = asRecord(rec.data);
        const outputRec = asRecord(dataRec.output);
        handleFinalOutput(Object.keys(outputRec).length > 0 ? outputRec : asRecord(rec.output));
        return;
      }

      // Progress chunk: {blockId, chunk}.
      const blockId = typeof rec.blockId === 'string' ? rec.blockId : '';
      const chunk = typeof rec.chunk === 'string' ? rec.chunk : '';
      if (blockId && chunk) handleChunk(blockId, chunk);
    };

    es.onerror = () => {
      // Only a REAL error if neither "[DONE]" nor the final marker arrived yet.
      if (completionRef.current || finishedRef.current) {
        finalizeSuccess(inputs);
        return;
      }
      closeStream();
      setStatus('failed');
      setFailMessage('Connection to the research stream was lost. Please retry.');
      postToParent('keyword-research:finish', { keyword: trimmed, outcome: 'error' });
    };
  }

  function handleCancel() {
    closeStream();
    finishedRef.current = true;
    setStatus('idle');
    setStages(INITIAL_STAGES);
    setFailMessage(null);
    postToParent('keyword-research:finish', { keyword: keyword.trim(), outcome: 'cancelled' });
  }

  function handleReset() {
    closeStream();
    finishedRef.current = true;
    setKeyword('');
    setClientName('');
    setIntent('commercial');
    setStatus('idle');
    setIsRestored(false);
    inputsRef.current = null;
    resetRunState();
  }

  const running = status === 'initializing' || status === 'streaming';
  const showPanels = status !== 'idle' || result !== null;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Keyword Research</h1>
          <p className="mt-1 text-sm text-slate-500">
            Expand a seed keyword into a validated, competitor-backed shortlist.
          </p>
        </div>
        <SemrushBalanceWidget refreshSignal={balanceRefresh} />
      </header>

      <div className="mt-6">
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
            void startRun();
          }}
          onCancel={handleCancel}
          onReset={handleReset}
        />
      </div>

      {showPanels && (
        <div className="mt-6 flex flex-col gap-5">
          {isRestored && result && (
            <p className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-2.5 text-sm text-indigo-700">
              Restored your last completed run for “{inputsRef.current?.keyword ?? keyword}”.
            </p>
          )}
          {(running || (status === 'complete' && !isRestored)) && (
            <ProgressTracker stages={stages} variants={variants} />
          )}
          {status === 'failed' && failMessage && (
            <ErrorCard
              message={failMessage}
              onRetry={() => {
                void startRun();
              }}
            />
          )}
          {variants.length > 0 && (
            <QueryVariantsPanel
              seedKeyword={inputsRef.current?.keyword ?? keyword}
              intent={intent}
              variants={variants}
              done={stages.variants === 'done' || status === 'complete'}
            />
          )}
          {serpResults.length > 0 && <SerpResultsPanel results={serpResults} />}
          {urls.length > 0 && (
            <CompetitorUrlsPanel
              urls={urls}
              done={stages.url_scoring === 'done' || status === 'complete'}
              candidateCount={serpResults.length > 0 ? serpResults.length : null}
            />
          )}
          {urls.some((u) => (u.keywordsFound?.length ?? 0) > 0) && (
            <SemrushKeywordsPanel urls={urls} done={stages.semrush === 'done' || status === 'complete'} />
          )}
          {normalizedKeywords.length > 0 && <DedupKeywordsPanel keywords={normalizedKeywords} />}
          {exaResults.length > 0 && <ExaResearchPanel results={exaResults} />}
          {compositeScores.length > 0 && <CompositeScoringPanel rows={compositeScores} />}
          {alignmentScores.length > 0 && <AlignmentScoresPanel rows={alignmentScores} />}
          {allKeywords.length > 0 && <SourceKeywordsPanel keywords={allKeywords} />}
          {result && inputsRef.current && (
            <ResultsSection
              result={result}
              inputs={inputsRef.current}
              allKeywords={allKeywords}
              variants={variants}
              competitorUrls={urls}
              serpResults={serpResults}
              exaResults={exaResults}
              normalizedKeywords={normalizedKeywords}
              compositeScores={compositeScores}
              alignmentScores={alignmentScores}
              primaryCandidates={primaryCandidates}
              secondaryCandidates={secondaryCandidates}
              onResultChange={(r) => {
                resultRef.current = r;
                setResult(r);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
