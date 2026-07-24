"use client"

import { useState } from 'react';
import { AlertCircle, Check, ChevronDown, Loader2 } from 'lucide-react';
import type { CompetitorUrl } from '@/lib/types';

interface CompetitorUrlsPanelProps {
  urls: CompetitorUrl[];
}

export default function CompetitorUrlsPanel({ urls }: CompetitorUrlsPanelProps) {
  const [open, setOpen] = useState(true);

  return (
    <section className="animate-rise rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-2xl px-5 py-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <span className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Competitor URLs
          <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">{urls.length}</span>
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {urls.map((u) => (
            <li key={u.url} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">{u.domain}</p>
                <p className="truncate text-xs text-slate-400">{u.url}</p>
              </div>
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                Score {u.score.toFixed(1)}
              </span>
              <span className="flex w-36 shrink-0 items-center justify-end gap-1.5 text-xs">
                {u.status === 'pending' && <span className="text-slate-400">Queued</span>}
                {u.status === 'fetching' && (
                  <>
                    <Loader2 className="h-3.5 w-3.5 text-indigo-500 motion-safe:animate-spin" aria-hidden="true" />
                    <span className="text-indigo-600">Fetching…</span>
                  </>
                )}
                {u.status === 'done' && (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                    <span className="text-emerald-600">
                      {u.keywordsFound ? `${u.keywordsFound.length} keywords found` : 'Done'}
                    </span>
                  </>
                )}
                {u.status === 'error' && (
                  <>
                    <AlertCircle className="h-3.5 w-3.5 text-rose-500" aria-hidden="true" />
                    <span className="text-rose-600">Error</span>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
