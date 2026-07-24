"use client"

import { useEffect, useState } from 'react';
import { Gauge } from 'lucide-react';

interface SemrushBalanceWidgetProps {
  refreshSignal: number;
}

export default function SemrushBalanceWidget({ refreshSignal }: SemrushBalanceWidgetProps) {
  const [units, setUnits] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/semrush/balance');
        if (!res.ok) {
          if (!cancelled) setUnits(null);
          return;
        }
        const data = (await res.json()) as { units?: unknown };
        if (!cancelled) {
          setUnits(typeof data.units === 'number' && Number.isFinite(data.units) ? data.units : null);
        }
      } catch {
        if (!cancelled) setUnits(null);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [refreshSignal]);

  return (
    <div className="inline-flex items-center gap-2 self-start rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 shadow-sm">
      <Gauge className="h-3.5 w-3.5 text-indigo-500" aria-hidden="true" />
      <span className="font-medium">SEMrush units:</span>
      <span>{units === null ? '—' : units.toLocaleString()}</span>
    </div>
  );
}
