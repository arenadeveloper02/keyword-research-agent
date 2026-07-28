"use client"

import { useMemo } from 'react';
import type { ScoredKeyword } from '@/lib/types';

interface CompositeScoringPanelProps {
  rows: ScoredKeyword[];
}

const fmtScore = (n: number | null): string =>
  n === null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: 2 });

export default function CompositeScoringPanel({ rows }: CompositeScoringPanelProps) {
  const sorted = useMemo(
    () => [...rows].sort((a, b) => (b.score ?? Number.NEGATIVE_INFINITY) - (a.score ?? Number.NEGATIVE_INFINITY)),
    [rows]
  );

  return (
    <section className="animate-rise rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Composite Scoring
        <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">{rows.length}</span>
      </h2>
      <p className="mt-0.5 text-xs text-slate-400">Keywords ranked by composite score</p>
      <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-slate-100">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Keyword</th>
              <th className="px-3 py-2 text-right font-medium">Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((k, i) => (
              <tr key={`${k.keyword}-${i}`}>
                <td className="px-3 py-1.5 text-slate-800">{k.keyword}</td>
                <td className="px-3 py-1.5 text-right font-medium text-slate-600">{fmtScore(k.score)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
