"use client"

import { useState } from 'react';
import { AlertTriangle, ArrowLeft, Check, Clock, Copy } from 'lucide-react';
import type { HistoryEntry, Intent, PdfExportData, ResultPayload } from '@/lib/types';
import { formatDateTime, formatVolume } from '@/lib/format';
import { copyResultTable } from '@/lib/copy-table';
import QueryVariantsPanel from '@/components/QueryVariantsPanel';
import CompetitorUrlsPanel from '@/components/CompetitorUrlsPanel';
import DedupKeywordsPanel from '@/components/DedupKeywordsPanel';
import CompositeScoringPanel from '@/components/CompositeScoringPanel';
import AlignmentScoresPanel from '@/components/AlignmentScoresPanel';
import SourceKeywordsPanel from '@/components/SourceKeywordsPanel';
import PdfDownloadButton from '@/components/PdfDownloadButton';

interface HistoryDetailProps {
  entry: HistoryEntry;
  onBack: () => void;
}

// Read-only view of a past run, mirroring the generator output sections in
// order: Query Variants, URL Scoring, Deduplicated & Normalized Keywords,
// Composite Scoring, Alignment Scores, All Source Keywords, then Final results.
// No editing is allowed here — the generator view remains the only place
// results can be edited. Copy-as-table and PDF download ARE available so past
// runs can be exported the same way as fresh ones.
export default function HistoryDetail({ entry, onBack }: HistoryDetailProps) {
  const [copied, setCopied] = useState(false);
  const full = entry.fullOutput;
  const result: ResultPayload | null = full
    ? {
        primary: full.primary,
        secondary: full.secondary,
        warning: full.warning ?? null,
        warningType: full.warningType ?? null,
      }
    : entry.output;
  const intentValue: Intent = entry.intent === 'informational' ? 'informational' : 'commercial';

  const pdfData: PdfExportData | null = result
    ? {
        keyword: entry.keyword,
        intent: entry.intent || intentValue,
        client: entry.client,
        warning: result.warning ?? null,
        warningType: result.warningType ?? null,
        primary: result.primary,
        secondary: result.secondary,
        allKeywords: full?.allKeywords ?? [],
        variants: full?.variants ?? [],
        urls: full?.urls ?? [],
        serpResults: full?.serpResults ?? [],
        normalizedKeywords: full?.normalizedKeywords ?? [],
        compositeCandidates: full?.compositeCandidates ?? [],
        alignmentScores: full?.alignmentScores ?? [],
      }
    : null;

  async function handleCopy() {
    if (!result) return;
    const ok = await copyResultTable(result);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to history
      </button>

      <section className="animate-rise rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{entry.keyword}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {entry.client ? `Client: ${entry.client}` : 'No client specified'}
              {entry.intent ? ` \u00b7 Intent: ${entry.intent}` : ''}
            </p>
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-400">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {formatDateTime(entry.createdAt)}
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Read-only
          </span>
        </div>
      </section>

      {full?.variants && full.variants.length > 0 && (
        <QueryVariantsPanel seedKeyword={entry.keyword} intent={intentValue} variants={full.variants} done />
      )}

      {full?.urls && full.urls.length > 0 && (
        <CompetitorUrlsPanel urls={full.urls} done candidateCount={null} />
      )}

      {full?.normalizedKeywords && full.normalizedKeywords.length > 0 && (
        <DedupKeywordsPanel keywords={full.normalizedKeywords} />
      )}

      {full?.compositeCandidates && full.compositeCandidates.length > 0 && (
        <CompositeScoringPanel candidates={full.compositeCandidates} />
      )}

      {full?.alignmentScores && full.alignmentScores.length > 0 && (
        <AlignmentScoresPanel rows={full.alignmentScores} />
      )}

      {full?.allKeywords && full.allKeywords.length > 0 && (
        <SourceKeywordsPanel keywords={full.allKeywords} />
      )}

      <section className="animate-rise rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-slate-900">Final results</h2>
          {result !== null && (
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
          )}
        </div>

        {result === null ? (
          <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
            The full output for this run is not available.
          </p>
        ) : (
          <>
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

            <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-slate-500">Primary Keywords</h3>
            {result.primary.length === 0 ? (
              <p className="mt-2 text-sm text-slate-400">No primary keywords recorded for this run.</p>
            ) : (
              <div className="mt-2 grid gap-4 sm:grid-cols-2">
                {result.primary.map((k, i) => (
                  <article key={`p-${i}`} className="rounded-2xl border-2 border-indigo-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <h4 className="text-lg font-semibold text-slate-900">{k.keyword}</h4>
                      <span className="shrink-0 rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                        Primary
                      </span>
                    </div>
                    <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-400">Search Volume</p>
                    <p className="text-2xl font-bold text-slate-900">{formatVolume(k.volume)}</p>
                    {k.rationale && <p className="mt-3 text-sm leading-relaxed text-slate-600">{k.rationale}</p>}
                  </article>
                ))}
              </div>
            )}

            <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">Secondary Keywords</h3>
            {result.secondary.length === 0 ? (
              <p className="mt-2 text-sm text-slate-400">No secondary keywords recorded for this run.</p>
            ) : (
              <div className="mt-2 overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">#</th>
                      <th className="px-4 py-2 font-medium">Keyword</th>
                      <th className="px-4 py-2 text-right font-medium">Volume</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {result.secondary.map((k, i) => (
                      <tr key={`s-${i}`}>
                        <td className="px-4 py-2.5 text-slate-400">{i + 1}</td>
                        <td className="px-4 py-2.5 text-slate-800">{k.keyword}</td>
                        <td className="px-4 py-2.5 text-right text-slate-600">{formatVolume(k.volume)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
