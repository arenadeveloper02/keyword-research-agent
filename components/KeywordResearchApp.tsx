"use client"

import { useState } from 'react';
import { History, Search } from 'lucide-react';
import KeywordResearchClient from '@/components/KeywordResearchClient';
import HistoryView from '@/components/HistoryView';
import HistoryDetail from '@/components/HistoryDetail';
import type { HistoryEntry } from '@/lib/types';

type AppView = 'generator' | 'history';

// NOTE: The active tab and the currently viewed history entry are in-memory
// React state (useState) only — they reset on page reload. History entries
// themselves are loaded from the backend (Arena history workflow + saved runs
// API), so past runs persist across sessions.
export default function KeywordResearchApp() {
  const [view, setView] = useState<AppView>('generator');
  const [selected, setSelected] = useState<HistoryEntry | null>(null);

  const tabClass = (active: boolean): string =>
    `inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
      active ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-indigo-700'
    }`;

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-center px-4 pt-6">
        <div className="inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm" role="tablist" aria-label="App view">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'generator'}
            onClick={() => setView('generator')}
            className={tabClass(view === 'generator')}
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            Generator
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'history'}
            onClick={() => setView('history')}
            className={tabClass(view === 'history')}
          >
            <History className="h-4 w-4" aria-hidden="true" />
            History
          </button>
        </div>
      </div>

      {/* Keep the generator mounted so an in-progress streaming run continues while History is open. */}
      <div className={view === 'generator' ? '' : 'hidden'}>
        <KeywordResearchClient />
      </div>

      {view === 'history' &&
        (selected ? (
          <HistoryDetail entry={selected} onBack={() => setSelected(null)} />
        ) : (
          <HistoryView onView={(entry) => setSelected(entry)} />
        ))}
    </div>
  );
}
