import type { PdfExportData, SourceKeyword } from '@/lib/types';

// ─── PDF generation method ───────────────────────────────────────────────────
// This app draws the PDF directly with jsPDF + jspdf-autotable (a manual PDF
// layout engine) — it does NOT screenshot the DOM (html2canvas) or use a
// headless browser. That means the PDF tables are re-laid-out by autotable's
// own engine, and the previous implementation let it AUTO-SIZE every column
// (the equivalent of `table-layout: auto`). Column widths were recalculated
// per table and per page from cell content, so widths shifted between
// sections/pages and no columns carried the UI's right-alignment for numeric
// cells. Root causes fixed here:
//   1. Auto column sizing → now every table declares explicit fixed column
//      widths as fractions of the content width (table-layout: fixed parity).
//   2. Missing per-column alignment → numeric columns (Volume, CPC, Position,
//      Score, Alignment, URL Frequency) are right-aligned in body AND header,
//      exactly like the on-screen `text-right` cells.
//   3. Page-break tearing → rowPageBreak: 'avoid' keeps rows intact (never
//      split mid-row/mid-cell) and showHead: 'everyPage' repeats the header
//      row after each break, like a sticky header.
//   4. Styling drift → header fill/text, row divider color, cell padding and
//      font size now mirror the UI table styles (slate-50 header, slate-500
//      header text, slate-800 body text, slate-100 dividers, px-4/py-2-ish
//      padding), so borders/padding/alignment match the live tables.
// A headless-Chromium (Puppeteer/Playwright) render would give true pixel
// parity, but it requires a server rendering dependency; with fixed widths +
// explicit alignment autotable is deterministic and matches the UI reliably.
// ─────────────────────────────────────────────────────────────────────────────

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getFinalY(doc: unknown, fallback: number): number {
  const table = (doc as { lastAutoTable?: { finalY?: number } }).lastAutoTable;
  return typeof table?.finalY === 'number' ? table.finalY : fallback;
}

// UI-parity table colors (the app's remapped Tailwind slate scale — see tailwind.config.ts).
const HEAD_FILL: [number, number, number] = [247, 248, 249]; // slate-50 header background
const HEAD_TEXT: [number, number, number] = [133, 137, 151]; // slate-500 header text
const BODY_TEXT: [number, number, number] = [65, 68, 77]; // slate-800 body text
const GRID_LINE: [number, number, number] = [239, 240, 242]; // slate-100 row dividers

interface UiColumn {
  header: string;
  // Fraction of the available content width. Fractions per table sum to 1, so
  // every column has an explicit fixed width — the PDF equivalent of
  // `table-layout: fixed` with per-column widths. Widths never recalculate
  // between pages or shift based on cell content.
  fraction: number;
  align?: 'left' | 'right';
}

