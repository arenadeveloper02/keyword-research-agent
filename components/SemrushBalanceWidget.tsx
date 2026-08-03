"use client"

import { useEffect, useState } from 'react';
import { Coins } from 'lucide-react';

export default function SemrushBalanceWidget() {
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/semrush/balance');
        if (!res.ok) return;
        const data = (await res.json()) as Record<string, unknown>;
        const candidates = [data.balance, data.units, data.unitsLeft, data.apiUnits];
        for (const c of candidates) {
          const n = typeof c === 'number' ? c : typeof c === 'string' && c !== '' ? Number(c) : NaN;
          if (Number.isFinite(n)) {
            if (!cancelled) setBalance(n);
            return;
          }
        }
      } catch {
        // widget is best-effort — render nothing on failure
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (balance === null) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
      <Coins className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
      SEMrush units: {balance.toLocaleString()}
    </span>
  );
}
