"use client"

import { useState } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import type { PdfExportData } from '@/lib/types';
import { generateKeywordPdf } from '@/lib/pdf';

interface PdfDownloadButtonProps {
  data: PdfExportData | null;
}

export default function PdfDownloadButton({ data }: PdfDownloadButtonProps) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disabled = data === null;

  async function handleClick() {
    if (!data || generating) return;
    setGenerating(true);
    setError(null);
    try {
      await generateKeywordPdf(data);
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') console.warn('PDF generation failed', err);
      setError('Could not generate PDF, please try again');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || generating}
        title={disabled ? 'Available once results are ready.' : 'Download the full report as a PDF'}
        className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-sm font-medium text-indigo-700 shadow-sm transition hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {generating ? (
          <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
        ) : (
          <FileDown className="h-4 w-4" aria-hidden="true" />
        )}
        {generating ? 'Generating…' : 'Download as PDF'}
      </button>
      {error && (
        <p role="alert" className="text-xs text-rose-600">
          {error}
        </p>
      )}
    </div>
  );
}
