"use client"

import { ExternalLink } from 'lucide-react';
import type { ExaResult } from '@/lib/types';

interface ExaResearchPanelProps {
  results: ExaResult[];
}

export default function ExaResearchPanel({ results }: ExaResearchPanelProps) {
  return (
    <section className="animate-rise rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Exa Research
        <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">{results.length}</span>
      </h2>
      <p className="mt-0.5 text-xs text-slate-400">Supplementary research results from Exa</p>
      <ul className="mt-3 space-y-3">
        {results.map((r, i) => (
          <li key={`${r.url}-${i}`} className="rounded-xl border border-slate-100 p-4">
            <a
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex max-w-full items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800"
            >
              <span className="truncate">{r.title ?? r.url}</span>
              <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
            </a>
            <p className="mt-0.5 truncate text-xs text-slate-400">{r.url}</p>
            {r.snippet && <p className="mt-2 text-xs leading-relaxed text-slate-600">{r.snippet}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
