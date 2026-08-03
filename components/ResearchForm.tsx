"use client"

import { useState } from 'react';
import type { FormEvent } from 'react';
import { Loader2, Search } from 'lucide-react';
import type { Intent, RunInputs } from '@/lib/types';

interface ResearchFormProps {
  onSubmit: (inputs: RunInputs) => void;
  loading: boolean;
}

export default function ResearchForm({ onSubmit, loading }: ResearchFormProps) {
  const [keyword, setKeyword] = useState('');
  const [intent, setIntent] = useState<Intent>('commercial');
  const [client, setClient] = useState('');

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = keyword.trim();
    if (!trimmed || loading) return;
    const trimmedClient = client.trim();
    onSubmit({
      keyword: trimmed,
      intent,
      client: trimmedClient.length > 0 ? trimmedClient : undefined,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="animate-rise rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="seed-keyword"
            className="text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            Seed keyword
          </label>
          <input
            id="seed-keyword"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="e.g. project management software"
            required
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="search-intent"
            className="text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            Search intent
          </label>
          <select
            id="search-intent"
            value={intent}
            onChange={(e) =>
              setIntent(e.target.value === 'informational' ? 'informational' : 'commercial')
            }
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            <option value="commercial">Commercial</option>
            <option value="informational">Informational</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="client-name"
            className="text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            Client (optional)
          </label>
          <input
            id="client-name"
            value={client}
            onChange={(e) => setClient(e.target.value)}
            placeholder="Client or project name"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={loading || keyword.trim().length === 0}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
            Researching…
          </>
        ) : (
          <>
            <Search className="h-4 w-4" aria-hidden="true" />
            Run research
          </>
        )}
      </button>
    </form>
  );
}
