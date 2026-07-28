"use client"

import { Check, ExternalLink, Loader2 } from 'lucide-react';
import type { CompetitorUrl } from '@/lib/types';
import { formatVolumeCompact } from '@/lib/format';

interface SemrushKeywordsPanelProps {
  urls: CompetitorUrl[];
  done?: boolean;
}

export default function SemrushKeywordsPanel({ urls, done = false }: SemrushKeywordsPanelProps) {
  const groups = urls.filter((u) => (u.keywordsFound?.length ?? 0) > 0);
  const total = groups.reduce((sum, u) => sum + (u.keywordsFound?.length ?? 0), 0);

  return (
    <section className="animate-rise rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">SEMrush Keywords</h2>
          <p className="mt-0.5 text-xs text-slate-400">Collected {total.toLocaleString('en-US')} keywords across all pages</p>
        </div>
        {done ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
            <Check className="h-3 w-3" aria-hidden="true" /> Done
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-600">
            <Loader2 className="h-3 w-3 motion-safe:animate-spin" aria-hidden="true" /> Working
          </span>
        )}
      </div>
      <div className="mt-4 space-y-4">
        {groups.map((u) => (
          <div key={u.url} className="rounded-xl border border-slate-100 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden="true" />
                <a
                  href={u.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-w-0 items-center gap-1 truncate text-sm font-medium text-indigo-600 hover:text-indigo-800"
                >
                  <span className="truncate">{u.url}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                </a>
              </span>
              <span className="shrink-0 text-xs font-medium text-slate-500">
                {(u.keywordsFound?.length ?? 0).toLocaleString('en-US')} keywords
              </span>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {(u.keywordsFound ?? []).map((k) => (
                <span
                  key={`${u.url}-${k.keyword}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700"
                >
                  {k.keyword}
                  <span className={k.volume === 0 ? 'text-slate-400' : 'font-medium text-slate-500'}>
                    {formatVolumeCompact(k.volume)}
                  </span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
