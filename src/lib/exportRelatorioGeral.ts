import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { logoHydrusHorizontalAbsoluteUrl } from './branding';

export type GeneralReportRow = {
  unidade: string;
  leituraAnterior: number;
  leituraAtual: number;
  consumo: number;
  valorExcedente: number;
  tarifaContingencia: number;
  valorAreaComum: number;
  valorPagar: number;
  hidrometro: string;
  nomeCondominio: string;
  dataInicial: string;
  dataFinal: string;
  dataProximaLeitura: string;
  /** Padrão CAESB do condomínio (relatório geral / conferência com conta CAESB). */
  usaPadraoCaesb?: boolean;
};

/** Resumo do relatório geral (legado: formulário + tabela “Lixeiras”), opcional no export. */
export type RelatorioGeralResumoExport = {
  dataCaesb?: string;
  totalConsumo?: number;
  totalCaesb?: number;
  /** Quando true, inclui o quadro de conferência entre total das unidades e valor da conta CAESB (legado). */
  conferenciaCaesb?: boolean;
  leituraAnteriorCondominio?: number;
  leituraAtualCondominio?: number;
  lixeiras: Array<{
    agrupamento: string;
    leituraAnterior: number;
    leituraAtual: number;
    consumo: number;
  }>;
};

function resumoExportTemConteudo(r: RelatorioGeralResumoExport): boolean {
  if (r.lixeiras.length > 0) return true;
  if (r.dataCaesb != null && String(r.dataCaesb).trim() !== '') return true;
  if (r.totalConsumo != null && r.totalConsumo !== 0) return true;
  if (r.totalCaesb != null && r.totalCaesb !== 0) return true;
  if (r.leituraAnteriorCondominio != null && r.leituraAnteriorCondominio !== 0) return true;
  if (r.leituraAtualCondominio != null && r.leituraAtualCondominio !== 0) return true;
  return false;
}

