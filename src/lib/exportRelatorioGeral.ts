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
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('pt-BR');
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

export function exportRelatorioGeralPdf(rows: GeneralReportRow[]): boolean {
  if (rows.length === 0) return false;

  const nome = rows[0]?.nomeCondominio || 'Condomínio';
  const periodo = `${rows[0]?.dataInicial ?? '—'} a ${rows[0]?.dataFinal ?? '—'}`;
  const prox = rows[0]?.dataProximaLeitura ? `Próx. leitura: ${rows[0].dataProximaLeitura}` : '';
  const t = totals(rows);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setFontSize(14);
  doc.text('Relatório geral', 14, 12);
  doc.setFontSize(10);
  doc.text(nome, 14, 18);
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(`Período: ${periodo}`, 14, 23);
  if (prox) doc.text(prox, 14, 27);
  doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, 14, prox ? 31 : 27);
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
    startY: prox ? 35 : 31,
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

  doc.save(`relatorio-geral-${slugifyFilename(nome)}-${fileDateStamp()}.pdf`);
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

export function exportRelatorioGeralExcel(rows: GeneralReportRow[]): boolean {
  if (rows.length === 0) return false;

  const nome = rows[0]?.nomeCondominio || 'Condomínio';
  const t = totals(rows);

  const aoa: (string | number)[][] = [
    ['Relatório geral'],
    ['Condomínio', nome],
    ['Período', `${rows[0]?.dataInicial ?? ''} a ${rows[0]?.dataFinal ?? ''}`],
    ['Próxima leitura', rows[0]?.dataProximaLeitura ?? ''],
    ['Gerado em', new Date().toLocaleString('pt-BR')],
    [],
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
  XLSX.utils.book_append_sheet(wb, ws, 'Relatório geral');

  XLSX.writeFile(wb, `relatorio-geral-${slugifyFilename(nome)}-${fileDateStamp()}.xlsx`);
  return true;
}
