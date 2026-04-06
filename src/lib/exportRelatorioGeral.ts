import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

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
};

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

const PDF_HEAD = [
  [
    'Unidade',
    'Leit. ant.',
    'Leit. atual',
    'Consumo (m³)',
    'Val. excedente',
    'Tar. conting.',
    'Área comum',
    'Valor a pagar',
    'Hidrômetro',
  ],
];

export type TabelaRelatorioExportOptions = {
  titulo: string;
  nomeArquivoPrefix: string;
  linhasExtras?: string[];
};

function exportRelatorioTabelaPdf(rows: GeneralReportRow[], opt: TabelaRelatorioExportOptions): boolean {
  if (rows.length === 0) return false;

  const nome = rows[0]?.nomeCondominio || 'Condomínio';
  const periodo = `${rows[0]?.dataInicial ?? '—'} a ${rows[0]?.dataFinal ?? '—'}`;
  const prox = rows[0]?.dataProximaLeitura ? `Próx. leitura: ${rows[0].dataProximaLeitura}` : '';
  const t = totals(rows);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  let y = 12;
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text(opt.titulo, 14, y);
  y += 6;
  doc.setFontSize(10);
  doc.text(nome, 14, y);
  y += 5;
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(`Período: ${periodo}`, 14, y);
  y += 4;
  if (prox) {
    doc.text(prox, 14, y);
    y += 4;
  }
  for (const line of opt.linhasExtras ?? []) {
    doc.text(line, 14, y);
    y += 4;
  }
  doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, 14, y);
  y += 6;
  doc.setTextColor(0, 0, 0);

  const body = rows.map((r) => [
    r.unidade || '—',
    r.leituraAnterior.toLocaleString('pt-BR'),
    r.leituraAtual.toLocaleString('pt-BR'),
    r.consumo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    r.valorExcedente.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    r.tarifaContingencia.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    r.valorAreaComum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    r.valorPagar.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    r.hidrometro || '—',
  ]);

  body.push([
    'Totais',
    '',
    '',
    t.consumo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    t.valorExcedente.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    t.tarifaContingencia.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    t.valorAreaComum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    t.valorPagar.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    '',
  ]);

  autoTable(doc, {
    startY: y,
    head: PDF_HEAD,
    body,
    styles: { fontSize: 7, cellPadding: 1 },
    headStyles: { fillColor: [30, 64, 120] },
    margin: { left: 10, right: 10 },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === body.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [240, 244, 250];
      }
    },
  });

  doc.save(`${opt.nomeArquivoPrefix}-${slugifyFilename(nome)}-${fileDateStamp()}.pdf`);
  return true;
}

export function exportRelatorioGeralPdf(rows: GeneralReportRow[]): boolean {
  return exportRelatorioTabelaPdf(rows, {
    titulo: 'Relatório geral',
    nomeArquivoPrefix: 'relatorio-geral',
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

/** PDF estilo legado: seções “acima do mínimo” (unidade + consumo) e “sem consumo” (só unidade). */
export function exportRelatorioInformativoPdf(rows: GeneralReportRow[], consumoMinimo: number): boolean {
  if (rows.length === 0) return false;

  const meta = rows[0];
  const nome = meta?.nomeCondominio || 'Condomínio';
  const periodo = `${meta?.dataInicial ?? '—'} a ${meta?.dataFinal ?? '—'}`;
  const prox = meta?.dataProximaLeitura ? `Próx. leitura: ${meta.dataProximaLeitura}` : '';

  const com = sortInformativoUnidades(rows.filter((r) => r.consumo > 0));
  const sem = sortInformativoUnidades(rows.filter((r) => r.consumo <= 0));

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let y = 14;
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.text('Relatório informativo', 14, y);
  y += 7;
  doc.setFontSize(11);
  doc.text(nome, 14, y);
  y += 5;
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(`Leitura de ${periodo}`, 14, y);
  y += 4;
  if (prox) {
    doc.text(prox, 14, y);
    y += 4;
  }
  doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, 14, y);
  y += 8;
  doc.setTextColor(0, 0, 0);

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

  doc.save(`relatorio-informativo-${slugifyFilename(nome)}-${fileDateStamp()}.pdf`);
  return true;
}

const XLS_HEAD = [
  'Unidade',
  'Leitura anterior',
  'Leitura atual',
  'Consumo (m³)',
  'Valor excedente (R$)',
  'Tarifa contingência (R$)',
  'Valor área comum (R$)',
  'Valor a pagar (R$)',
  'Hidrômetro',
];

type ExcelMeta = {
  titulo: string;
  nomeArquivoPrefix: string;
  linhasExtras?: [string, string][];
};

function exportRelatorioTabelaExcel(rows: GeneralReportRow[], meta: ExcelMeta): boolean {
  if (rows.length === 0) return false;

  const nome = rows[0]?.nomeCondominio || 'Condomínio';
  const t = totals(rows);

  const headerBlock: (string | number)[][] = [
    [meta.titulo],
    ['Condomínio', nome],
    ['Período', `${rows[0]?.dataInicial ?? ''} a ${rows[0]?.dataFinal ?? ''}`],
    ['Próxima leitura', rows[0]?.dataProximaLeitura ?? ''],
    ...(meta.linhasExtras ?? []).map(([a, b]) => [a, b]),
    ['Gerado em', new Date().toLocaleString('pt-BR')],
    [],
  ];

  const aoa: (string | number)[][] = [
    ...headerBlock,
    XLS_HEAD,
    ...rows.map((r) => [
      r.unidade,
      r.leituraAnterior,
      r.leituraAtual,
      r.consumo,
      r.valorExcedente,
      r.tarifaContingencia,
      r.valorAreaComum,
      r.valorPagar,
      r.hidrometro || '',
    ]),
    [
      'Totais',
      '',
      '',
      t.consumo,
      t.valorExcedente,
      t.tarifaContingencia,
      t.valorAreaComum,
      t.valorPagar,
      '',
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  const sheetName = meta.titulo.length > 25 ? 'Relatório' : meta.titulo;
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  XLSX.writeFile(wb, `${meta.nomeArquivoPrefix}-${slugifyFilename(nome)}-${fileDateStamp()}.xlsx`);
  return true;
}

export function exportRelatorioGeralExcel(rows: GeneralReportRow[]): boolean {
  return exportRelatorioTabelaExcel(rows, {
    titulo: 'Relatório geral',
    nomeArquivoPrefix: 'relatorio-geral',
  });
}

export function exportRelatorioInformativoExcel(rows: GeneralReportRow[], consumoMinimo: number): boolean {
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

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Informativo');
  XLSX.writeFile(wb, `relatorio-informativo-${slugifyFilename(nome)}-${fileDateStamp()}.xlsx`);
  return true;
}
