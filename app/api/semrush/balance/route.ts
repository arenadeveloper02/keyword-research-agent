import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// TODO: The pipeline curl provided no SEMrush balance endpoint. When one is
// available, proxy it here (API key server-side only) and return { units: number }.
// Returning { units: null } lets the widget degrade gracefully to an em dash.
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ units: null });
}