export async function generateKeywordPdf(data: PdfExportData): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const fmt = (n: number | null): string => (n === null ? '—' : n.toLocaleString('en-US'));
  const fmtScore = (n: number | null): string =>
    n === null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const fmtCpc = (n: number | null): string =>
    n === null ? '—' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const ensureSpace = (needed: number): void => {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  // Shared UI-parity table renderer. Every table in the report goes through
  // this so column widths, alignment, borders, padding and page-break behavior
  // are identical to the on-screen tables:
  //   - explicit fixed column widths (no auto re-measuring / shifting)
  //   - numeric columns right-aligned in header AND body (matches text-right)
  //   - slate-50 header / slate-100 dividers / slate-800 text (matches UI)
  //   - rows never break mid-row across pages; header repeats on every page
  const drawUiTable = (opts: { startY: number; columns: UiColumn[]; body: string[][] }): number => {
    const columnStyles: Record<number, { cellWidth: number; halign: 'left' | 'right' }> = {};
    opts.columns.forEach((c, i) => {
      columnStyles[i] = {
        cellWidth: Math.floor(contentWidth * c.fraction * 100) / 100,
        halign: c.align ?? 'left',
      };
    });
    autoTable(doc, {
      startY: opts.startY,
      margin: { left: margin, right: margin },
      tableWidth: contentWidth,
      head: [opts.columns.map((c) => c.header.toUpperCase())],
      body: opts.body,
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 8,
        cellPadding: { top: 5, right: 8, bottom: 5, left: 8 },
        overflow: 'linebreak',
        valign: 'middle',
        textColor: BODY_TEXT,
        lineColor: GRID_LINE,
        lineWidth: 0.5,
      },
      headStyles: {
        fillColor: HEAD_FILL,
        textColor: HEAD_TEXT,
        fontStyle: 'bold',
        fontSize: 7.5,
      },
      columnStyles,
      // Never split a row across a page boundary (mid-row/mid-cell tearing).
      rowPageBreak: 'avoid',
      // Repeat the header row after every page break (sticky-header parity).
      showHead: 'everyPage',
      didParseCell: (hook) => {
        // columnStyles only affect body cells — mirror the right-alignment onto
        // header cells so headers line up with their columns exactly like the UI.
        if (hook.section === 'head') {
          const col = opts.columns[hook.column.index];
          if (col && col.align === 'right') {
            hook.cell.styles.halign = 'right';
          }
        }
      },
    });
    return getFinalY(doc, opts.startY);
  };

  // 1. Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Keyword Research Report', margin, y);
  y += 24;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(70, 70, 70);
  const intentLabel = data.intent === 'informational' ? 'Informational' : 'Commercial';
  const headerLines: string[] = [`Seed keyword: ${data.keyword}`, `Intent: ${intentLabel}`];
  if (data.client) headerLines.push(`Client: ${data.client}`);
  headerLines.push(
    `Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`
  );
  headerLines.forEach((line) => {
    doc.text(line, margin, y);
    y += 14;
  });
  y += 8;
  doc.setTextColor(0, 0, 0);

  // 2. Warning banner (if present) — includes the validation warning type badge text.
  if (data.warning || data.warningType) {
    const label = data.warningType ? `Warning (${data.warningType})` : 'Warning';
    const body = data.warning ?? 'The validation pass raised a warning.';
    const warningLines = doc.splitTextToSize(`${label}: ${body}`, contentWidth - 20) as string[];
    const boxHeight = warningLines.length * 12 + 16;
    ensureSpace(boxHeight + 16);
    doc.setFillColor(254, 243, 199);
    doc.setDrawColor(217, 119, 6);
    doc.roundedRect(margin, y, contentWidth, boxHeight, 4, 4, 'FD');
    doc.setFontSize(9);
    doc.setTextColor(120, 53, 15);
    doc.text(warningLines, margin + 10, y + 14);
    y += boxHeight + 18;
    doc.setTextColor(0, 0, 0);
  }

  // 2b. Query variants
  if (data.variants && data.variants.length > 0) {
    ensureSpace(40);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('Query Variants', margin, y);
    y += 16;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    const variantLines = doc.splitTextToSize(data.variants.join('   •   '), contentWidth) as string[];
    ensureSpace(variantLines.length * 12 + 10);
    doc.text(variantLines, margin, y);
    y += variantLines.length * 12 + 16;
    doc.setTextColor(0, 0, 0);
  }

  // 2b2. SERP results — # / Title / Domain (plus URL for reference), fixed widths.
  if (data.serpResults && data.serpResults.length > 0) {
    ensureSpace(50);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('SERP Results', margin, y);
    y += 10;
    y =
      drawUiTable({
        startY: y,
        columns: [
          { header: '#', fraction: 0.06 },
          { header: 'Title', fraction: 0.38 },
          { header: 'Domain', fraction: 0.21 },
          { header: 'URL', fraction: 0.35 },
        ],
        body: data.serpResults.map((r, i) => [
          r.rank === null ? String(i + 1) : String(r.rank),
          r.title ?? '—',
          r.domain,
          r.url,
        ]),
      }) + 28;
  }

  // 2c. Competitor URL scoring + SEMrush keywords by page
  if (data.urls && data.urls.length > 0) {
    ensureSpace(50);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('Competitor URL Scoring', margin, y);
    y += 10;
    y =
      drawUiTable({
        startY: y,
        columns: [
          { header: '#', fraction: 0.06 },
          { header: 'Domain', fraction: 0.22 },
          { header: 'URL', fraction: 0.6 },
          { header: 'Score', fraction: 0.12, align: 'right' },
        ],
        body: data.urls.map((u, i) => [String(i + 1), u.domain, u.url, u.score.toFixed(2)]),
      }) + 28;

    const urlsWithKeywords = data.urls.filter((u) => (u.keywordsFound?.length ?? 0) > 0);
    if (urlsWithKeywords.length > 0) {
      ensureSpace(30);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('SEMrush Keywords by Page', margin, y);
      y += 18;
      urlsWithKeywords.forEach((u) => {
        ensureSpace(40);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text(`${u.domain} — ${u.keywordsFound?.length ?? 0} keywords`, margin, y);
        y += 8;
        y =
          drawUiTable({
            startY: y,
            columns: [
              { header: 'Keyword', fraction: 0.75 },
              { header: 'Volume', fraction: 0.25, align: 'right' },
            ],
            body: (u.keywordsFound ?? []).map((k) => [k.keyword, fmt(k.volume)]),
          }) + 18;
      });
      y += 8;
    }
  }

  // 2d. Deduplicated & normalized keywords — Keyword | Volume (right-aligned, like the UI).
  if (data.normalizedKeywords && data.normalizedKeywords.length > 0) {
    ensureSpace(50);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(`Deduplicated & Normalized Keywords — ${data.normalizedKeywords.length} unique`, margin, y);
    y += 10;
    y =
      drawUiTable({
        startY: y,
        columns: [
          { header: 'Keyword', fraction: 0.75 },
          { header: 'Volume', fraction: 0.25, align: 'right' },
        ],
        body: data.normalizedKeywords.map((k) => [k.keyword, fmt(k.volume)]),
      }) + 28;
  }

  // 2e. Composite scoring — Keyword | Volume | CPC | Position, in the exact
  // column order and right-alignment of the on-screen panel.
  if (data.compositeCandidates && data.compositeCandidates.length > 0) {
    ensureSpace(50);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('Composite Scoring', margin, y);
    y += 10;
    y =
      drawUiTable({
        startY: y,
        columns: [
          { header: 'Keyword', fraction: 0.55 },
          { header: 'Volume', fraction: 0.15, align: 'right' },
          { header: 'CPC', fraction: 0.15, align: 'right' },
          { header: 'Position', fraction: 0.15, align: 'right' },
        ],
        body: data.compositeCandidates.map((c) => [
          c.keyword,
          fmt(c.volume),
          c.cpc === null ? '—' : `$${fmtCpc(c.cpc)}`,
          fmt(c.position),
        ]),
      }) + 28;
  }

  // 2f. Alignment scores — Keyword | Alignment (right-aligned).
  if (data.alignmentScores && data.alignmentScores.length > 0) {
    ensureSpace(50);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('Alignment Scores', margin, y);
    y += 10;
    y =
      drawUiTable({
        startY: y,
        columns: [
          { header: 'Keyword', fraction: 0.75 },
          { header: 'Alignment', fraction: 0.25, align: 'right' },
        ],
        body: data.alignmentScores.map((k) => [k.keyword, fmtScore(k.score)]),
      }) + 28;
  }

  // 3. Primary keywords — each as its own block
  ensureSpace(30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Primary Keywords', margin, y);
  y += 18;
  data.primary.forEach((k, index) => {
    const rationale = k.rationale ?? '';
    doc.setFontSize(10);
    const rationaleLines = rationale ? (doc.splitTextToSize(rationale, contentWidth) as string[]) : [];
    const blockHeight = 30 + rationaleLines.length * 12 + 12;
    ensureSpace(blockHeight);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`${index + 1}. ${k.keyword}`, margin, y);
    y += 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);
    doc.text(`Volume: ${fmt(k.volume)}`, margin, y);
    y += 13;
    if (rationaleLines.length > 0) {
      doc.setTextColor(50, 50, 50);
      doc.text(rationaleLines, margin, y);
      y += rationaleLines.length * 12;
    }
    doc.setTextColor(0, 0, 0);
    y += 12;
  });

  // 4. Secondary keywords — # | Keyword | Volume (right-aligned), matching the
  // UI's secondary keywords table column-for-column.
  ensureSpace(50);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Secondary Keywords', margin, y);
  y += 10;
  y =
    drawUiTable({
      startY: y,
      columns: [
        { header: '#', fraction: 0.08 },
        { header: 'Keyword', fraction: 0.67 },
        { header: 'Volume', fraction: 0.25, align: 'right' },
      ],
      body: data.secondary.map((k, i) => [String(i + 1), k.keyword, fmt(k.volume)]),
    }) + 28;

  // 5. All source keywords — three tier sections
  ensureSpace(30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('All Source Keywords', margin, y);
  y += 18;

  const sortByVolume = (rows: SourceKeyword[]): SourceKeyword[] =>
    [...rows].sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1));

  const tiers = [
    { title: 'Core (3+ competitor URLs)', rows: sortByVolume(data.allKeywords.filter((k) => k.urlFrequency >= 3)) },
    { title: 'Relevant (2 competitor URLs)', rows: sortByVolume(data.allKeywords.filter((k) => k.urlFrequency === 2)) },
    { title: 'Discovery (1 competitor URL)', rows: sortByVolume(data.allKeywords.filter((k) => k.urlFrequency <= 1)) },
  ];

  tiers.forEach((tier) => {
    ensureSpace(40);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`${tier.title} — ${tier.rows.length} keywords`, margin, y);
    y += 8;
    if (tier.rows.length > 0) {
      y =
        drawUiTable({
          startY: y,
          columns: [
            { header: 'Keyword', fraction: 0.56 },
            { header: 'Volume', fraction: 0.2, align: 'right' },
            { header: 'URL Frequency', fraction: 0.24, align: 'right' },
          ],
          body: tier.rows.map((k) => [k.keyword, fmt(k.volume), String(k.urlFrequency)]),
        }) + 20;
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(120, 120, 120);
      doc.text('No keywords in this tier.', margin, y + 10);
      doc.setTextColor(0, 0, 0);
      y += 26;
    }
  });

  const slug = slugify(data.keyword);
  const filename = slug ? `keyword-research-${slug}.pdf` : 'keyword-research-report.pdf';
  doc.save(filename);
}
