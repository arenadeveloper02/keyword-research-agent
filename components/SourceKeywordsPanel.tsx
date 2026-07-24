"use client"

import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { SourceKeyword } from '@/lib/types';

interface SourceKeywordsPanelProps {
  keywords: SourceKeyword[];
}

const fmt = (n: number | null): string => (n === null ? '—' : n.toLocaleString());

export default function SourceKeywordsPanel({ keywords }: SourceKeywordsPanelProps) {
  const [open, setOpen] = useState(true);

  const tiers = useMemo(() => {
    const byVolume = (a: SourceKeyword, b: SourceKeyword) => (b.volume ?? -1) - (a.volume ?? -1);
    return [
      { name: 'Core', description: 'Found on 3+ competitor URLs', rows: keywords.filter((k) => k.urlFrequency >= 3).sort(byVolume) },
      { name: 'Relevant', description: 'Found on 2 competitor URLs', rows: keywords.filter((k) => k.urlFrequency === 2).sort(byVolume) },
      { name: 'Discovery', description: 'Found on 1 competitor URL', rows: keywords.filter((k) => k.urlFrequency <= 1).sort(byVolume) },
    ];
  }, [keywords]);

  return (
    <section className="animate-rise rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-2xl px-5 py-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <span className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          All source keywords
          <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">{keywords.length}</span>
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="space-y-5 border-t border-slate-100 px-5 py-4">
          {tiers.map((tier) => (
            <div key={tier.name}>
              <div className="flex items-baseline gap-2">
                <h3 className="text-sm font-semibold text-slate-800">{tier.name}</h3>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{tier.rows.length}</span>
                <span className="text-xs text-slate-400">{tier.description}</span>
              </div>
              {tier.rows.length === 0 ? (
                <p className="mt-1.5 text-xs text-slate-400">No keywords in this tier yet.</p>
              ) : (
                <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-slate-100">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-medium">Keyword</th>
                        <th className="px-3 py-2 text-right font-medium">Volume</th>
                        <th className="px-3 py-2 text-right font-medium">Difficulty</th>
                        <th className="px-3 py-2 text-right font-medium">URL freq.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {tier.rows.map((k) => (
                        <tr key={`${tier.name}-${k.keyword}`}>
                          <td className="px-3 py-1.5 text-slate-800">{k.keyword}</td>
                          <td className="px-3 py-1.5 text-right text-slate-500">{fmt(k.volume)}</td>
                          <td className="px-3 py-1.5 text-right text-slate-500">{fmt(k.difficulty)}</td>
                          <td className="px-3 py-1.5 text-right text-slate-500">{k.urlFrequency}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
