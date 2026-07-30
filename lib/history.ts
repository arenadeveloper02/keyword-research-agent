import type { HistoryEntry, PrimaryKeyword, ResultPayload, SecondaryKeyword } from '@/lib/types';

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
      };
    })
    .filter((e) => e.keyword.length > 0);
}
