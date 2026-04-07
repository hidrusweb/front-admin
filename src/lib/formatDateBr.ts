/**
 * Exibe data só-dia como dd/mm/aaaa.
 * Prioriza o prefixo yyyy-mm-dd da string (evita deslocamento de fuso com `new Date('yyyy-mm-dd')`).
 */
export function isoDateToDdMmYyyy(value: string | null | undefined): string {
  const s = String(value ?? '').trim();
  if (!s) return '—';
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (ymd) {
    const [, y, mo, d] = ymd;
    return `${d}/${mo}/${y}`;
  }
  const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
  if (br) return `${br[1]}/${br[2]}/${br[3]}`;
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t).toLocaleDateString('pt-BR');
  return s;
}
