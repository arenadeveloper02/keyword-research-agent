"use client"

interface QueryVariantsPanelProps {
  variants: string[];
}

export default function QueryVariantsPanel({ variants }: QueryVariantsPanelProps) {
  if (variants.length === 0) return null;
  return (
    <section className="animate-rise rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Query variants ({variants.length})
      </h2>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {variants.map((variant) => (
          <li key={variant} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
            {variant}
          </li>
        ))}
      </ul>
    </section>
  );
}
