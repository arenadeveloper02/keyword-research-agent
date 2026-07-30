import type {
  CompetitorUrl,
  CompositeCandidate,
  HistoryEntry,
  NormalizedKeyword,
  PrimaryKeyword,
  ResultPayload,
  SavedRunOutput,
  ScoredKeyword,
  SecondaryKeyword,
  SerpResult,
  SourceKeyword,
} from '@/lib/types';

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v : null;
}

function toNumOrNull(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
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

function coercePrimary(v: unknown): PrimaryKeyword[] {
  return asArray(parseMaybeJson(v))
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
  return asArray(parseMaybeJson(v))
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

function coerceStringArray(v: unknown): string[] {
  return asArray(parseMaybeJson(v)).filter((x): x is string => typeof x === 'string' && x.length > 0);
}

function coerceSourceKeywords(v: unknown): SourceKeyword[] {
  return asArray(parseMaybeJson(v))
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

function coerceCompetitorUrls(v: unknown): CompetitorUrl[] {
  return asArray(parseMaybeJson(v))
    .map((item) => {
      const o = asRecord(item);
      const url = typeof o.url === 'string' ? o.url : '';
      const domain = typeof o.domain === 'string' && o.domain.length > 0 ? o.domain : domainOf(url);
      const kws = coerceSourceKeywords(o.keywordsFound);
      return {
        url,
        domain,
        score: toNumOrNull(o.score) ?? 0,
        title: typeof o.title === 'string' ? o.title : null,
        matchedQueries: toNumOrNull(o.matchedQueries),
        totalQueries: toNumOrNull(o.totalQueries),
        keywordsFound: kws.length > 0 ? kws : undefined,
        status: 'done' as const,
      };
    })
    .filter((u) => u.url.length > 0);
}

function coerceSerpResults(v: unknown): SerpResult[] {
  return asArray(parseMaybeJson(v))
    .map((item) => {
      const o = asRecord(item);
      const url = typeof o.url === 'string' ? o.url : '';
      const domain = typeof o.domain === 'string' && o.domain.length > 0 ? o.domain : domainOf(url);
      return {
        rank: toNumOrNull(o.rank),
        title: typeof o.title === 'string' ? o.title : null,
        url,
        domain,
      };
    })
    .filter((r) => r.url.length > 0);
}

function coerceNormalizedKeywords(v: unknown): NormalizedKeyword[] {
  return asArray(parseMaybeJson(v))
    .map((item) => {
      const o = asRecord(item);
      return {
        keyword: typeof o.keyword === 'string' ? o.keyword : '',
        volume: toNumOrNull(o.volume),
      };
    })
    .filter((k) => k.keyword.length > 0);
}

function coerceScoredKeywords(v: unknown): ScoredKeyword[] {
  return asArray(parseMaybeJson(v))
    .map((item) => {
      const o = asRecord(item);
      return {
        keyword: typeof o.keyword === 'string' ? o.keyword : '',
        score: toNumOrNull(o.score),
      };
    })
    .filter((k) => k.keyword.length > 0);
}

function coerceCompositeCandidates(v: unknown): CompositeCandidate[] {
  return asArray(parseMaybeJson(v))
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

function coerceOutput(v: unknown): ResultPayload | null {
  const o = asRecord(parseMaybeJson(v));
  const primary = coercePrimary(o.primary);
  const secondary = coerceSecondary(o.secondary);
  if (primary.length === 0 && secondary.length === 0) return null;
  const w = parseMaybeJson(o.warning);
  const wRec = asRecord(w);
  return {
    primary,
    secondary,
    warning: str(w) ?? str(wRec.description) ?? null,
    warningType: str(o.warningType) ?? str(wRec.type) ?? null,
  };
}

// Lenient coercion of the full saved-run output (SavedRunOutput) so History can
// render every pipeline section a saved run recorded.
function coerceFullOutput(v: unknown): SavedRunOutput | null {
  const o = asRecord(parseMaybeJson(v));
  const primary = coercePrimary(o.primary);
  const secondary = coerceSecondary(o.secondary);
  const variants = coerceStringArray(o.variants);
  const urls = coerceCompetitorUrls(o.urls);
  const serpResults = coerceSerpResults(o.serpResults);
  const normalizedKeywords = coerceNormalizedKeywords(o.normalizedKeywords);
  const compositeCandidates = coerceCompositeCandidates(o.compositeCandidates);
  const alignmentScores = coerceScoredKeywords(o.alignmentScores);
  const allKeywords = coerceSourceKeywords(o.allKeywords);
  const hasAny =
    primary.length > 0 ||
    secondary.length > 0 ||
    variants.length > 0 ||
    urls.length > 0 ||
    serpResults.length > 0 ||
    normalizedKeywords.length > 0 ||
    compositeCandidates.length > 0 ||
    alignmentScores.length > 0 ||
    allKeywords.length > 0;
  if (!hasAny) return null;
  const w = parseMaybeJson(o.warning);
  const wRec = asRecord(w);
  return {
    primary,
    secondary,
    warning: str(w) ?? str(wRec.description) ?? null,
    warningType: str(o.warningType) ?? str(wRec.type) ?? null,
    allKeywords,
    variants,
    urls,
    serpResults,
    normalizedKeywords,
    compositeCandidates,
    alignmentScores,
  };
}

function coerceTimestamp(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) {
    const ms = v > 1e12 ? v : v * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toISOString();
}

// Lenient coercion of upstream / DB rows into HistoryEntry. Handles both the
// Arena buildhistory workflow shape and locally saved ResearchRun rows.
export function coerceHistoryEntries(v: unknown): HistoryEntry[] {
  return asArray(parseMaybeJson(v))
    .map((item, index) => {
      const o = asRecord(parseMaybeJson(item));
      const inputs = asRecord(parseMaybeJson(o.inputs));
      const keyword = str(o.keyword) ?? str(inputs.keyword) ?? str(o.seedKeyword) ?? str(o.label) ?? '';
      const client = str(o.client) ?? str(inputs.client) ?? '';
      const intent = str(o.intent) ?? str(inputs.intent) ?? '';
      const createdAt = coerceTimestamp(
        o.createdAt ?? o.timestamp ?? o.created_at ?? o.generatedAt ?? o.date
      );
      const output = coerceOutput(o.output ?? o.result ?? o);
      const fullOutput = coerceFullOutput(o.output ?? o.result ?? o);
      const preview =
        output && output.primary.length > 0
          ? output.primary[0].keyword
          : str(o.preview) ?? str(o.h1) ?? str(o.title) ?? null;
      return {
        id: str(o.id) ?? `history-${index}-${keyword}`,
        keyword,
        client,
        intent,
        createdAt,
        preview,
        output,
        fullOutput,
      };
    })
    .filter((e) => e.keyword.length > 0);
}
