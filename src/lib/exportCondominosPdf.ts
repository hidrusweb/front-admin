import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addFooterPageNumbers, loadHydrusLogoForPdf } from './pdfHidrusHelpers';

export interface CondominoPdfRow {
  condominioNome: string;
  agrupamentoNome: string;
  unidade: string;
  condomino: string;
  cpf: string;
  email: string;
  telefone: string;
  endereco: string;
  hidrometro: string;
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
    .slice(0, 48) || 'export';
}

/** Formato legado: Agrupamento-Número (ex.: A-101). */
export function formatUnidadeLegado(agrupamentoNome: string, numeroUnidade: string): string {
  const a = (agrupamentoNome || '').trim();
  const n = (numeroUnidade || '').trim();
  if (!a && !n) return '—';
  if (!a) return n;
  if (!n) return a;
  return `${a}-${n}`;
}

function resolveCondominioCabecalho(rows: CondominoPdfRow[], filtro?: string): string {
  const nomes = rows.map((r) => (r.condominioNome ?? '').trim()).filter(Boolean);
  if (nomes.length === 0) return filtro?.trim() || '—';
  const primeiro = nomes[0];
  const todosIguais = nomes.every((n) => n === primeiro);
  if (todosIguais) return primeiro;
  return filtro?.trim() || 'Vários condomínios';
}

/**
 * PDF em A4 retrato: logo, nome do condomínio, título «Condôminos», tabela com numeração de páginas.
 */
export async function exportCondominosPdf(
  rows: CondominoPdfRow[],
  options: { tituloFiltro?: string } = {}
): Promise<boolean> {
  if (rows.length === 0) return false;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const filtro = options.tituloFiltro?.trim();
  const pageW = doc.internal.pageSize.getWidth();
  const m = 12;
  const condoCab = resolveCondominioCabecalho(rows, filtro);

  const logo = await loadHydrusLogoForPdf(42);
  let y = m;
  const logoW = logo?.w ?? 0;
  const logoH = logo?.h ?? 0;
  const rightX = logo ? m + logoW + 8 : m;
  const rightW = pageW - m - rightX;
  if (logo) doc.addImage(logo.dataUrl, logo.format, m, y, logoW, logoH);

  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  const condoLines = doc.splitTextToSize(condoCab, rightW);
  const titleLines = doc.splitTextToSize('Condôminos', rightW);
  const lineH = 5.6;
  const stackH = (condoLines.length + titleLines.length) * lineH + 2;
  const blockTop = y + (Math.max(logoH, stackH) - stackH) / 2;

  doc.text(condoLines, rightX + rightW / 2, blockTop + lineH, { align: 'center' });
  doc.setFontSize(15);
  doc.text(titleLines, rightX + rightW / 2, blockTop + lineH * (condoLines.length + 1), { align: 'center' });
  y += Math.max(logoH, stackH) + 8;

  doc.setFont('helvetica', 'normal');

  const head = [['Ordem', 'Unidade', 'Condômino', 'CPF', 'E-mail', 'Telefone', 'Hidrômetro']];

  const body = rows.map((r, i) => [
    String(i + 1),
    formatUnidadeLegado(r.agrupamentoNome, r.unidade),
    r.condomino || '—',
    r.cpf || '—',
    r.email || '—',
    r.telefone || '—',
    r.hidrometro || '—',
  ]);

  /* Colunas mais estreitas em Unidade / Hidrômetro e fonte menor para dar largura ao nome do condômino. */
  autoTable(doc, {
    startY: y,
    head,
    body,
    styles: { fontSize: 6, cellPadding: 0.9, overflow: 'linebreak', valign: 'middle' },
    headStyles: { fillColor: [30, 64, 120], fontSize: 7, overflow: 'visible' },
    margin: { left: m, right: m, bottom: 14 },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 17 },
      2: { cellWidth: 62 },
      3: { cellWidth: 24 },
      4: { cellWidth: 34 },
      5: { cellWidth: 21 },
      6: { cellWidth: 16 },
    },
  });

  addFooterPageNumbers(doc);

  const prefix = filtro ? slugifyFilename(filtro) : 'todos';
  doc.save(`condominos-${prefix}-${fileDateStamp()}.pdf`);
  return true;
}
