"use client"

import type { ScoredKeyword } from '@/lib/types';

interface AlignmentScoresPanelProps {
  scores: ScoredKeyword[];
}

export default function AlignmentScoresPanel({ scores }: AlignmentScoresPanelProps) {
  if (scores.length === 0) return null;
  return (
    <section className="animate-rise rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Alignment scores ({scores.length})
      </h2>
      <div className="mt-3 max-h-80 overflow-auto rounded-xl border border-slate-100">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Keyword</th>
              <th className="px-4 py-2 text-right font-medium">Alignment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {scores.map((s, i) => (
              <tr key={`${s.keyword}-${i}`}>
                <td className="px-4 py-2 text-slate-800">{s.keyword}</td>
                <td className="px-4 py-2 text-right text-slate-600">{s.score ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
