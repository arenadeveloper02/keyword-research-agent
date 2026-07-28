"use client"

import type { NormalizedKeyword } from '@/lib/types';
import { formatVolumeCompact } from '@/lib/format';

interface DedupKeywordsPanelProps {
  keywords: NormalizedKeyword[];
}

export default function DedupKeywordsPanel({ keywords }: DedupKeywordsPanelProps) {
  return (
    <section className="animate-rise rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Deduplicated &amp; Normalized Keywords
        <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">{keywords.length}</span>
      </h2>
      <p className="mt-0.5 text-xs text-slate-400">{keywords.length.toLocaleString('en-US')} unique keywords</p>
      <div className="mt-3 flex max-h-72 flex-wrap gap-1.5 overflow-y-auto">
        {keywords.map((k, i) => (
          <span
            key={`${k.keyword}-${i}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700"
          >
            {k.keyword}
            <span className={k.volume === 0 ? 'text-slate-400' : 'font-medium text-slate-500'}>
              {formatVolumeCompact(k.volume)}
            </span>
          </span>
        ))}
      </div>
    </section>
  );
}
