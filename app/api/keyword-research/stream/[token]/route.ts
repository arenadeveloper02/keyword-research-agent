export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Server-side only — never exposed to the client bundle.
const UPSTREAM_URL =
  'https://test-agent.thearena.ai/api/workflows/54171ae9-160a-4967-9ac7-8590e6ee561f/execute';
const API_KEY = 'sk-sim-u8VM1oPDuO05H38_Nh6CVvuMUaCfgHmQ';

// The full 14-output contract — exact strings, exact order. Do not trim.
const SELECTED_OUTPUTS = [
  'dedup&volumenormalize.result',
  'aggregatesemrushrows.result',
  'queryexpansion.variants',
  'serpfetch.result',
  'aishortlisting.primary',
  'aishortlisting.secondary',
  'validationpass.primary',
  'validationpass.secondary',
  'validationpass.warning.type',
  'validationpass.warning.description',
  'exasearch.results',
  'urlscoring&selection.result',
  'compositescoring.result',
  'alignmentscoring.scores',
];

const TOKEN_TTL_MS = 10 * 60 * 1000;

// Best-effort single-use enforcement (per server instance).
const consumedTokens = new Set<string>();

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
): Promise<Response> {
  const { token } = await params;

  let payload: { keyword?: unknown; intent?: unknown; client?: unknown; t?: unknown };
  try {
    payload = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as {
      keyword?: unknown;
      intent?: unknown;
      client?: unknown;
      t?: unknown;
    };
  } catch {
    return new Response('Invalid stream token.', { status: 400 });
  }

  const keyword = typeof payload.keyword === 'string' ? payload.keyword : '';
  if (!keyword) {
    return new Response('Invalid stream token.', { status: 400 });
  }

  if (consumedTokens.has(token)) {
    return new Response('This stream token has already been used. Start a new run.', { status: 409 });
  }
  if (consumedTokens.size > 1000) consumedTokens.clear();
  consumedTokens.add(token);

  const issuedAt = typeof payload.t === 'number' ? payload.t : 0;
  if (Date.now() - issuedAt > TOKEN_TTL_MS) {
    return new Response('Stream token expired. Start a new run.', { status: 410 });
  }

  // Mirror the pipeline curl exactly: POST with X-API-Key, stream: true, selectedOutputs.
  let upstream: Response;
  try {
    upstream = await fetch(UPSTREAM_URL, {
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        keyword,
        intent: typeof payload.intent === 'string' ? payload.intent : 'commercial',
        client: typeof payload.client === 'string' ? payload.client : '',
        stream: true,
        selectedOutputs: SELECTED_OUTPUTS,
      }),
    });
  } catch {
    return new Response('Failed to reach the keyword research pipeline.', { status: 502 });
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '');
    return new Response(text || `Upstream error (${upstream.status})`, { status: upstream.status });
  }

  if (!upstream.body) {
    return new Response('Upstream returned an empty stream.', { status: 502 });
  }

  // Pipe the upstream stream straight through — do NOT buffer or call .json().
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
