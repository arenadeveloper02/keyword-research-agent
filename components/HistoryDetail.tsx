"use client"

import { AlertTriangle, ArrowLeft } from 'lucide-react';
import type { HistoryEntry, PdfExportData } from '@/lib/types';
import { formatVolume } from '@/lib/format';
import PdfDownloadButton from '@/components/PdfDownloadButton';
import QueryVariantsPanel from '@/components/QueryVariantsPanel';
import SerpResultsPanel from '@/components/SerpResultsPanel';
import CompetitorUrlsPanel from '@/components/CompetitorUrlsPanel';
import SemrushKeywordsPanel from '@/components/SemrushKeywordsPanel';
import DedupKeywordsPanel from '@/components/DedupKeywordsPanel';
import CompositeScoringPanel from '@/components/CompositeScoringPanel';
import AlignmentScoresPanel from '@/components/AlignmentScoresPanel';
import SourceKeywordsPanel from '@/components/SourceKeywordsPanel';

interface HistoryDetailProps {
  entry: HistoryEntry;
  onBack: () => void;
}

export default function HistoryDetail({ entry, onBack }: HistoryDetailProps) {
  const full = entry.fullOutput;
  const primary = full?.primary ?? entry.output?.primary ?? [];
  const secondary = full?.secondary ?? entry.output?.secondary ?? [];
  const warning = full?.warning ?? entry.output?.warning ?? null;
  const warningType = full?.warningType ?? entry.output?.warningType ?? null;
  const created = entry.createdAt ? new Date(entry.createdAt) : null;
  const createdLabel = created && !Number.isNaN(created.getTime()) ? created.toLocaleString() : null;

  const pdfData: PdfExportData = {
    keyword: entry.keyword,
    intent: entry.intent,
    client: entry.client,
    warning,
    warningType,
    primary,
    secondary,
    allKeywords: full?.allKeywords ?? [],
    variants: full?.variants ?? [],
    urls: full?.urls ?? [],
    serpResults: full?.serpResults ?? [],
    normalizedKeywords: full?.normalizedKeywords ?? [],
    compositeCandidates: full?.compositeCandidates ?? [],
    alignmentScores: full?.alignmentScores ?? [],
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to history
        </button>
        {(primary.length > 0 || secondary.length > 0) && <PdfDownloadButton data={pdfData} />}
      </div>

      <section className="animate-rise rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">{entry.keyword}</h1>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
          {entry.intent && <span className="rounded-full bg-slate-100 px-2.5 py-1">Intent: {entry.intent}</span>}
          {entry.client && <span className="rounded-full bg-slate-100 px-2.5 py-1">Client: {entry.client}</span>}
          {createdLabel && <span className="rounded-full bg-slate-100 px-2.5 py-1">{createdLabel}</span>}
        </div>

        {(warning || warningType) && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {warningType && (
                <span className="mr-2 rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                  {warningType}
                </span>
              )}
              {warning ?? 'The validation pass raised a warning.'}
            </span>
          </div>
        )}

        {primary.length > 0 && (
          <>
            <h2 className="mt-5 text-sm font-semibold uppercase tracking-wide text-slate-500">Primary Keywords</h2>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              {primary.map((k, i) => (
                <article
                  key={`p-${i}-${k.keyword}`}
                  className="rounded-2xl border-2 border-indigo-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-lg font-semibold text-slate-900">{k.keyword}</h3>
                    <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                      Primary
                    </span>
                  </div>
                  <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-400">Search Volume</p>
                  <p className="text-2xl font-bold text-slate-900">{formatVolume(k.volume)}</p>
                  {k.rationale && <p className="mt-3 text-sm leading-relaxed text-slate-600">{k.rationale}</p>}
                </article>
              ))}
            </div>
          </>
        )}

        {secondary.length > 0 && (
          <>
            <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">Secondary Keywords</h2>
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
                  {secondary.map((k, i) => (
                    <tr key={`s-${i}-${k.keyword}`}>
                      <td className="px-4 py-2.5 text-slate-400">{i + 1}</td>
                      <td className="px-4 py-2.5 text-slate-800">{k.keyword}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{formatVolume(k.volume)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {full?.variants && full.variants.length > 0 && <QueryVariantsPanel variants={full.variants} />}
      {full?.serpResults && full.serpResults.length > 0 && <SerpResultsPanel results={full.serpResults} />}
      {full?.urls && full.urls.length > 0 && <CompetitorUrlsPanel urls={full.urls} />}
      {full?.urls && full.urls.some((u) => (u.keywordsFound?.length ?? 0) > 0) && (
        <SemrushKeywordsPanel urls={full.urls} />
      )}
      {full?.normalizedKeywords && full.normalizedKeywords.length > 0 && (
        <DedupKeywordsPanel keywords={full.normalizedKeywords} />
      )}
      {full?.compositeCandidates && full.compositeCandidates.length > 0 && (
        <CompositeScoringPanel candidates={full.compositeCandidates} />
      )}
      {full?.alignmentScores && full.alignmentScores.length > 0 && (
        <AlignmentScoresPanel scores={full.alignmentScores} />
      )}
      {full?.allKeywords && full.allKeywords.length > 0 && (
        <SourceKeywordsPanel keywords={full.allKeywords} />
      )}
    </main>
  );
}
