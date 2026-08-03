"use client"

import type { CompositeCandidate } from '@/lib/types';
import { formatVolume } from '@/lib/format';

interface CompositeScoringPanelProps {
  candidates: CompositeCandidate[];
}

export default function CompositeScoringPanel({ candidates }: CompositeScoringPanelProps) {
  if (candidates.length === 0) return null;
  return (
    <section className="animate-rise rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Composite scoring candidates ({candidates.length})
      </h2>
      <div className="mt-3 max-h-80 overflow-auto rounded-xl border border-slate-100">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Keyword</th>
              <th className="px-4 py-2 text-right font-medium">Volume</th>
              <th className="px-4 py-2 text-right font-medium">CPC</th>
              <th className="px-4 py-2 text-right font-medium">Position</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {candidates.map((c, i) => (
              <tr key={`${c.keyword}-${i}`}>
                <td className="px-4 py-2 text-slate-800">{c.keyword}</td>
                <td className="px-4 py-2 text-right text-slate-600">{formatVolume(c.volume)}</td>
                <td className="px-4 py-2 text-right text-slate-600">
                  {c.cpc !== null ? `$${c.cpc.toFixed(2)}` : '—'}
                </td>
                <td className="px-4 py-2 text-right text-slate-600">{c.position ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
