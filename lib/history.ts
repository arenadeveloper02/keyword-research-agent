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

function sanitizeKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Shortlist entries may arrive with `reasoning` instead of `rationale`.
function coercePrimary(v: unknown): PrimaryKeyword[] {
  return asArray(parseMaybeJson(v))
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

// ---------------------------------------------------------------------------
// Raw upstream-shape coercers. History entries stored by the Arena workflow
// often carry the raw final-response payload (blockId-keyed outputs) instead
// of the flat SavedRunOutput shape, so these recover SERP results, selected
// competitor URLs, SEMrush rows, and dedup candidates from that structure.
// ---------------------------------------------------------------------------

// serpfetch organic entries: { link, title, snippet, position, sourceQuery }
function coerceSerpOrganic(v: unknown): SerpResult[] {
  return asArray(v)
    .map((item) => {
      const o = asRecord(item);
      const url = typeof o.link === 'string' ? o.link : typeof o.url === 'string' ? o.url : '';
      const domain = typeof o.domain === 'string' && o.domain.length > 0 ? o.domain : url ? domainOf(url) : '';
      return {
        rank: toNumOrNull(o.position) ?? toNumOrNull(o.rank),
        title: typeof o.title === 'string' ? o.title : null,
        url,
        domain,
      };
    })
    .filter((r) => r.url.length > 0);
}

// urlscoring&selection selectedUrls entries: { url, title, snippet, position, domain, score }
function coerceSelectedUrlsRaw(v: unknown): CompetitorUrl[] {
  return asArray(v)
    .map((item) => {
      const o = asRecord(item);
      const url = typeof o.url === 'string' ? o.url : '';
      const domain = typeof o.domain === 'string' && o.domain.length > 0 ? o.domain : url ? domainOf(url) : '';
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
function coerceAlignmentRaw(v: unknown): ScoredKeyword[] {
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

// aggregatesemrushrows rows: { "Keyword", "Search Volume", "CPC", "_sourceUrl" }
function groupSemrushRowsRaw(v: unknown): CompetitorUrl[] {
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

interface DeepSignals {
  primary?: PrimaryKeyword[];
  secondary?: SecondaryKeyword[];
  variants?: string[];
  serpResults?: SerpResult[];
  selectedUrls?: CompetitorUrl[];
  semrushGroups?: CompetitorUrl[];
  normalizedKeywords?: NormalizedKeyword[];
  compositeCandidates?: CompositeCandidate[];
  allKeywords?: SourceKeyword[];
  alignmentScores?: ScoredKeyword[];
  warning?: string;
  warningType?: string;
}

// Classify a bare array found anywhere in the payload by element shape (and
// the sanitized key it was found under) and store the first non-empty match.
function handleSignalArray(arr: unknown[], out: DeepSignals, keyHint: string): void {
  if (arr.length === 0) return;
  const strings = arr.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
  if (strings.length === arr.length) {
    if ((keyHint === 'variants' || keyHint === 'queries') && !(out.variants && out.variants.length > 0)) {
      out.variants = strings;
    }
    return;
  }
  const first = asRecord(arr[0]);
  if (keyHint === 'primary') {
    if (!(out.primary && out.primary.length > 0)) {
      const rows = coercePrimary(arr);
      if (rows.length > 0) out.primary = rows;
    }
    return;
  }
  if (keyHint === 'secondary') {
    if (!(out.secondary && out.secondary.length > 0)) {
      const rows = coerceSecondary(arr);
      if (rows.length > 0) out.secondary = rows;
    }
    return;
  }
  // SEMrush rows → group by source URL for the "keywords by page" panel.
  if (typeof first.Keyword === 'string' || typeof first._sourceUrl === 'string') {
    if (!(out.semrushGroups && out.semrushGroups.length > 0)) {
      const groups = groupSemrushRowsRaw(arr);
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
  // Scored/selected competitor URLs.
  if (typeof first.url === 'string') {
    if ('score' in first || 'scoreBreakdown' in first || keyHint === 'selectedurls') {
      if (!(out.selectedUrls && out.selectedUrls.length > 0)) {
        const urls = coerceSelectedUrlsRaw(arr);
        if (urls.length > 0) out.selectedUrls = urls;
      }
    }
    return;
  }
  if (typeof first.keyword !== 'string') return;
  if ('alignment' in first || keyHint === 'scores') {
    if (!(out.alignmentScores && out.alignmentScores.length > 0)) {
      const rows = coerceAlignmentRaw(arr);
      if (rows.length > 0) out.alignmentScores = rows;
    }
    return;
  }
  // Shortlist fragments without a primary/secondary key hint — skip; they are
  // picked up under their proper keys above.
  if ('reasoning' in first || 'rationale' in first) return;
  // Composite scoring candidates (carry compositeScore).
  if ('compositeScore' in first) {
    if (!(out.compositeCandidates && out.compositeCandidates.length > 0)) {
      const comp = coerceCompositeCandidates(arr);
      if (comp.length > 0) out.compositeCandidates = comp;
    }
    if (!(out.allKeywords && out.allKeywords.length > 0)) {
      const src = coerceSourceKeywords(arr);
      if (src.length > 0) out.allKeywords = src;
    }
    return;
  }
  // Dedup & volume-normalize candidates: keyword + volume rows (no compositeScore).
  if ('volume' in first || keyHint === 'candidates') {
    if (!(out.normalizedKeywords && out.normalizedKeywords.length > 0)) {
      const rows = coerceNormalizedKeywords(arr);
      if (rows.length > 0) out.normalizedKeywords = rows;
    }
  }
}

// Recursively walk any saved payload (flat SavedRunOutput, or the upstream
// final-response shape keyed by blockId with nested `result` objects) and
// collect every pipeline signal we can recognize.
function extractSavedSignals(value: unknown, out: DeepSignals, depth = 0, keyHint = ''): void {
  if (depth > 8 || value === undefined || value === null) return;
  const v = parseMaybeJson(value);
  if (Array.isArray(v)) {
    handleSignalArray(v, out, keyHint);
    return;
  }
  if (typeof v !== 'object' || v === null) return;
  const rec = v as Record<string, unknown>;
  for (const [key, val] of Object.entries(rec)) {
    const k = sanitizeKey(key);
    if (k === 'warning' || k.endsWith('warningdescription')) {
      const w = parseMaybeJson(val);
      if (typeof w === 'string' && w.trim().length > 0) {
        if (!out.warning) out.warning = w;
        continue;
      }
      const wr = asRecord(w);
      if (!out.warning && typeof wr.description === 'string' && wr.description.trim().length > 0) {
        out.warning = wr.description;
      }
      if (!out.warningType && typeof wr.type === 'string' && wr.type.trim().length > 0) {
        out.warningType = wr.type;
      }
      continue;
    }
    if (k.endsWith('warningtype')) {
      if (!out.warningType && typeof val === 'string' && val.trim().length > 0) out.warningType = val;
      continue;
    }
    extractSavedSignals(val, out, depth + 1, k);
  }
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
// render every pipeline section a saved run recorded. Falls back to a deep
// structural scan so raw upstream payloads (blockId-keyed final responses)
// still surface SERP results, competitor URL scoring, SEMrush keywords by
// page, and deduplicated keywords.
function coerceFullOutput(v: unknown): SavedRunOutput | null {
  const o = asRecord(parseMaybeJson(v));
  let primary = coercePrimary(o.primary);
  let secondary = coerceSecondary(o.secondary);
  let variants = coerceStringArray(o.variants);
  let urls = coerceCompetitorUrls(o.urls);
  let serpResults = coerceSerpResults(o.serpResults);
  let normalizedKeywords = coerceNormalizedKeywords(o.normalizedKeywords);
  let compositeCandidates = coerceCompositeCandidates(o.compositeCandidates);
  let alignmentScores = coerceScoredKeywords(o.alignmentScores);
  let allKeywords = coerceSourceKeywords(o.allKeywords);

  const sig: DeepSignals = {};
  extractSavedSignals(o, sig);

  if (primary.length === 0 && sig.primary && sig.primary.length > 0) primary = sig.primary;
  if (secondary.length === 0 && sig.secondary && sig.secondary.length > 0) secondary = sig.secondary;
  if (variants.length === 0 && sig.variants && sig.variants.length > 0) variants = sig.variants;
  if (serpResults.length === 0 && sig.serpResults && sig.serpResults.length > 0) {
    serpResults = sig.serpResults;
  }
  if (normalizedKeywords.length === 0 && sig.normalizedKeywords && sig.normalizedKeywords.length > 0) {
    normalizedKeywords = sig.normalizedKeywords;
  }
  if (compositeCandidates.length === 0 && sig.compositeCandidates && sig.compositeCandidates.length > 0) {
    compositeCandidates = sig.compositeCandidates;
  }
  if (alignmentScores.length === 0 && sig.alignmentScores && sig.alignmentScores.length > 0) {
    alignmentScores = sig.alignmentScores;
  }
  if (allKeywords.length === 0 && sig.allKeywords && sig.allKeywords.length > 0) {
    allKeywords = sig.allKeywords;
  }
  if (urls.length === 0 && sig.selectedUrls && sig.selectedUrls.length > 0) {
    urls = sig.selectedUrls;
  }
  // Attach SEMrush keyword groups to the competitor URLs so the
  // "keywords by page" panel renders in History.
  if (
    sig.semrushGroups &&
    sig.semrushGroups.length > 0 &&
    !urls.some((u) => (u.keywordsFound?.length ?? 0) > 0)
  ) {
    urls = mergeUrlLists(urls, sig.semrushGroups);
  }

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
    warning: str(w) ?? str(wRec.description) ?? sig.warning ?? null,
    warningType: str(o.warningType) ?? str(wRec.type) ?? sig.warningType ?? null,
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
      const fullOutput = coerceFullOutput(o.output ?? o.result ?? o);
      let output = coerceOutput(o.output ?? o.result ?? o);
      // The raw upstream final-response shape nests primary/secondary under
      // blockId keys — recover the shortlist from the deep-scanned full output.
      if (!output && fullOutput && (fullOutput.primary.length > 0 || fullOutput.secondary.length > 0)) {
        output = {
          primary: fullOutput.primary,
          secondary: fullOutput.secondary,
          warning: fullOutput.warning ?? null,
          warningType: fullOutput.warningType ?? null,
        };
      }
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
