"use client"

import { Loader2, RotateCcw, Search, XCircle } from 'lucide-react';
import type { Intent } from '@/lib/types';

interface ResearchFormProps {
  keyword: string;
  intent: Intent;
  client: string;
  running: boolean;
  initError: string | null;
  onKeywordChange: (value: string) => void;
  onIntentChange: (value: Intent) => void;
  onClientChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onReset: () => void;
}

const INTENT_CARDS: { value: Intent; title: string; description: string }[] = [
  { value: 'commercial', title: 'Commercial / Transactional', description: 'Service pages, pricing, booking' },
  { value: 'informational', title: 'Informational / Educational', description: 'Guides, FAQs, how-to content' },
];

export default function ResearchForm({
  keyword,
  intent,
  client,
  running,
  initError,
  onKeywordChange,
  onIntentChange,
  onClientChange,
  onSubmit,
  onCancel,
  onReset,
}: ResearchFormProps) {
  return (
    <form
      className="mx-auto w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        if (!running) onSubmit();
      }}
    >
      <div className="space-y-5">
        <div>
          <label htmlFor="seed-keyword" className="block text-sm font-medium text-slate-700">
            Seed Keyword <span className="text-rose-500">*</span>
          </label>
          <input
            id="seed-keyword"
            type="text"
            value={keyword}
            onChange={(e) => onKeywordChange(e.target.value)}
            disabled={running}
            required
            placeholder="e.g. project management software"
            className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-50 disabled:text-slate-400"
          />
        </div>

        <div>
          <span className="block text-sm font-medium text-slate-700">Page Intent</span>
          <div className="mt-1.5 grid gap-3 sm:grid-cols-2" role="group" aria-label="Page intent">
            {INTENT_CARDS.map((card) => {
              const selected = intent === card.value;
              return (
                <button
                  key={card.value}
                  type="button"
                  disabled={running}
                  onClick={() => onIntentChange(card.value)}
                  aria-pressed={selected}
                  className={`rounded-xl border p-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                    selected
                      ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  } ${running ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  <span className={`block text-sm font-semibold ${selected ? 'text-indigo-700' : 'text-slate-800'}`}>
                    {card.title}
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">{card.description}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label htmlFor="client-brand" className="block text-sm font-medium text-slate-700">
            Client / brand <span className="text-slate-400">(optional)</span>
          </label>
          <input
            id="client-brand"
            type="text"
            value={client}
            onChange={(e) => onClientChange(e.target.value)}
            disabled={running}
            placeholder="e.g. Acme Corp"
            className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-50 disabled:text-slate-400"
          />
        </div>

        {initError && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {initError}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={running || keyword.trim().length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? (
              <>
                <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
                Researching…
              </>
            ) : (
              <>
                <Search className="h-4 w-4" aria-hidden="true" />
                Start Research
              </>
            )}
          </button>
          {running ? (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              <XCircle className="h-4 w-4" aria-hidden="true" />
              Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Reset
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
