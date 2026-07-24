"use client"

import { useState } from 'react';
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import type { Stage, StageStatus } from '@/lib/types';

interface ProgressTrackerProps {
  stages: Record<Stage, StageStatus>;
  variants: string[];
}

const STEPS: { key: Stage; label: string }[] = [
  { key: 'variants', label: 'Expanding your keyword' },
  { key: 'search', label: 'Searching competitor SERPs' },
  { key: 'url_scoring', label: 'Scoring competitor pages' },
  { key: 'semrush', label: 'Pulling ranking keywords' },
  { key: 'analysis', label: 'Analyzing keyword alignment' },
  { key: 'scoring', label: 'Building the shortlist' },
  { key: 'validation', label: 'Validating results' },
];

export default function ProgressTracker({ stages, variants }: ProgressTrackerProps) {
  const [showVariants, setShowVariants] = useState(false);

  return (
    <section className="animate-rise rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Pipeline progress</h2>
      <ol className="mt-4 flex flex-col gap-3 md:flex-row md:items-start md:gap-2">
        {STEPS.map((step, index) => {
          const state = stages[step.key];
          return (
            <li key={step.key} className="flex items-center gap-2.5 md:flex-1 md:flex-col md:text-center">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                  state === 'done'
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : state === 'active'
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-600'
                      : 'border-slate-200 bg-slate-50 text-slate-400'
                }`}
              >
                {state === 'done' ? (
                  <Check className="h-4 w-4" aria-hidden="true" />
                ) : state === 'active' ? (
                  <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
                ) : (
                  index + 1
                )}
              </span>
              <span
                className={`text-xs md:mt-1 ${
                  state === 'pending' ? 'text-slate-400' : state === 'active' ? 'font-medium text-indigo-700' : 'text-slate-700'
                }`}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
      {variants.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={() => setShowVariants((v) => !v)}
            aria-expanded={showVariants}
            className="flex items-center gap-1.5 rounded text-xs font-medium text-indigo-600 hover:text-indigo-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showVariants ? 'rotate-180' : ''}`} aria-hidden="true" />
            What we searched ({variants.length} query variants)
          </button>
          {showVariants && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {variants.map((variant) => (
                <li key={variant} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                  {variant}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
