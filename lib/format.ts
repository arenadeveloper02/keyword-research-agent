export function formatVolume(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '\u2014';
  return n.toLocaleString('en-US');
}

export function formatVolumeCompact(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '\u2014';
  if (n >= 1000) {
    const k = Math.round((n / 1000) * 10) / 10;
    return `${k.toFixed(1)}k`;
  }
  return n.toLocaleString('en-US');
}

export function formatDateTime(value: string | Date | null): string {
  if (value === null) return '\u2014';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return typeof value === 'string' ? value : '\u2014';
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
