export function formatVolume(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US');
}

export function formatVolumeCompact(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—';
  if (n >= 1000) {
    const k = Math.round((n / 1000) * 10) / 10;
    return `${k.toFixed(1)}k`;
  }
  return n.toLocaleString('en-US');
}
