"use client"

import type { CompositeCandidate } from '@/lib/types';
import { formatVolume } from '@/lib/format';

interface CompositeScoringPanelProps {
  candidates: CompositeCandidate[];
}

const fmtNum = (n: number | null): string => (n === null ? '—' : n.toLocaleString('en-US'));
const fmtCpc = (n: number | null): string =>
  n === null ? '—' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CompositeScoringPanel({ candidates }: CompositeScoringPanelProps) {
  return (
    <section className="animate-rise rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Composite Scoring
        <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">{candidates.length}</span>
      </h2>
      <p className="mt-0.5 text-xs text-slate-400">Candidate keywords with volume, position, and CPC</p>
      <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-slate-100">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Keyword</th>
              <th className="px-3 py-2 text-right font-medium">Volume</th>
              <th className="px-3 py-2 text-right font-medium">Position</th>
              <th className="px-3 py-2 text-right font-medium">CPC</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {candidates.map((c, i) => (
              <tr key={`${c.keyword}-${i}`}>
                <td className="px-3 py-1.5 text-slate-800">{c.keyword}</td>
                <td className="px-3 py-1.5 text-right text-slate-600">{formatVolume(c.volume)}</td>
                <td className="px-3 py-1.5 text-right text-slate-600">{fmtNum(c.position)}</td>
                <td className="px-3 py-1.5 text-right text-slate-600">{fmtCpc(c.cpc)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
