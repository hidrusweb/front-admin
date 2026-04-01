/**
 * Mesma regra do backend (MensurationService::normalizeUnitNameForMatch): espaços unicode,
 * hífens especiais, NFC — para bater CSV, cadastro e nome do arquivo da foto.
 */
export function normalizeUnitNameForMatch(name: string): string {
  let s = name.trim();
  if (!s) return '';
  try {
    s = s.normalize('NFC');
  } catch {
    /* ignore */
  }
  s = s.replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF]/g, ' ');
  const hyphens = ['–', '—', '−', '‐', '‑', '‒', '⁃'];
  for (const h of hyphens) {
    if (s.includes(h)) s = s.split(h).join('-');
  }
  s = s.replace(/\s+/g, ' ').trim();
  return s.toLowerCase();
}

/** Chave para Map de imagens e comparação com linha do CSV. */
export function normalizeUnitKey(name: string): string {
  return normalizeUnitNameForMatch(name);
}

/** Só letras e números — desempate P404 vs P-404 (igual ao backend). */
export function normalizeUnitNameLoose(name: string): string {
  return normalizeUnitNameForMatch(name).replace(/[^\p{L}\p{N}]/gu, '');
}

/** Número principal da unidade (igual ao backend): "1"/"01", "P-404"/"P404" → 404. */
export function extractSignificantUnitNumber(name: string): number | null {
  const s = normalizeUnitNameForMatch(name).replace(/\s+/g, '');
  if (!s) return null;
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const m = s.match(/(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

export interface CsvLeituraRow {
  unidade: string;
  leitura: number;
}

/** Espelha MensurationService::sanitizeUnitNameFromImport (aspas CSV, espaços invisíveis). */
export function sanitizeUnitNameFromImport(raw: string): string {
  let s = raw.replace(/[\u200B-\u200D\uFEFF]/g, '');
  s = s.replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ').trim();
  if (s.length >= 2 && ((s[0] === '"' && s.endsWith('"')) || (s[0] === "'" && s.endsWith("'")))) {
    s = s.slice(1, -1).trim();
  }
  return s.trim();
}

/** Remove BOM UTF-8 e normaliza quebras (igual ao backend). */
export function splitCsvLines(text: string): string[] {
  const withoutBom = text.replace(/^\uFEFF/, '');
  return withoutBom
    .split(/\r\n|\n|\r/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function splitDataCells(line: string): string[] {
  if (line.includes(';')) {
    return line.split(';').map((s) => s.trim());
  }
  if (line.includes('\t')) {
    return line.split('\t').map((s) => s.trim());
  }
  const i = line.indexOf(',');
  if (i > 0) {
    return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
  }
  return [];
}

/** CSV: uma linha por leitura, formato `Unidade;Leitura` (ponto ou vírgula decimal). Primeira linha pode ser cabeçalho Unidade;Leitura. */
export function parseCsvLeituras(text: string): CsvLeituraRow[] {
  const lines = splitCsvLines(text);
  const rows: CsvLeituraRow[] = [];
  let i = 0;
  const headerLine = lines[0]?.replace(/^\uFEFF/, '') ?? '';
  if (headerLine && /^unidade\s*[,;\t]/i.test(headerLine)) {
    i = 1;
  }
  for (; i < lines.length; i++) {
    const parts = splitDataCells(lines[i]);
    if (parts.length < 2) continue;
    const unidade = sanitizeUnitNameFromImport(parts[0].trim());
    const raw = parts[1].trim().replace(',', '.');
    const leitura = parseFloat(raw);
    if (!unidade || Number.isNaN(leitura)) continue;
    rows.push({ unidade, leitura });
  }
  return rows;
}

/** Mapa nome normalizado → arquivo de imagem (último vence se houver duplicado). */
export function buildImageMapFromFiles(files: File[]): Map<string, File> {
  const m = new Map<string, File>();
  for (const f of files) {
    const stem = f.name.replace(/\.[^.]+$/i, '');
    m.set(normalizeUnitKey(stem), f);
  }
  return m;
}

/** Arquivo da foto para a unidade da linha (strict, loose ou mesmo número — igual ao backend). */
export function getImageFileForUnit(imageMap: Map<string, File>, unidade: string): File | undefined {
  const strict = normalizeUnitKey(unidade);
  if (imageMap.has(strict)) return imageMap.get(strict);
  const looseU = normalizeUnitNameLoose(unidade);
  if (looseU) {
    for (const [key, file] of imageMap) {
      if (normalizeUnitNameLoose(key) === looseU) return file;
    }
  }
  const n = extractSignificantUnitNumber(unidade);
  if (n !== null) {
    for (const [key, file] of imageMap) {
      const kn = extractSignificantUnitNumber(key);
      if (kn !== null && kn === n) return file;
    }
  }
  return undefined;
}

export function hasImageForUnit(imageMap: Map<string, File>, unidade: string): boolean {
  return getImageFileForUnit(imageMap, unidade) !== undefined;
}
