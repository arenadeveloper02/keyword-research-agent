"use client"

import { Check, Loader2, Star } from 'lucide-react';
import type { Intent } from '@/lib/types';

interface QueryVariantsPanelProps {
  seedKeyword: string;
  intent: Intent;
  variants: string[];
  done: boolean;
}

export default function QueryVariantsPanel({ seedKeyword, intent, variants, done }: QueryVariantsPanelProps) {
  return (
    <section className="animate-rise rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Query Variants</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Generated {variants.length} {intent} query variants
          </p>
        </div>
        {done ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
            <Check className="h-3 w-3" aria-hidden="true" /> Done
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-600">
            <Loader2 className="h-3 w-3 motion-safe:animate-spin" aria-hidden="true" /> Working
          </span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {seedKeyword && (
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white">
            <Star className="h-3 w-3 fill-current" aria-hidden="true" />
            {seedKeyword}
          </span>
        )}
        {variants.map((variant) => (
          <span key={variant} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
            {variant}
          </span>
        ))}
      </div>
    </section>
  );
}
