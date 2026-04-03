import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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

/**
 * PDF com os dados de condôminos (cadastro de unidades), respeitando o filtro atual da tela.
 * @returns true se gerou o arquivo
 */
export function exportCondominosPdf(
  rows: CondominoPdfRow[],
  options: { tituloFiltro?: string } = {}
): boolean {
  if (rows.length === 0) return false;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const filtro = options.tituloFiltro?.trim();
  const titulo = filtro ? `Condôminos — ${filtro}` : 'Condôminos — todos os agrupamentos';

  doc.setFontSize(14);
  doc.text(titulo, 14, 14);
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, 14, 20);
  doc.setTextColor(0, 0, 0);

  const head = [['Condomínio', 'Unidade', 'Condômino', 'CPF', 'E-mail', 'Telefone', 'Endereço', 'Hidrômetro']];

  const body = rows.map((r) => [
    r.condominioNome || '—',
    formatUnidadeLegado(r.agrupamentoNome, r.unidade),
    r.condomino || '—',
    r.cpf || '—',
    r.email || '—',
    r.telefone || '—',
    r.endereco || '—',
    r.hidrometro || '—',
  ]);

  autoTable(doc, {
    startY: 24,
    head,
    body,
    styles: { fontSize: 7, cellPadding: 1.2, overflow: 'linebreak' },
    headStyles: { fillColor: [30, 64, 120] },
    margin: { left: 10, right: 10 },
  });

  const prefix = filtro ? slugifyFilename(filtro) : 'todos';
  doc.save(`condominos-${prefix}-${fileDateStamp()}.pdf`);
  return true;
}
