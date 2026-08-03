"use client"

import type { CompetitorUrl } from '@/lib/types';
import { formatVolume } from '@/lib/format';

interface SemrushKeywordsPanelProps {
  urls: CompetitorUrl[];
}

export default function SemrushKeywordsPanel({ urls }: SemrushKeywordsPanelProps) {
  const withKeywords = urls.filter((u) => (u.keywordsFound?.length ?? 0) > 0);
  if (withKeywords.length === 0) return null;
  return (
    <section className="animate-rise rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Ranking keywords by competitor page
      </h2>
      <div className="mt-3 flex flex-col gap-4">
        {withKeywords.map((u) => (
          <div key={u.url}>
            <p className="truncate text-sm font-medium text-slate-800">{u.domain}</p>
            <p className="truncate text-xs text-slate-400">{u.url}</p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {(u.keywordsFound ?? []).map((k, i) => (
                <li
                  key={`${u.url}-${k.keyword}-${i}`}
                  className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600"
                >
                  {k.keyword}
                  {k.volume !== null && (
                    <span className="ml-1 text-slate-400">· {formatVolume(k.volume)}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
