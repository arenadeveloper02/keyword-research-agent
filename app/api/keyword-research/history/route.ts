import { NextResponse } from 'next/server';
import { getArenaEmailId } from '@/lib/arena-email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Server-side only — never exposed to the client bundle.
const HISTORY_URL =
  'https://agent.thearena.ai/api/workflows/38458816-0871-4c2f-8545-39654a5530cc/execute';
const API_KEY = 'sk-sim-GwQAiLwWID8U3islZzPltwAgmjlUHY5v';

function sanitizeKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Lenient extractor: find the buildhistory.result array anywhere in a parsed
// SSE chunk, tolerating wrappers like { output: { 'buildhistory.result': [...] } }
// or JSON-encoded strings.
function extractHistory(value: unknown, depth = 0): unknown[] | null {
  if (depth > 8 || value === undefined || value === null) return null;
  if (typeof value === 'string') {
    const t = value.trim();
    if (t.startsWith('[') || t.startsWith('{')) {
      try {
        return extractHistory(JSON.parse(t), depth + 1);
      } catch {
        return null;
      }
    }
    return null;
  }
  if (Array.isArray(value)) return value;
  if (typeof value !== 'object') return null;
  const rec = value as Record<string, unknown>;
  for (const [key, v] of Object.entries(rec)) {
    if (sanitizeKey(key).includes('buildhistory')) {
      const inner =
        typeof v === 'object' && v !== null && !Array.isArray(v)
          ? ((v as Record<string, unknown>).result ?? v)
          : v;
      const found = extractHistory(inner, depth + 1);
      if (found) return found;
    }
  }
  for (const k of ['result', 'output', 'data', 'entries', 'history']) {
    if (rec[k] !== undefined) {
      const found = extractHistory(rec[k], depth + 1);
      if (found) return found;
    }
  }
  return null;
}

export async function GET(): Promise<NextResponse> {
  const email = await getArenaEmailId();
  if (!email) {
    return NextResponse.json({ entries: [] });
  }

  // Mirror the history curl exactly: POST with X-API-Key, stream: true,
  // selectedOutputs: ['buildhistory.result'], email in the body.
  let upstream: Response;
  try {
    upstream = await fetch(HISTORY_URL, {
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        type: 'keyword_research',
        stream: true,
        selectedOutputs: ['buildhistory.result'],
      }),
    });
  } catch {
    return NextResponse.json({ entries: [] });
  }

  if (!upstream.ok) {
    return NextResponse.json({ entries: [] });
  }

  const text = await upstream.text().catch(() => '');
  if (!text) {
    return NextResponse.json({ entries: [] });
  }

  let entries: unknown[] | null = null;

  // Parse SSE lines first; fall back to whole-body JSON.
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      const found = extractHistory(JSON.parse(payload));
      if (found && found.length > 0) {
        entries = found;
      } else if (found && !entries) {
        entries = found;
      }
    } catch {
      // Skip non-JSON SSE lines.
    }
  }

  if (!entries) {
    try {
      entries = extractHistory(JSON.parse(text));
    } catch {
      entries = null;
    }
  }

  return NextResponse.json({ entries: entries ?? [] });
}