function appendResumoPdf(doc: jsPDF, resumo: RelatorioGeralResumoExport): void {
  if (!resumoExportTemConteudo(resumo)) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let y = ((doc as any).lastAutoTable?.finalY as number | undefined) ?? 40;
  y += 10;
  const pageH = doc.internal.pageSize.getHeight();
  const ensureSpace = (need: number) => {
    if (y + need > pageH - 14) {
      doc.addPage();
      y = 14;
    }
  };

  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  ensureSpace(8);
  doc.text('Resumo', 14, y);
  y += 6;

  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  ensureSpace(20);
  doc.text('Conta CAESB', 14, y);
  y += 5;
  autoTable(doc, {
    startY: y,
    head: [['Mês/ano', 'Consumo total (m³)', 'Valor total (R$)']],
    body: [
      [
        resumo.dataCaesb?.trim() || '—',
        resumo.totalConsumo != null ? String(resumo.totalConsumo) : '—',
        resumo.totalCaesb != null
          ? resumo.totalCaesb.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
          : '—',
      ],
    ],
    styles: { fontSize: 8, cellPadding: 1.2, halign: 'center' },
    headStyles: { fillColor: [30, 64, 120] },
    margin: { left: 14, right: 14 },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = ((doc as any).lastAutoTable?.finalY as number) + 8;

  if (resumo.lixeiras.length > 0) {
    ensureSpace(16);
    doc.setFontSize(9);
    doc.text('Lixeiras', 14, y);
    y += 4;
    const tot = resumo.lixeiras.reduce((a, l) => a + l.consumo, 0);
    autoTable(doc, {
      startY: y,
      head: [['Bloco', 'Leitura anterior', 'Leitura atual', 'Consumo (m³)']],
      body: [
            ...resumo.lixeiras.map((l) => [
          l.agrupamento,
          String(l.leituraAnterior),
          String(l.leituraAtual),
          formatConsumoRelatorioGeralM3(l.consumo),
        ]),
        ['', '', 'Total', formatConsumoRelatorioGeralM3(tot)],
      ],
      styles: { fontSize: 8, cellPadding: 1.2, halign: 'center' },
      headStyles: { fillColor: [30, 64, 120] },
      margin: { left: 14, right: 14 },
      columnStyles: { 0: { halign: 'center' }, 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center' } },
      didParseCell: (data) => {
        if (data.section === 'body' && data.row.index === resumo.lixeiras.length) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [240, 244, 250];
        }
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = ((doc as any).lastAutoTable?.finalY as number) + 8;
  }

  ensureSpace(22);
  doc.setFontSize(9);
  doc.text('Hidrômetro geral', 14, y);
  y += 4;
  const ant = resumo.leituraAnteriorCondominio ?? 0;
  const atu = resumo.leituraAtualCondominio ?? 0;
  autoTable(doc, {
    startY: y,
    head: [['Leitura anterior', 'Leitura atual', 'Consumo (m³)']],
    body: [[String(ant), String(atu), formatConsumoRelatorioGeralM3(atu - ant)]],
    styles: { fontSize: 8, cellPadding: 1.2, halign: 'center' },
    headStyles: { fillColor: [30, 64, 120] },
    margin: { left: 14, right: 14 },
    columnStyles: { 0: { halign: 'center' }, 1: { halign: 'center' }, 2: { halign: 'center' } },
  });
}

function appendConferenciaCaesbPdf(
  doc: jsPDF,
  rows: GeneralReportRow[],
  resumo: RelatorioGeralResumoExport
): void {
  if (!rows[0]?.usaPadraoCaesb || !resumo.conferenciaCaesb) return;
  const totalCaesb = resumo.totalCaesb ?? 0;
  const totalAPagar = totals(rows).valorPagar;
  const n = rows.length;
  const fmt = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let y = ((doc as any).lastAutoTable?.finalY as number | undefined) ?? 40;
  y += 10;
  const pageH = doc.internal.pageSize.getHeight();
  if (y > pageH - 42) {
    doc.addPage();
    y = 14;
  }

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('Conferência (padrão CAESB)', 14, y);
  y += 6;
  doc.setFont('helvetica', 'normal');

  const escuro: [number, number, number] = [45, 55, 72];
  const claro: [number, number, number] = [226, 232, 240];

  const body: string[][] =
    totalAPagar >= totalCaesb
      ? [
          [`1. Total das ${n} unidades`, `==> ${fmt(totalAPagar)}`],
          [`2. Conta CAESB`, `==> ${fmt(totalCaesb)}`],
          [`3. Diferença`, `==> ${fmt(totalAPagar - totalCaesb)}`],
        ]
      : [
          [`1. Conta CAESB`, `==> ${fmt(totalCaesb)}`],
          [`2. Total das ${n} unidades`, `==> ${fmt(totalAPagar)}`],
          [`3. Diferença`, `==> ${fmt(totalCaesb - totalAPagar)}`],
        ];

  autoTable(doc, {
    startY: y,
    body,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1.6 },
    columnStyles: { 0: { cellWidth: 105 }, 1: { cellWidth: 72 } },
    didParseCell: (data) => {
      const i = data.row.index;
      const fundo = i % 2 === 0 ? escuro : claro;
      data.cell.styles.fillColor = fundo;
      data.cell.styles.textColor = i % 2 === 0 ? [255, 255, 255] : [30, 30, 30];
      if (i === 2) data.cell.styles.fontStyle = 'bold';
    },
  });
}

/** Logo para PDF (mesma arte da tela: `public/images/logo-hydrus-horizontal.png`). */
async function loadHydrusLogoForPdf(
  maxWidthMm: number
): Promise<{ dataUrl: string; w: number; h: number } | null> {
  try {
    const url = logoHydrusHorizontalAbsoluteUrl();
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl: string = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = () => reject(new Error('read'));
      fr.readAsDataURL(blob);
    });
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('img'));
      img.src = dataUrl;
    });
    const w = maxWidthMm;
    const nw = img.naturalWidth || img.width;
    const nh = img.naturalHeight || img.height;
    const h = nw > 0 ? (nh / nw) * w : maxWidthMm * 0.25;
    return { dataUrl, w, h };
  } catch {
    return null;
  }
}

function fileDateStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function slugifyFilename(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'relatorio';
}

function fmtDateBr(v: unknown): string {
  if (v == null || v === '') return '—';
  const s = String(v).trim();
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (ymd) {
    const [, y, m, d] = ymd;
    return `${d}/${m}/${y}`;
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? s : new Date(t).toLocaleDateString('pt-BR');
}

function num(r: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) {
    const v = r[k];
    if (v != null && v !== '') return Number(v);
  }
  return 0;
}

function str(r: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = r[k];
    if (v != null && v !== '') return String(v);
  }
  return '';
}

