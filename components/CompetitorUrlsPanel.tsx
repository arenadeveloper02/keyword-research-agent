"use client"

import type { CompetitorUrl } from '@/lib/types';

interface CompetitorUrlsPanelProps {
  urls: CompetitorUrl[];
}

export default function CompetitorUrlsPanel({ urls }: CompetitorUrlsPanelProps) {
  if (urls.length === 0) return null;
  return (
    <section className="animate-rise rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Selected competitor pages ({urls.length})
      </h2>
      <ul className="mt-3 flex flex-col gap-3">
        {urls.map((u) => (
          <li
            key={u.url}
            className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800">{u.domain}</p>
              {u.title && <p className="mt-0.5 text-xs text-slate-500">{u.title}</p>}
              <a
                href={u.url}
                target="_blank"
                rel="noreferrer"
                className="mt-0.5 block truncate text-xs text-indigo-600 hover:text-indigo-800"
              >
                {u.url}
              </a>
            </div>
            {u.score > 0 && (
              <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                Score {u.score}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
