import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const tool = searchParams.get('tool') ?? 'keyword-research';
  const limitParam = Number(searchParams.get('limit') ?? '1');
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(Math.trunc(limitParam), 1), 20) : 1;

  try {
    const runs = await prisma.researchRun.findMany({
      where: { tool },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return NextResponse.json({ runs });
  } catch {
    // Restore is best-effort — an empty list must never break the page.
    return NextResponse.json({ runs: [] });
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const tool = typeof body.tool === 'string' && body.tool ? body.tool : 'keyword-research';
  const label = typeof body.label === 'string' ? body.label : '';
  const status = typeof body.status === 'string' && body.status ? body.status : 'completed';

  if (body.inputs === undefined || body.output === undefined) {
    return NextResponse.json({ error: 'inputs and output are required.' }, { status: 400 });
  }

  try {
    const run = await prisma.researchRun.create({
      data: {
        tool,
        label,
        status,
        inputs: body.inputs as Prisma.InputJsonValue,
        output: body.output as Prisma.InputJsonValue,
      },
    });
    return NextResponse.json({ run });
  } catch {
    return NextResponse.json({ error: 'Failed to save run.' }, { status: 500 });
  }
}
