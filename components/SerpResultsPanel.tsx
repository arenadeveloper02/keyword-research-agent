"use client"

import type { SerpResult } from '@/lib/types';

interface SerpResultsPanelProps {
  results: SerpResult[];
}

export default function SerpResultsPanel({ results }: SerpResultsPanelProps) {
  if (results.length === 0) return null;
  return (
    <section className="animate-rise rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        SERP results ({results.length})
      </h2>
      <div className="mt-3 max-h-80 overflow-auto rounded-xl border border-slate-100">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">#</th>
              <th className="px-4 py-2 font-medium">Title</th>
              <th className="px-4 py-2 font-medium">Domain</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {results.map((r, i) => (
              <tr key={`${r.url}-${i}`}>
                <td className="px-4 py-2 text-slate-400">{r.rank ?? i + 1}</td>
                <td className="px-4 py-2">
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-600 hover:text-indigo-800"
                  >
                    {r.title ?? r.url}
                  </a>
                </td>
                <td className="px-4 py-2 text-slate-500">{r.domain}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
