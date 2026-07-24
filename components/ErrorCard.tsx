"use client"

import { AlertOctagon, RotateCcw } from 'lucide-react';

interface ErrorCardProps {
  message: string;
  onRetry: () => void;
}

export default function ErrorCard({ message, onRetry }: ErrorCardProps) {
  return (
    <section className="animate-rise rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center shadow-sm">
      <AlertOctagon className="mx-auto h-8 w-8 text-rose-500" aria-hidden="true" />
      <h2 className="mt-3 text-lg font-semibold text-rose-800">The research run failed</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-rose-700">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        Retry
      </button>
    </section>
  );
}
