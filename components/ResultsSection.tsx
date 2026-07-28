"use client"

import { useState } from 'react';
import { AlertTriangle, Check, Copy, Pencil } from 'lucide-react';
import type {
  CompetitorUrl,
  ExaResult,
  NormalizedKeyword,
  PdfExportData,
  ResultPayload,
  RunInputs,
  ScoredKeyword,
  SerpResult,
  SourceKeyword,
} from '@/lib/types';
import { formatVolume } from '@/lib/format';
import PdfDownloadButton from '@/components/PdfDownloadButton';

interface ResultsSectionProps {
  result: ResultPayload;
  inputs: RunInputs;
  allKeywords: SourceKeyword[];
  variants?: string[];
  competitorUrls?: CompetitorUrl[];
  serpResults?: SerpResult[];
  exaResults?: ExaResult[];
  normalizedKeywords?: NormalizedKeyword[];
  compositeScores?: ScoredKeyword[];
  alignmentScores?: ScoredKeyword[];
  primaryCandidates?: number | null;
  secondaryCandidates?: number | null;
  onResultChange: (result: ResultPayload) => void;
}

function difficultyBadge(d: number | null): { label: string; className: string } {
  if (d === null) return { label: 'KD —', className: 'bg-slate-100 text-slate-500' };
  if (d < 30) return { label: `KD ${d}`, className: 'bg-emerald-100 text-emerald-700' };
  if (d < 60) return { label: `KD ${d}`, className: 'bg-amber-100 text-amber-700' };
  return { label: `KD ${d}`, className: 'bg-rose-100 text-rose-700' };
}

export default function ResultsSection({
  result,
  inputs,
  allKeywords,
  variants = [],
  competitorUrls = [],
  serpResults = [],
  exaResults = [],
  normalizedKeywords = [],
  compositeScores = [],
  alignmentScores = [],
  primaryCandidates = null,
  secondaryCandidates = null,
  onResultChange,
}: ResultsSectionProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState(false);

  function startEdit(id: string, current: string) {
    setEditing(id);
    setDraft(current);
  }

  function commitEdit() {
    if (editing === null) return;
    const value = draft.trim();
    if (value) {
      const idx = Number(editing.slice(2));
      if (editing.startsWith('p-')) {
        const primary = result.primary.map((k, i) => (i === idx ? { ...k, keyword: value } : k));
        onResultChange({ ...result, primary });
      } else {
        const secondary = result.secondary.map((k, i) => (i === idx ? { ...k, keyword: value } : k));
        onResultChange({ ...result, secondary });
      }
    }
    setEditing(null);
    setDraft('');
  }

  function handleEditKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit();
    } else if (e.key === 'Escape') {
      setEditing(null);
      setDraft('');
    }
  }

  async function handleCopy() {
    const lines: string[] = ['Type\tKeyword\tVolume\tDifficulty\tRationale'];
    result.primary.forEach((k) =>
      lines.push(`Primary\t${k.keyword}\t${k.volume ?? ''}\t${k.difficulty ?? ''}\t${(k.rationale ?? '').replace(/\s+/g, ' ')}`)
    );
    result.secondary.forEach((k) => lines.push(`Secondary\t${k.keyword}\t${k.volume ?? ''}\t${k.difficulty ?? ''}\t`));
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — ignore silently.
    }
  }

  const pdfData: PdfExportData = {
    keyword: inputs.keyword,
    intent: inputs.intent,
    client: inputs.client ?? '',
    warning: result.warning ?? null,
    warningType: result.warningType ?? null,
    primary: result.primary,
    secondary: result.secondary,
    allKeywords,
    variants,
    urls: competitorUrls,
    serpResults,
    exaResults,
    normalizedKeywords,
    compositeScores,
    alignmentScores,
  };

  const primaryTotal = primaryCandidates ?? result.primary.length;
  const secondaryTotal = secondaryCandidates ?? result.secondary.length;

  return (
    <section className="animate-rise rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-slate-900">Final results</h2>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-emerald-500" aria-hidden="true" /> Copied!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" aria-hidden="true" /> Copy as table
              </>
            )}
          </button>
          <PdfDownloadButton data={pdfData} />
        </div>
      </div>

      {(result.warning || result.warningType) && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {result.warningType && (
              <span className="mr-2 rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                {result.warningType}
              </span>
            )}
            {result.warning ?? 'The validation pass raised a warning.'}
          </span>
        </div>
      )}

      <div className="mt-5 flex items-center gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Primary Keywords</h3>
        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
          {result.primary.length} / {primaryTotal} selected
        </span>
      </div>
      <div className="mt-2 grid gap-4 sm:grid-cols-2">
        {result.primary.map((k, i) => {
          const id = `p-${i}`;
          const diff = difficultyBadge(k.difficulty);
          return (
            <article key={id} className="rounded-2xl border-2 border-indigo-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                {editing === id ? (
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={handleEditKeyDown}
                    aria-label="Edit keyword"
                    className="w-full rounded-lg border border-indigo-300 px-2 py-1 text-lg font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                ) : (
                  <h4 className="text-lg font-semibold text-slate-900">{k.keyword}</h4>
                )}
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    Primary
                  </span>
                  <button
                    type="button"
                    onClick={() => startEdit(id, k.keyword)}
                    aria-label={`Edit ${k.keyword}`}
                    className="rounded p-1 text-slate-400 hover:text-indigo-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-400">Search Volume</p>
              <p className="text-2xl font-bold text-slate-900">{formatVolume(k.volume)}</p>
              <div className="mt-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${diff.className}`}>{diff.label}</span>
              </div>
              {k.rationale && <p className="mt-3 text-sm leading-relaxed text-slate-600">{k.rationale}</p>}
            </article>
          );
        })}
      </div>

      <div className="mt-6 flex items-center gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Secondary Keywords</h3>
        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
          {result.secondary.length} / {secondaryTotal} selected
        </span>
      </div>
      <div className="mt-2 overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">#</th>
              <th className="px-4 py-2 font-medium">Keyword</th>
              <th className="px-4 py-2 text-right font-medium">Volume</th>
              <th className="px-4 py-2 text-right font-medium">KD</th>
              <th className="px-4 py-2 text-right font-medium">
                <span className="sr-only">Edit</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {result.secondary.map((k, i) => {
              const id = `s-${i}`;
              const diff = difficultyBadge(k.difficulty);
              return (
                <tr key={id}>
                  <td className="px-4 py-2.5 text-slate-400">{i + 1}</td>
                  <td className="px-4 py-2.5">
                    {editing === id ? (
                      <input
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={handleEditKeyDown}
                        aria-label="Edit keyword"
                        className="w-full rounded border border-indigo-300 px-2 py-1 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      />
                    ) : (
                      <span className="text-slate-800">{k.keyword}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-600">{formatVolume(k.volume)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${diff.className}`}>{diff.label}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => startEdit(id, k.keyword)}
                      aria-label={`Edit ${k.keyword}`}
                      className="rounded p-1 text-slate-400 hover:text-indigo-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
