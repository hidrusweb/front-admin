import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { RowInput } from 'jspdf-autotable';
import ExcelJS from 'exceljs';
import { addFooterPageNumbers, loadHydrusLogoForPdf } from './pdfHidrusHelpers';

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
  /** Quando true, inclui o quadro «Resumo» (total das unidades × conta CAESB) no PDF (legado). */
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

function appendResumoPdf(
  doc: jsPDF,
  rows: GeneralReportRow[],
  resumo: RelatorioGeralResumoExport
): void {
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

  if (rows[0]?.usaPadraoCaesb && resumo.conferenciaCaesb) {
    const totalCaesb = resumo.totalCaesb ?? 0;
    const totalAPagar = totals(rows).valorPagar;
    const n = rows.length;
    const fmt = (v: number) =>
      v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    ensureSpace(36);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('Resumo', 14, y);
    y += 6;
    doc.setFont('helvetica', 'normal');

    const escuro: [number, number, number] = [45, 55, 72];
    const claro: [number, number, number] = [226, 232, 240];

    const body: string[][] =
      totalAPagar >= totalCaesb
        ? [
            [`1. Total das ${n} unidades`, `==> ${fmt(totalAPagar)}`],
            [`2. Conta CAESB`, `==> ${fmt(totalCaesb)}`],
            [`3. Diferença`, `==> ${fmt(totalAPagar - totalCaesb)} (crédito)`],
          ]
        : [
            [`1. Conta CAESB`, `==> ${fmt(totalCaesb)}`],
            [`2. Total das ${n} unidades`, `==> ${fmt(totalAPagar)}`],
            [`3. Diferença`, `==> ${fmt(totalCaesb - totalAPagar)} (déficit)`],
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = ((doc as any).lastAutoTable?.finalY as number) + 8;
  }

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

/** Leituras no PDF: inteiro sem separador de milhar (ex.: 1290, não 1.290). */
function formatLeituraRelatorioGeralPdf(n: number): string {
  const r = Math.round(n);
  if (Math.abs(n - r) < 1e-6) return String(r);
  return String(n);
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
    doc.addImage(logo.dataUrl, logo.format, m, y0, logo.w, logo.h);
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

  const body: RowInput[] = [
    ...rows.map((r, i) => [
      String(i + 1),
      r.unidade || '—',
      formatLeituraRelatorioGeralPdf(r.leituraAnterior),
      formatLeituraRelatorioGeralPdf(r.leituraAtual),
      formatConsumoRelatorioGeralM3(r.consumo),
      formatRelatorioGeralTarifaOuExcedente(r, rows, useValorExcedente),
      r.valorPagar.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    ]),
    [
      {
        content: 'Totais',
        colSpan: 4,
        styles: { halign: 'right', fontStyle: 'bold' },
      },
      formatConsumoRelatorioGeralM3(t.consumo),
      footerRelatorioGeralTarifaOuExcedente(rows, useValorExcedente),
      t.valorPagar.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    ],
  ];

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
    appendResumoPdf(doc, rows, opt.resumo);
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

/** Agrupa itens em linhas de até `size` colunas (layout tipo grid da tela). */
function chunkInformativo<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
}

/** Número fixo de colunas no PDF informativo: preenche da esquerda para a direita e desce linha a linha. */
const INFORMATIVO_PDF_COLS = 4;

const INFORMATIVO_PDF_HEAD_STYLES = {
  fillColor: [30, 64, 120] as [number, number, number],
  fontSize: 8,
  textColor: [255, 255, 255] as [number, number, number],
  fontStyle: 'bold' as const,
};

/** Uma linha de cabeçalho com título em faixa azul (igual ao relatório geral). */
function informativoPdfHeadTituloLinha(texto: string): RowInput {
  return [
    {
      content: texto,
      colSpan: INFORMATIVO_PDF_COLS,
      styles: { halign: 'left' as const, fontStyle: 'bold' as const },
    },
  ];
}

/** “Com consumo”: 4 colunas; cada célula em uma linha, ex.: `C-102 (Consumo: 18 m³)`. */
function bodyInformativoComConsumoGrid(com: GeneralReportRow[]): RowInput[] {
  return chunkInformativo(com, INFORMATIVO_PDF_COLS).map((chunk) => {
    const row: string[] = [];
    for (let i = 0; i < INFORMATIVO_PDF_COLS; i++) {
      if (chunk[i]) {
        const u = chunk[i].unidade || '—';
        const c = fmtConsumoInformativoM3(chunk[i].consumo);
        row.push(`${u} (Consumo: ${c} m³)`);
      } else {
        row.push('');
      }
    }
    return row;
  });
}

/** “Sem consumo”: 4 colunas de nomes de unidade. */
function bodyInformativoSemConsumoGrid(sem: GeneralReportRow[]): RowInput[] {
  return chunkInformativo(sem, INFORMATIVO_PDF_COLS).map((chunk) => {
    const row = chunk.map((r) => r.unidade || '—');
    while (row.length < INFORMATIVO_PDF_COLS) row.push('');
    return row;
  });
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
  y += 5;
  const pageH = doc.internal.pageSize.getHeight();
  const m = 10;

  for (const s of sections) {
    if (s.items.length === 0) continue;
    if (y > pageH - 32) {
      doc.addPage();
      y = 12;
    }
    const bodyResumo: RowInput[] = chunkInformativo(s.items, INFORMATIVO_PDF_COLS).map((chunk) => {
      const row = [...chunk];
      while (row.length < INFORMATIVO_PDF_COLS) row.push('');
      return row;
    });
    autoTable(doc, {
      startY: y,
      head: [informativoPdfHeadTituloLinha(`${s.title} (Total de ${s.items.length} unidades)`)],
      body: bodyResumo,
      headStyles: INFORMATIVO_PDF_HEAD_STYLES,
      styles: { fontSize: 7, cellPadding: 0.5, halign: 'center' },
      margin: { left: m, right: m, bottom: 12 },
      theme: 'striped',
      columnStyles: Object.fromEntries(
        Array.from({ length: INFORMATIVO_PDF_COLS }, (_, i) => [i, { cellWidth: 45 }])
      ),
    });
    y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
    y += 4;
  }
}

/** PDF informativo: grid de 4 colunas (preenche em linhas; o jsPDF-autotable quebra página automaticamente). */
export async function exportRelatorioInformativoPdf(
  rows: GeneralReportRow[],
  consumoMinimo: number,
  resumo?: RelatorioInformativoResumoExport
): Promise<boolean> {
  if (rows.length === 0) return false;

  const meta = rows[0];
  const nome = meta?.nomeCondominio || 'Condomínio';
  const prox = meta?.dataProximaLeitura ? `Próx. leitura: ${meta.dataProximaLeitura}` : '';

  const com = sortInformativoUnidades(rows.filter((r) => r.consumo > 0));
  const sem = sortInformativoUnidades(rows.filter((r) => r.consumo <= 0));

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const m = 10;
  const y0 = 10;
  const pageW = doc.internal.pageSize.getWidth();
  const cx = pageW / 2;

  const logo = await loadHydrusLogoForPdf(36);
  let logoBottom = y0;
  if (logo) {
    doc.addImage(logo.dataUrl, logo.format, m, y0, logo.w, logo.h);
    logoBottom = y0 + logo.h;
  }

  let ly = y0 + 5;
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text('Relatório informativo', cx, ly, { align: 'center' });
  ly += 6;
  doc.setFontSize(10);
  doc.text(nome, cx, ly, { align: 'center' });
  ly += 5;
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(`Leitura de ${meta?.dataInicial ?? '—'} a ${meta?.dataFinal ?? '—'}`, cx, ly, { align: 'center' });
  ly += 4;
  if (prox) {
    doc.text(prox, cx, ly, { align: 'center' });
    ly += 4;
  }
  doc.setTextColor(0, 0, 0);

  let y = Math.max(logoBottom, ly) + 5;

  const bodyComWide: RowInput[] = com.length
    ? bodyInformativoComConsumoGrid(com)
    : [['', '', '', '']];

  const colStylesCom: Record<number, { halign: 'center'; cellWidth: number }> = {};
  for (let c = 0; c < INFORMATIVO_PDF_COLS; c++) {
    colStylesCom[c] = { halign: 'center', cellWidth: 45 };
  }

  autoTable(doc, {
    startY: y,
    head: [
      informativoPdfHeadTituloLinha(
        `Unidades com consumo acima de ${consumoMinimo} (m³) (Total de ${com.length} unidades)`
      ),
    ],
    body: bodyComWide,
    headStyles: INFORMATIVO_PDF_HEAD_STYLES,
    styles: { fontSize: 7, cellPadding: 0.5, valign: 'top', halign: 'center' },
    columnStyles: colStylesCom,
    margin: { left: m, right: m, bottom: 12 },
    theme: 'striped',
  });

  y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 5;

  if (sem.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [informativoPdfHeadTituloLinha(`Unidades sem consumo (Total de ${sem.length} unidades)`)],
      body: bodyInformativoSemConsumoGrid(sem),
      headStyles: INFORMATIVO_PDF_HEAD_STYLES,
      styles: { fontSize: 7, cellPadding: 0.5, halign: 'center', valign: 'middle' },
      margin: { left: m, right: m, bottom: 12 },
      theme: 'striped',
      columnStyles: Object.fromEntries(
        Array.from({ length: INFORMATIVO_PDF_COLS }, (_, i) => [i, { cellWidth: 45 }])
      ),
    });
  }

  if (resumo) {
    appendInformativoResumoPdf(doc, resumo);
  }

  addFooterPageNumbers(doc);

  doc.save(`relatorio-informativo-${slugifyFilename(nome)}-${fileDateStamp()}.pdf`);
  return true;
}

