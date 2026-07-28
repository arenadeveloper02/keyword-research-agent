"use client"

import { useState } from 'react';
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import type { CompetitorUrl } from '@/lib/types';

interface CompetitorUrlsPanelProps {
  urls: CompetitorUrl[];
  done?: boolean;
  candidateCount?: number | null;
}

export default function CompetitorUrlsPanel({ urls, done = false, candidateCount = null }: CompetitorUrlsPanelProps) {
  const [open, setOpen] = useState(true);

  return (
    <section className="animate-rise rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-2xl px-5 py-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <span>
          <span className="block text-sm font-semibold uppercase tracking-wide text-slate-500">
            URL Scoring
            <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">{urls.length}</span>
          </span>
          <span className="mt-0.5 block text-xs text-slate-400">
            Selected top {urls.length} pages
            {typeof candidateCount === 'number' && candidateCount > 0 ? ` from ${candidateCount} candidates` : ''}
          </span>
        </span>
        <span className="flex items-center gap-2">
          {done ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
              <Check className="h-3 w-3" aria-hidden="true" /> Done
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-600">
              <Loader2 className="h-3 w-3 motion-safe:animate-spin" aria-hidden="true" /> Working
            </span>
          )}
          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </span>
      </button>
      {open && (
        <div className="grid gap-3 border-t border-slate-100 p-5 sm:grid-cols-2">
          {urls.map((u, i) => (
            <article key={u.url} className="flex items-start gap-3 rounded-xl border border-slate-200 p-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-xs font-bold text-white">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-900">{u.domain}</p>
                {u.title && <p className="mt-0.5 truncate text-xs text-slate-500">{u.title}</p>}
                <p className="truncate text-xs text-slate-400">{u.url}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700">
                    page
                  </span>
                  {typeof u.matchedQueries === 'number' && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                      {u.matchedQueries}
                      {typeof u.totalQueries === 'number' ? `/${u.totalQueries}` : ''} queries
                    </span>
                  )}
                </div>
              </div>
              <span className="shrink-0 text-sm font-semibold text-slate-700">{u.score.toFixed(2)}</span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
