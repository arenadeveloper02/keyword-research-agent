import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Step 1 of the two-step flow: validate inputs and issue a single-use stream token.
// The token encodes the run parameters so the stream route can mirror the upstream
// curl exactly. No upstream call happens here.
export async function POST(req: Request): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const keyword = typeof body.keyword === 'string' ? body.keyword.trim() : '';
  if (!keyword) {
    return NextResponse.json({ error: 'A seed keyword is required.' }, { status: 400 });
  }

  const intent = body.intent === 'informational' ? 'informational' : 'commercial';
  const client = typeof body.client === 'string' ? body.client.trim() : '';

  const token = Buffer.from(
    JSON.stringify({ keyword, intent, client, n: randomUUID(), t: Date.now() })
  ).toString('base64url');

  return NextResponse.json({ token });
}