const EXCEL_HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFD9D9D9' },
};

function downloadExcelBuffer(buffer: ExcelJS.Buffer, filename: string): void {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Planilha no padrão legado: só unidades; cabeçalho com datas; total final só em valor a pagar.
 * Lixeiras / hidrômetro / resumo CAESB ficam só no PDF.
 */
async function exportRelatorioGeralLegacyExcel(rows: GeneralReportRow[]): Promise<boolean> {
  if (rows.length === 0) return false;

  const nome = rows[0]?.nomeCondominio || 'Condomínio';
  const t = totals(rows);
  const di = (rows[0]?.dataInicial ?? '—').trim() || '—';
  const df = (rows[0]?.dataFinal ?? '—').trim() || '—';

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Relatório geral');

  ws.columns = [
    { width: 9 },
    { width: 30 },
    { width: 28 },
    { width: 28 },
    { width: 16 },
    { width: 20 },
  ];

  const headerRow = ws.addRow([
    'Ordem',
    'Unidade',
    `Leitura anterior (${di})`,
    `Leitura atual (${df})`,
    'Consumo (m³)',
    'Valor a pagar',
  ]);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = EXCEL_HEADER_FILL;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const line = ws.addRow([
      i + 1,
      r.unidade || '—',
      r.leituraAnterior,
      r.leituraAtual,
      consumoRelatorioGeralCellValue(r.consumo),
      r.valorPagar,
    ]);
    line.eachCell((cell, colNumber) => {
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      if (colNumber === 6) {
        cell.numFmt = '"R$" #,##0.00';
      }
    });
  }

  const totalRow = ws.addRow(['Total ==>', '', '', '', '', t.valorPagar]);
  totalRow.height = 20;
  totalRow.eachCell((cell, colNumber) => {
    cell.font = { bold: true };
    cell.fill = EXCEL_HEADER_FILL;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    if (colNumber === 6) {
      cell.numFmt = '"R$" #,##0.00';
    }
  });

  const buffer = await wb.xlsx.writeBuffer();
  downloadExcelBuffer(buffer, `relatorio-geral-${slugifyFilename(nome)}-${fileDateStamp()}.xlsx`);
  return true;
}

export async function exportRelatorioGeralExcel(
  rows: GeneralReportRow[],
  _resumo?: RelatorioGeralResumoExport
): Promise<boolean> {
  return exportRelatorioGeralLegacyExcel(rows);
}
