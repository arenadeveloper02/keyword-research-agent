"use client"

import type { NormalizedKeyword } from '@/lib/types';
import { formatVolume } from '@/lib/format';

interface DedupKeywordsPanelProps {
  keywords: NormalizedKeyword[];
}

export default function DedupKeywordsPanel({ keywords }: DedupKeywordsPanelProps) {
  if (keywords.length === 0) return null;
  return (
    <section className="animate-rise rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Deduplicated keywords ({keywords.length})
      </h2>
      <div className="mt-3 max-h-80 overflow-auto rounded-xl border border-slate-100">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Keyword</th>
              <th className="px-4 py-2 text-right font-medium">Volume</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {keywords.map((k, i) => (
              <tr key={`${k.keyword}-${i}`}>
                <td className="px-4 py-2 text-slate-800">{k.keyword}</td>
                <td className="px-4 py-2 text-right text-slate-600">{formatVolume(k.volume)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
