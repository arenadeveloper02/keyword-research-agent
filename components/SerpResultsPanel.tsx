"use client"

import { ExternalLink } from 'lucide-react';
import type { SerpResult } from '@/lib/types';

interface SerpResultsPanelProps {
  results: SerpResult[];
}

export default function SerpResultsPanel({ results }: SerpResultsPanelProps) {
  return (
    <section className="animate-rise rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        SERP Results
        <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">{results.length}</span>
      </h2>
      <p className="mt-0.5 text-xs text-slate-400">Fetched {results.length} competitor SERP entries</p>
      <div className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-slate-100">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Rank</th>
              <th className="px-3 py-2 font-medium">Title</th>
              <th className="px-3 py-2 font-medium">Domain</th>
              <th className="px-3 py-2 text-right font-medium">
                <span className="sr-only">Link</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {results.map((r, i) => (
              <tr key={`${r.url}-${i}`}>
                <td className="px-3 py-1.5 text-slate-400">{r.rank === null ? '—' : r.rank}</td>
                <td className="max-w-[18rem] truncate px-3 py-1.5 text-slate-800">{r.title ?? '—'}</td>
                <td className="px-3 py-1.5 text-slate-500">{r.domain}</td>
                <td className="px-3 py-1.5 text-right">
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${r.domain}`}
                    className="inline-flex rounded p-1 text-indigo-500 hover:text-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
