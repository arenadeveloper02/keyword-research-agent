"use client"

import { useEffect, useState } from 'react';
import { Clock, Eye, History, Loader2 } from 'lucide-react';
import type { HistoryEntry } from '@/lib/types';
import { coerceHistoryEntries } from '@/lib/history';
import { formatDateTime } from '@/lib/format';

interface HistoryViewProps {
  onView: (entry: HistoryEntry) => void;
}

// History entries are loaded from the backend on each visit to the tab. The
// selected/list state itself is in-memory React state and resets on reload;
// past runs persist because they come from the Arena history workflow and the
// saved-runs database API.
export default function HistoryView({ onView }: HistoryViewProps) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [histRes, runsRes] = await Promise.allSettled([
          fetch('/api/keyword-research/history'),
          fetch('/api/runs?tool=keyword-research&limit=20'),
        ]);
        const collected: HistoryEntry[] = [];
        if (histRes.status === 'fulfilled' && histRes.value.ok) {
          const data = (await histRes.value.json()) as { entries?: unknown };
          collected.push(...coerceHistoryEntries(data.entries));
        }
        if (runsRes.status === 'fulfilled' && runsRes.value.ok) {
          const data = (await runsRes.value.json()) as { runs?: unknown };
          collected.push(...coerceHistoryEntries(data.runs));
        }
        // Dedupe near-identical entries (same keyword + minute), preferring the
        // one that carries a full output payload.
        const map = new Map<string, HistoryEntry>();
        for (const e of collected) {
          const key = `${e.keyword.toLowerCase()}|${e.createdAt ? e.createdAt.slice(0, 16) : ''}`;
          const existing = map.get(key);
          if (!existing || (existing.output === null && e.output !== null)) {
            map.set(key, e);
          }
        }
        const sorted = Array.from(map.values()).sort((a, b) => {
          const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return tb - ta;
        });
        if (!cancelled) {
          setEntries(sorted);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setEntries([]);
          setError('Could not load history right now.');
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (entries === null) {
    return (
      <div className="mx-auto flex w-full max-w-5xl items-center justify-center px-4 py-16 text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 motion-safe:animate-spin" aria-hidden="true" />
        <span className="text-sm">Loading history\u2026</span>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-6">
        {error && (
          <p role="alert" className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}
        <section className="animate-rise rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
          <History className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
          <p className="mt-3 text-sm text-slate-500">
            No previous runs yet \u2014 generate your first recommendation to see it here.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        History
        <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">{entries.length}</span>
      </h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {entries.map((entry) => (
          <article key={entry.id} className="animate-rise flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold text-slate-900">{entry.keyword}</h3>
              {entry.intent && (
                <span className="shrink-0 rounded-full bg-indigo-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-600">
                  {entry.intent}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">{entry.client ? `Client: ${entry.client}` : 'No client specified'}</p>
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-400">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {formatDateTime(entry.createdAt)}
            </p>
            {entry.preview && (
              <p className="mt-2 truncate text-sm text-slate-600">
                <span className="font-medium text-slate-500">Top pick:</span> {entry.preview}
              </p>
            )}
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => onView(entry)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-sm font-medium text-indigo-700 shadow-sm transition hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                <Eye className="h-4 w-4" aria-hidden="true" />
                View
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
