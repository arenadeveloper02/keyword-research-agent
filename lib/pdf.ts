import type { PdfExportData, SourceKeyword } from '@/lib/types';

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

  // 2b2. SERP results
  if (data.serpResults && data.serpResults.length > 0) {
    ensureSpace(50);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('SERP Results', margin, y);
    y += 10;
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Rank', 'Title', 'Domain', 'URL']],
      body: data.serpResults.map((r) => [r.rank === null ? '—' : String(r.rank), r.title ?? '—', r.domain, r.url]),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [100, 116, 139] },
      rowPageBreak: 'avoid',
    });
    y = getFinalY(doc, y) + 28;
  }

  // 2c. Competitor URL scoring + SEMrush keywords by page
  if (data.urls && data.urls.length > 0) {
    ensureSpace(50);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('Competitor URL Scoring', margin, y);
    y += 10;
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['#', 'Domain', 'URL', 'Score']],
      body: data.urls.map((u, i) => [String(i + 1), u.domain, u.url, u.score.toFixed(2)]),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [79, 70, 229] },
      rowPageBreak: 'avoid',
    });
    y = getFinalY(doc, y) + 28;

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
        autoTable(doc, {
          startY: y,
          margin: { left: margin, right: margin },
          head: [['Keyword', 'Volume']],
          body: (u.keywordsFound ?? []).map((k) => [k.keyword, fmt(k.volume)]),
          styles: { fontSize: 8, cellPadding: 4 },
          headStyles: { fillColor: [100, 116, 139] },
          rowPageBreak: 'avoid',
        });
        y = getFinalY(doc, y) + 18;
      });
      y += 8;
    }
  }

  // 2d. Deduplicated & normalized keywords
  if (data.normalizedKeywords && data.normalizedKeywords.length > 0) {
    ensureSpace(50);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(`Deduplicated & Normalized Keywords — ${data.normalizedKeywords.length} unique`, margin, y);
    y += 10;
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Keyword', 'Volume']],
      body: data.normalizedKeywords.map((k) => [k.keyword, fmt(k.volume)]),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [100, 116, 139] },
      rowPageBreak: 'avoid',
    });
    y = getFinalY(doc, y) + 28;
  }

  // 2e. Composite scoring — Keyword | Volume | Position | CPC (matches the on-screen panel).
  if (data.compositeCandidates && data.compositeCandidates.length > 0) {
    ensureSpace(50);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('Composite Scoring', margin, y);
    y += 10;
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Keyword', 'Volume', 'Position', 'CPC']],
      body: data.compositeCandidates.map((c) => [c.keyword, fmt(c.volume), fmt(c.position), fmtCpc(c.cpc)]),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [100, 116, 139] },
      rowPageBreak: 'avoid',
    });
    y = getFinalY(doc, y) + 28;
  }

  // 2f. Alignment scores
  if (data.alignmentScores && data.alignmentScores.length > 0) {
    ensureSpace(50);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('Alignment Scores', margin, y);
    y += 10;
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Keyword', 'Alignment']],
      body: data.alignmentScores.map((k) => [k.keyword, fmtScore(k.score)]),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [100, 116, 139] },
      rowPageBreak: 'avoid',
    });
    y = getFinalY(doc, y) + 28;
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

  // 4. Secondary keywords — clean table
  ensureSpace(50);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Secondary Keywords', margin, y);
  y += 10;
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Keyword', 'Volume']],
    body: data.secondary.map((k) => [k.keyword, fmt(k.volume)]),
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [79, 70, 229] },
    rowPageBreak: 'avoid',
  });
  y = getFinalY(doc, y) + 28;

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
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [['Keyword', 'Volume', 'URL Frequency']],
        body: tier.rows.map((k) => [k.keyword, fmt(k.volume), String(k.urlFrequency)]),
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [100, 116, 139] },
        rowPageBreak: 'avoid',
      });
      y = getFinalY(doc, y) + 20;
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
