import type { ResultPayload } from '@/lib/types';

function cleanCell(value: string): string {
  return value.replace(/[\t\r\n]+/g, ' ').trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Builds the rows for the copyable results table: a header row followed by
// primary then secondary keywords. Cells are cleaned of tabs/newlines so the
// TSV structure survives pasting into Google Sheets / Excel.
export function buildResultTableRows(result: ResultPayload): string[][] {
  const rows: string[][] = [['Type', 'Keyword', 'Volume', 'Rationale']];
  result.primary.forEach((k) =>
    rows.push([
      'Primary',
      cleanCell(k.keyword),
      k.volume === null ? '' : String(k.volume),
      cleanCell(k.rationale ?? ''),
    ])
  );
  result.secondary.forEach((k) =>
    rows.push(['Secondary', cleanCell(k.keyword), k.volume === null ? '' : String(k.volume), ''])
  );
  return rows;
}

export function buildResultTsv(rows: string[][]): string {
  return rows.map((r) => r.join('\t')).join('\r\n');
}

export function buildResultHtml(rows: string[][]): string {
  const [head, ...body] = rows;
  const th = head
    .map(
      (c) =>
        `<th style="text-align:left;font-weight:bold;border:1px solid #cccccc;padding:4px 8px;">${escapeHtml(c)}</th>`
    )
    .join('');
  const trs = body
    .map(
      (r) =>
        `<tr>${r
          .map((c) => `<td style="border:1px solid #cccccc;padding:4px 8px;">${escapeHtml(c)}</td>`)
          .join('')}</tr>`
    )
    .join('');
  return `<table style="border-collapse:collapse;"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
}

// Copies the final results as BOTH text/plain (TSV) and text/html (a real
// <table>). Google Sheets and Excel prefer the HTML flavor, which pastes as a
// properly formatted table; the TSV flavor is the universal fallback.
export async function copyResultTable(result: ResultPayload): Promise<boolean> {
  const rows = buildResultTableRows(result);
  const tsv = buildResultTsv(rows);
  const html = buildResultHtml(rows);
  try {
    if (
      typeof ClipboardItem !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      navigator.clipboard &&
      typeof navigator.clipboard.write === 'function'
    ) {
      const item = new ClipboardItem({
        'text/plain': new Blob([tsv], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' }),
      });
      await navigator.clipboard.write([item]);
      return true;
    }
    await navigator.clipboard.writeText(tsv);
    return true;
  } catch {
    // Rich clipboard write can be blocked (permissions / older browsers) —
    // fall back to the plain TSV which still pastes as columns in Sheets/Excel.
    try {
      await navigator.clipboard.writeText(tsv);
      return true;
    } catch {
      return false;
    }
  }
}
