export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Server-side only — never exposed to the client bundle.
const UPSTREAM_URL =
  'https://agent.thearena.ai/api/workflows/b056ebe3-2df8-4d6a-aa17-d90e6b5f3c7f/execute';
const API_KEY = 'sk-sim-GwQAiLwWID8U3islZzPltwAgmjlUHY5v';

// The verified 13-output contract — exact strings, exact order (mirrors the
// verification curl). Do not trim.
const SELECTED_OUTPUTS = [
  'dedup&volumenormalize.result',
  'aishortlisting.primary',
  'aishortlisting.secondary',
  'urlscoring&selection.result',
  'alignmentscoring.scores',
  'aggregatesemrushrows.result',
  'serpfetch.result',
  'compositescoring.result',
  'validationpass.primary',
  'validationpass.secondary',
  'validationpass.warning.type',
  'validationpass.warning.description',
  'finalresponse.data',
];

const TOKEN_TTL_MS = 10 * 60 * 1000;

// Best-effort single-use enforcement (per server instance).
const consumedTokens = new Set<string>();

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
): Promise<Response> {
  const { token } = await params;

  let payload: { keyword?: unknown; intent?: unknown; client?: unknown; email?: unknown; t?: unknown };
  try {
    payload = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as {
      keyword?: unknown;
      intent?: unknown;
      client?: unknown;
      email?: unknown;
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

  // Mirror the verified pipeline curl exactly: POST with X-API-Key, stream: true,
  // selectedOutputs. The Arena email id is included as a request-body parameter.
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
        email: typeof payload.email === 'string' ? payload.email : '',
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