/**
 * Normaliza o JSON do endpoint GET /reports/general/consumo/.../tabela/...
 */
/** Consumo em m³: inteiro sem decimais (ex.: 7); frações só quando necessário. */
export function formatConsumoRelatorioGeralM3(n: number): string {
  const r = Math.round(n);
  if (Math.abs(n - r) < 1e-6) return String(r);
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** Valor numérico para planilha: inteiro quando próximo de inteiro. */
function consumoRelatorioGeralCellValue(n: number): number {
  const r = Math.round(n);
  return Math.abs(n - r) < 1e-6 ? r : n;
}

export function parseGeneralReportApi(data: unknown): GeneralReportRow[] {
  if (!Array.isArray(data)) return [];
  return data.map((item) => {
    const r = item as Record<string, unknown>;
    return {
      unidade: str(r, 'Unidade', 'unidade'),
      leituraAnterior: num(r, 'LeituraAnterior', 'leituraAnterior'),
      leituraAtual: num(r, 'LeituraAtual', 'leituraAtual'),
      consumo: num(r, 'Consumo', 'consumo'),
      valorExcedente: num(r, 'ValorExcedente', 'valorExcedente'),
      tarifaContingencia: num(r, 'TarifaContigencia', 'TarifaContingencia', 'tarifaContigencia', 'tarifaContingencia'),
      valorAreaComum: num(r, 'ValorAreaComum', 'valorAreaComum'),
      valorPagar: num(r, 'ValorPagar', 'valorPagar'),
      hidrometro: str(r, 'Hidrometro', 'hidrometro'),
      nomeCondominio: str(r, 'NomeCondominio', 'nomeCondominio'),
      dataInicial: fmtDateBr(r.DataInicial ?? r.dataInicial),
      dataFinal: fmtDateBr(r.DataFinal ?? r.dataFinal),
      dataProximaLeitura: fmtDateBr(r.DataProximaLeitura ?? r.dataProximaLeitura),
      usaPadraoCaesb: Boolean(r.UsaPadraoCaesb ?? r.usaPadraoCaesb ?? false),
    };
  });
}

function totals(rows: GeneralReportRow[]) {
  return rows.reduce(
    (acc, row) => ({
      consumo: acc.consumo + row.consumo,
      valorExcedente: acc.valorExcedente + row.valorExcedente,
      tarifaContingencia: acc.tarifaContingencia + row.tarifaContingencia,
      valorAreaComum: acc.valorAreaComum + row.valorAreaComum,
      valorPagar: acc.valorPagar + row.valorPagar,
    }),
    { consumo: 0, valorExcedente: 0, tarifaContingencia: 0, valorAreaComum: 0, valorPagar: 0 }
  );
}

function parseDataFinalRelatorioGeralBr(dataFinalBr: string): Date | null {
  const s = String(dataFinalBr).trim();
  const dmY = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
  if (dmY) {
    const [, d, mo, y] = dmY;
    return new Date(Number(y), Number(mo) - 1, Number(d));
  }
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (ymd) {
    const [, y, mo, d] = ymd;
    return new Date(Number(y), Number(mo) - 1, Number(d));
  }
  return null;
}

/** Legado: antes de 01/06/2020 a coluna é “Valor excedente”; depois, “Tarifa fixa”. */
export function relatorioGeralColunaValorExcedente(dataFinalBr: string): boolean {
  const dt = parseDataFinalRelatorioGeralBr(dataFinalBr);
  if (!dt) return false;
  return dt < new Date(2020, 5, 1);
}

/** Célula da coluna tarifa fixa / valor excedente (mesma regra do RelatorioGeral.cshtml). */
export function formatRelatorioGeralTarifaOuExcedente(
  r: GeneralReportRow,
  rows: GeneralReportRow[],
  useValorExcedente: boolean
): string {
  if (useValorExcedente) {
    return r.valorExcedente.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  const zero = rows.find((x) => x.consumo === 0);
  if (!zero) {
    const v = r.leituraAtual - r.leituraAnterior;
    return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  const first = rows[0];
  const v = zero.valorPagar - (first?.valorAreaComum ?? 0);
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function footerRelatorioGeralTarifaOuExcedente(
  rows: GeneralReportRow[],
  useValorExcedente: boolean
): string {
  if (!useValorExcedente) return '';
  const s = rows.reduce((a, r) => a + r.valorExcedente, 0);
  return s.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function pdfHeadRelatorioGeral(tarifaOuExcedenteTitle: string): string[][] {
  return [
    [
      'Ordem',
      'Unidade',
      'Leitura anterior',
      'Leitura atual',
      'Consumo (m³)',
      tarifaOuExcedenteTitle,
      'Valor a pagar',
    ],
  ];
}

function addFooterPageNumbers(doc: jsPDF): void {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(`Página ${i} de ${total}`, pageW / 2, pageH - 8, { align: 'center' });
  }
}

export type TabelaRelatorioExportOptions = {
  titulo: string;
  nomeArquivoPrefix: string;
  linhasExtras?: string[];
  resumo?: RelatorioGeralResumoExport;
};

async function exportRelatorioTabelaPdf(
  rows: GeneralReportRow[],
  opt: TabelaRelatorioExportOptions
): Promise<boolean> {
  if (rows.length === 0) return false;

  const nome = rows[0]?.nomeCondominio || 'Condomínio';
  const periodo = `${rows[0]?.dataInicial ?? '—'} a ${rows[0]?.dataFinal ?? '—'}`;
  const prox = rows[0]?.dataProximaLeitura ? `Próx. leitura: ${rows[0].dataProximaLeitura}` : '';
  const t = totals(rows);
  const useValorExcedente = relatorioGeralColunaValorExcedente(rows[0]?.dataFinal ?? '');
  const colTarifaTitle = useValorExcedente ? 'Valor excedente' : 'Tarifa fixa';

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const m = 14;
  const y0 = 12;
  const pageW = doc.internal.pageSize.getWidth();
  const cx = pageW / 2;

  const logo = await loadHydrusLogoForPdf(48);
  let logoBottom = y0;
  if (logo) {
    doc.addImage(logo.dataUrl, 'PNG', m, y0, logo.w, logo.h);
    logoBottom = y0 + logo.h;
  }

  let ly = y0 + 5;
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text(opt.titulo, cx, ly, { align: 'center' });
  ly += 6;
  doc.setFontSize(10);
  doc.text(nome, cx, ly, { align: 'center' });
  ly += 5;
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(`Período: ${periodo}`, cx, ly, { align: 'center' });
  ly += 4;
  if (prox) {
    doc.text(prox, cx, ly, { align: 'center' });
    ly += 4;
  }
  for (const line of opt.linhasExtras ?? []) {
    doc.text(line, cx, ly, { align: 'center' });
    ly += 4;
  }
  ly += 2;
  doc.setTextColor(0, 0, 0);

  let y = Math.max(logoBottom, ly) + 6;

  const body = rows.map((r, i) => [
    String(i + 1),
    r.unidade || '—',
    r.leituraAnterior.toLocaleString('pt-BR'),
    r.leituraAtual.toLocaleString('pt-BR'),
    formatConsumoRelatorioGeralM3(r.consumo),
    formatRelatorioGeralTarifaOuExcedente(r, rows, useValorExcedente),
    r.valorPagar.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
  ]);

  body.push([
    'Totais',
    '',
    '',
    '',
    formatConsumoRelatorioGeralM3(t.consumo),
    footerRelatorioGeralTarifaOuExcedente(rows, useValorExcedente),
    t.valorPagar.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
  ]);

  autoTable(doc, {
    startY: y,
    head: pdfHeadRelatorioGeral(colTarifaTitle),
    body,
    styles: { fontSize: 7, cellPadding: 1 },
    headStyles: { fillColor: [30, 64, 120], fontSize: 9 },
    margin: { left: 10, right: 10 },
    columnStyles: {
      0: { halign: 'center' },
      1: { halign: 'left' },
      2: { halign: 'center' },
      3: { halign: 'center' },
      4: { halign: 'center' },
      5: { halign: 'center' },
      6: { halign: 'center' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === body.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [240, 244, 250];
      }
    },
  });

  if (opt.resumo) {
    appendResumoPdf(doc, opt.resumo);
  }
  if (opt.resumo) {
    appendConferenciaCaesbPdf(doc, rows, opt.resumo);
  }

  addFooterPageNumbers(doc);

  doc.save(`${opt.nomeArquivoPrefix}-${slugifyFilename(nome)}-${fileDateStamp()}.pdf`);
  return true;
}

export async function exportRelatorioGeralPdf(
  rows: GeneralReportRow[],
  resumo?: RelatorioGeralResumoExport
): Promise<boolean> {
  return exportRelatorioTabelaPdf(rows, {
    titulo: 'Relatório geral',
    nomeArquivoPrefix: 'relatorio-geral',
    resumo,
  });
}

function sortInformativoUnidades(rows: GeneralReportRow[]): GeneralReportRow[] {
  return [...rows].sort((a, b) => (a.unidade || '').localeCompare(b.unidade || '', 'pt-BR', { numeric: true }));
}

function fmtConsumoInformativoM3(consumo: number): string {
  const rounded = Math.round(consumo);
  if (Math.abs(consumo - rounded) < 1e-6) return String(rounded);
  return consumo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Listas extras do resumo informativo (brief). */
export type RelatorioInformativoResumoExport = {
  unidadesVoltando: string[];
  unidadesAguaNoRelogio: string[];
  unidadesVazamento: string[];
};

function appendInformativoResumoPdf(doc: jsPDF, resumo: RelatorioInformativoResumoExport): void {
  const sections: { title: string; items: string[] }[] = [
    { title: 'Unidades com hidrômetro voltando', items: resumo.unidadesVoltando },
    { title: 'Unidades com água no relógio', items: resumo.unidadesAguaNoRelogio },
    { title: 'Unidades com vazamento', items: resumo.unidadesVazamento },
  ];

  let y =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 40;
  y += 8;
  const pageH = doc.internal.pageSize.getHeight();

  for (const s of sections) {
    if (y > pageH - 30) {
      doc.addPage();
      y = 14;
    }
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(`${s.title} (Total de ${s.items.length} unidades)`, 14, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    autoTable(doc, {
      startY: y,
      head: [['Unidade']],
      body: s.items.length ? s.items.map((u) => [u]) : [['Nenhuma']],
      styles: { fontSize: 9, cellPadding: 1.5 },
      headStyles: { fillColor: [55, 65, 81] },
      margin: { left: 14, right: 14 },
      theme: 'striped',
    });
    y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
    y += 8;
  }
}

/** PDF estilo legado: seções “acima do mínimo” (unidade + consumo) e “sem consumo” (só unidade). */
export async function exportRelatorioInformativoPdf(
  rows: GeneralReportRow[],
  consumoMinimo: number,
  resumo?: RelatorioInformativoResumoExport
): Promise<boolean> {
  if (rows.length === 0) return false;

  const meta = rows[0];
  const nome = meta?.nomeCondominio || 'Condomínio';
  const periodo = `${meta?.dataInicial ?? '—'} a ${meta?.dataFinal ?? '—'}`;
  const prox = meta?.dataProximaLeitura ? `Próx. leitura: ${meta.dataProximaLeitura}` : '';

  const com = sortInformativoUnidades(rows.filter((r) => r.consumo > 0));
  const sem = sortInformativoUnidades(rows.filter((r) => r.consumo <= 0));

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const m = 14;
  const y0 = 12;
  const pageW = doc.internal.pageSize.getWidth();
  const textRightX = pageW - m;

  const logo = await loadHydrusLogoForPdf(48);
  let logoBottom = y0;
  if (logo) {
    doc.addImage(logo.dataUrl, 'PNG', m, y0, logo.w, logo.h);
    logoBottom = y0 + logo.h;
  }

  let ly = y0 + 5;
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.text('Relatório informativo', textRightX, ly, { align: 'right' });
  ly += 7;
  doc.setFontSize(11);
  doc.text(nome, textRightX, ly, { align: 'right' });
  ly += 5;
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(`Leitura de ${periodo}`, textRightX, ly, { align: 'right' });
  ly += 4;
  if (prox) {
    doc.text(prox, textRightX, ly, { align: 'right' });
    ly += 4;
  }
  doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, textRightX, ly, { align: 'right' });
  ly += 2;
  doc.setTextColor(0, 0, 0);

  let y = Math.max(logoBottom, ly) + 8;

  const headCom = [['Unidade', 'Consumo (m³)']];
  const bodyCom = com.map((r) => [r.unidade || '—', fmtConsumoInformativoM3(r.consumo)]);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(
    `Unidades com consumo acima de ${consumoMinimo} (m³) (Total de ${com.length} unidades)`,
    14,
    y
  );
  y += 6;
  doc.setFont('helvetica', 'normal');

  autoTable(doc, {
    startY: y,
    head: headCom,
    body: bodyCom.length ? bodyCom : [['Nenhuma unidade nesta faixa.', '']],
    styles: { fontSize: 9, cellPadding: 1.5 },
    headStyles: { fillColor: [55, 65, 81] },
    margin: { left: 14, right: 14 },
    theme: 'striped',
  });

  y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 10;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`Unidades sem consumo (Total de ${sem.length} unidades)`, 14, y);
  y += 6;
  doc.setFont('helvetica', 'normal');

  const bodySem = sem.map((r) => [r.unidade || '—']);

  autoTable(doc, {
    startY: y,
    head: [['Unidade']],
    body: bodySem.length ? bodySem : [['Nenhuma']],
    styles: { fontSize: 9, cellPadding: 1.5 },
    headStyles: { fillColor: [55, 65, 81] },
    margin: { left: 14, right: 14 },
    theme: 'striped',
  });

  if (resumo) {
    appendInformativoResumoPdf(doc, resumo);
  }

  doc.save(`relatorio-informativo-${slugifyFilename(nome)}-${fileDateStamp()}.pdf`);
  return true;
}

function xlsHeadRelatorioGeral(useValorExcedente: boolean): string[] {
  return [
    'Ordem',
    'Unidade',
    'Leitura anterior',
    'Leitura atual',
    'Consumo (m³)',
    useValorExcedente ? 'Valor excedente (R$)' : 'Tarifa fixa',
    'Valor a pagar (R$)',
  ];
}

type ExcelMeta = {
  titulo: string;
  nomeArquivoPrefix: string;
  linhasExtras?: [string, string][];
  resumo?: RelatorioGeralResumoExport;
};

function exportRelatorioTabelaExcel(rows: GeneralReportRow[], meta: ExcelMeta): boolean {
  if (rows.length === 0) return false;

  const nome = rows[0]?.nomeCondominio || 'Condomínio';
  const t = totals(rows);
  const useValorExcedente = relatorioGeralColunaValorExcedente(rows[0]?.dataFinal ?? '');
  const tarifaFooter = useValorExcedente
    ? rows.reduce((a, r) => a + r.valorExcedente, 0)
    : '';

  const headerBlock: (string | number)[][] = [
    [meta.titulo],
    ['Condomínio', nome],
    ['Período', `${rows[0]?.dataInicial ?? ''} a ${rows[0]?.dataFinal ?? ''}`],
    ['Próxima leitura', rows[0]?.dataProximaLeitura ?? ''],
    ...(meta.linhasExtras ?? []).map(([a, b]) => [a, b]),
    [],
  ];

  const aoa: (string | number)[][] = [
    ...headerBlock,
    xlsHeadRelatorioGeral(useValorExcedente),
    ...rows.map((r, i) => {
      const tarifaCell = useValorExcedente
        ? r.valorExcedente
        : (() => {
            const zero = rows.find((x) => x.consumo === 0);
            if (!zero) return r.leituraAtual - r.leituraAnterior;
            const first = rows[0];
            return zero.valorPagar - (first?.valorAreaComum ?? 0);
          })();
      return [
        i + 1,
        r.unidade,
        r.leituraAnterior,
        r.leituraAtual,
        consumoRelatorioGeralCellValue(r.consumo),
        tarifaCell,
        r.valorPagar,
      ];
    }),
    [
      'Totais',
      '',
      '',
      '',
      consumoRelatorioGeralCellValue(t.consumo),
      tarifaFooter,
      t.valorPagar,
    ],
  ];

  if (meta.resumo && resumoExportTemConteudo(meta.resumo)) {
    const rx = meta.resumo;
    aoa.push(
      [],
      ['Resumo'],
      ['Conta CAESB — mês/ano', rx.dataCaesb?.trim() ?? ''],
      ['Conta CAESB — consumo total (m³)', rx.totalConsumo ?? ''],
      ['Conta CAESB — valor total (R$)', rx.totalCaesb ?? ''],
      []
    );
    if (rx.lixeiras.length > 0) {
      aoa.push(['Lixeiras'], ['Bloco', 'Leitura anterior', 'Leitura atual', 'Consumo (m³)']);
      for (const l of rx.lixeiras) {
        aoa.push([l.agrupamento, l.leituraAnterior, l.leituraAtual, l.consumo]);
      }
      aoa.push([
        '',
        '',
        'Total',
        rx.lixeiras.reduce((a, l) => a + l.consumo, 0),
      ]);
      aoa.push([]);
    }
    aoa.push(
      ['Hidrômetro geral'],
      ['Leitura anterior', 'Leitura atual', 'Consumo (m³)'],
      [
        rx.leituraAnteriorCondominio ?? 0,
        rx.leituraAtualCondominio ?? 0,
        (rx.leituraAtualCondominio ?? 0) - (rx.leituraAnteriorCondominio ?? 0),
      ]
    );
  }

  if (meta.resumo?.conferenciaCaesb && rows[0]?.usaPadraoCaesb) {
    const rx = meta.resumo;
    const totalCaesb = rx.totalCaesb ?? 0;
    const totalAPagar = t.valorPagar;
    const n = rows.length;
    aoa.push(
      [],
      ['Conferência (padrão CAESB)'],
      ...(totalAPagar >= totalCaesb
        ? [
            [`1. Total das ${n} unidades (R$)`, totalAPagar],
            ['2. Conta CAESB (R$)', totalCaesb],
            ['3. Diferença (R$)', totalAPagar - totalCaesb],
          ]
        : [
            ['1. Conta CAESB (R$)', totalCaesb],
            [`2. Total das ${n} unidades (R$)`, totalAPagar],
            ['3. Diferença (R$)', totalCaesb - totalAPagar],
          ])
    );
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  const sheetName = meta.titulo.length > 25 ? 'Relatório' : meta.titulo;
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  XLSX.writeFile(wb, `${meta.nomeArquivoPrefix}-${slugifyFilename(nome)}-${fileDateStamp()}.xlsx`);
  return true;
}

export function exportRelatorioGeralExcel(
  rows: GeneralReportRow[],
  resumo?: RelatorioGeralResumoExport
): boolean {
  return exportRelatorioTabelaExcel(rows, {
    titulo: 'Relatório geral',
    nomeArquivoPrefix: 'relatorio-geral',
    resumo,
  });
}

export function exportRelatorioInformativoExcel(
  rows: GeneralReportRow[],
  consumoMinimo: number,
  resumo?: RelatorioInformativoResumoExport
): boolean {
  if (rows.length === 0) return false;

  const meta = rows[0];
  const nome = meta?.nomeCondominio || 'Condomínio';
  const com = sortInformativoUnidades(rows.filter((r) => r.consumo > 0));
  const sem = sortInformativoUnidades(rows.filter((r) => r.consumo <= 0));

  const aoa: (string | number)[][] = [
    ['Relatório informativo'],
    ['Condomínio', nome],
    ['Período', `${meta?.dataInicial ?? ''} a ${meta?.dataFinal ?? ''}`],
    ['Próxima leitura', meta?.dataProximaLeitura ?? ''],
    ['Gerado em', new Date().toLocaleString('pt-BR')],
    [],
    [`Unidades com consumo acima de ${consumoMinimo} (m³) (Total de ${com.length} unidades)`],
    ['Unidade', 'Consumo (m³)'],
    ...com.map((r) => [r.unidade, r.consumo]),
    [],
    [`Unidades sem consumo (Total de ${sem.length} unidades)`],
    ['Unidade'],
    ...sem.map((r) => [r.unidade]),
  ];

  if (resumo) {
    const blocos: { titulo: string; items: string[] }[] = [
      {
        titulo: `Unidades com hidrômetro voltando (Total de ${resumo.unidadesVoltando.length} unidades)`,
        items: resumo.unidadesVoltando,
      },
      {
        titulo: `Unidades com água no relógio (Total de ${resumo.unidadesAguaNoRelogio.length} unidades)`,
        items: resumo.unidadesAguaNoRelogio,
      },
      {
        titulo: `Unidades com vazamento (Total de ${resumo.unidadesVazamento.length} unidades)`,
        items: resumo.unidadesVazamento,
      },
    ];
    for (const b of blocos) {
      aoa.push([], [b.titulo], ['Unidade'], ...(b.items.length ? b.items.map((u) => [u]) : [['Nenhuma']]));
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Informativo');
  XLSX.writeFile(wb, `relatorio-informativo-${slugifyFilename(nome)}-${fileDateStamp()}.xlsx`);
  return true;
}
