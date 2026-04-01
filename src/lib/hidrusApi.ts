/** Normaliza respostas PascalCase (Laravel / legado .NET) para o formato camelCase do admin React. */

/** Garante array a partir de respostas diretas, paginadas (`{ data: [] }`) ou inválidas. */
export function normalizeApiList<T>(raw: unknown): T[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object' && raw !== null && 'data' in raw) {
    const inner = (raw as { data: unknown }).data;
    if (Array.isArray(inner)) return inner;
  }
  return [];
}

export function pickId(v: unknown): number | string | undefined {
  if (v == null || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  return (o.Id ?? o.id) as number | string | undefined;
}

export function mapCondominio(raw: unknown) {
  const c = raw as Record<string, unknown>;
  return {
    id: Number(pickId(c)),
    nome: String(c.Nome ?? c.nome ?? ''),
    endereco: String(c.Endereco ?? c.endereco ?? ''),
    cep: String(c.Cep ?? c.cep ?? ''),
    responsavel: String(c.Responsavel ?? c.responsavel ?? ''),
    telefone: String(c.Telefone ?? c.telefone ?? ''),
    cnpj: String(c.Cnpj ?? c.cnpj ?? ''),
    email: String(c.Email ?? c.email ?? ''),
    cidade: String(c.Cidade ?? c.cidade ?? ''),
    ativo: Boolean(c.Status ?? c.ativo ?? true),
    usaPadraoCaesb: Boolean(c.UsaPadraoCaesb ?? c.usaPadraoCaesb ?? false),
  };
}

export function mapAgrupamento(raw: unknown) {
  const a = raw as Record<string, unknown>;
  return {
    id: Number(pickId(a)),
    nome: String(a.Nome ?? a.nome ?? ''),
    condominioId: Number(a.IdCondominio ?? a.condominioId ?? 0),
    condominioNome: String(
      (a.condominium as { Nome?: string } | undefined)?.Nome ?? a.condominioNome ?? ''
    ),
    taxa: Number(a.Taxa ?? a.taxa ?? 0),
  };
}

export function mapUnidade(raw: unknown) {
  const u = raw as Record<string, unknown>;
  return {
    id: Number(pickId(u)),
    unidade: String(u.Nome ?? u.unidade ?? ''),
    endereco: String(u.Endereco ?? u.endereco ?? ''),
    condomino: String(u.Condomino ?? u.condomino ?? ''),
    cpf: String(u.Cpf ?? u.cpf ?? ''),
    email: String(u.Email ?? u.email ?? ''),
    telefone: String(u.Telefone ?? u.telefone ?? ''),
    hidrometro: String(u.Hidrometro ?? u.hidrometro ?? ''),
    agrupamentoId: Number(u.IdAgrupamento ?? u.agrupamentoId ?? 0),
    condominioId: Number(u.IdCondominio ?? u.condominioId ?? 0),
    condominioNome: String(
      (u.condominium as { Nome?: string } | undefined)?.Nome ?? u.condominioNome ?? ''
    ),
    agrupamentoNome: String(
      (u.grouping as { Nome?: string } | undefined)?.Nome ?? u.agrupamentoNome ?? ''
    ),
  };
}

export function mapConsumo(raw: unknown) {
  const c = raw as Record<string, unknown>;
  const di = c.DataInicio ?? c.inicio;
  const df = c.DataFim ?? c.fim;
  return {
    id: Number(pickId(c)),
    condominioId: Number(c.IdCondominio ?? c.condominioId ?? 0),
    condominioNome: String(
      (c.condominium as { Nome?: string } | undefined)?.Nome ?? c.condominioNome ?? ''
    ),
    idTabelaImposto: Number(c.IdTabelaImposto ?? c.idTabelaImposto ?? 0),
    inicio: typeof di === 'string' ? di : (di as Date)?.toISOString?.() ?? '',
    fim: typeof df === 'string' ? df : (df as Date)?.toISOString?.() ?? '',
    valorExcedente: Number(c.ValorExcedente ?? c.valorExcedente ?? 0),
    volumeExcedente: Number(c.VolumeExcedente ?? c.volumeExcedente ?? 0),
  };
}

export function mapTabelaImposto(raw: unknown) {
  const t = raw as Record<string, unknown>;
  return {
    id: Number(pickId(t)),
    nome: String(t.Nome ?? t.nome ?? ''),
  };
}

export function mapFaixaImposto(raw: unknown) {
  const f = raw as Record<string, unknown>;
  const tab = (f.table_tax ?? f.tableTax) as { Nome?: string; Id?: number } | undefined;
  return {
    id: Number(pickId(f)),
    nomeF: String(f.Nome ?? f.nomeF ?? ''),
    tabela: String(tab?.Nome ?? f.tabela ?? ''),
    tabelaId: Number(f.IdTabelaImposto ?? f.tabelaId ?? tab?.Id ?? 0),
    ordem: Number(f.Ordem ?? f.ordem ?? 0),
    min: Number(f.Min ?? f.min ?? 0),
    max: Number(f.Max ?? f.max ?? 0),
    aliquotaAgua: Number(f.AliquotaAgua ?? f.aliquotaAgua ?? 0),
    aliquotaEsgoto: Number(f.AliquotaEsgoto ?? f.aliquotaEsgoto ?? 0),
  };
}

export function payloadCondominioSave(data: {
  nome: string;
  endereco?: string;
  cep?: string;
  responsavel?: string;
  telefone?: string;
  cnpj?: string;
  usaPadraoCaesb: boolean;
}) {
  return {
    Nome: data.nome,
    Endereco: data.endereco || null,
    Cep: data.cep || null,
    Responsavel: data.responsavel || null,
    Telefone: data.telefone || null,
    Cnpj: data.cnpj || null,
    UsaPadraoCaesb: data.usaPadraoCaesb,
  };
}

export function payloadCondominioUpdate(
  id: number,
  data: {
    nome: string;
    endereco?: string;
    cep?: string;
    responsavel?: string;
    telefone?: string;
    cnpj?: string;
    usaPadraoCaesb: boolean;
  }
) {
  return { Id: id, ...payloadCondominioSave(data) };
}

export function payloadUnidadeSave(
  data: {
    unidade: string;
    condominioId: number;
    agrupamentoId: number;
    endereco?: string;
    condomino?: string;
    cpf?: string;
    email?: string;
    telefone?: string;
    hidrometro?: string;
  },
  id?: number
) {
  const base: Record<string, unknown> = {
    Nome: data.unidade,
    IdCondominio: data.condominioId,
    IdAgrupamento: data.agrupamentoId,
    Endereco: data.endereco ?? null,
    Condomino: data.condomino ?? null,
    Cpf: data.cpf ?? null,
    Email: data.email ?? null,
    Telefone: data.telefone ?? null,
    Hidrometro: data.hidrometro ?? null,
  };
  if (id != null) base.Id = id;
  return base;
}

export function payloadAgrupamentoSave(
  data: { nome: string; condominioId: number; taxa?: number },
  id?: number
) {
  const p: Record<string, unknown> = {
    Nome: data.nome,
    IdCondominio: data.condominioId,
    Taxa: data.taxa ?? null,
  };
  if (id != null) p.Id = id;
  return p;
}

export function payloadConsumoSave(
  data: {
    condominioId: number;
    inicio: string;
    fim: string;
    valorExcedente: number;
    volumeExcedente: number;
    idTabelaImposto: number;
  },
  id?: number
) {
  const p: Record<string, unknown> = {
    DataInicio: data.inicio,
    DataFim: data.fim,
    IdCondominio: data.condominioId,
    IdTabelaImposto: data.idTabelaImposto,
    ValorExcedente: data.valorExcedente,
    VolumeExcedente: data.volumeExcedente,
  };
  if (id != null) p.Id = id;
  return p;
}

export function mapMensuration(raw: unknown) {
  const m = raw as Record<string, unknown>;
  const u = (m.unit ?? m.unidade) as Record<string, unknown> | undefined;
  const g = u?.grouping as { Nome?: string } | undefined;
  const condo = u?.condominium as { Nome?: string } | undefined;
  const dataVal = m.Data ?? m.data;
  return {
    id: Number(m.Id ?? m.id ?? 0),
    data: typeof dataVal === 'string' ? dataVal : (dataVal as Date)?.toISOString?.() ?? '',
    valor: Number(m.Valor ?? m.valor ?? 0),
    unidade: String(u?.Nome ?? u?.unidade ?? ''),
    agrupamento: String(g?.Nome ?? ''),
    condominio: String(condo?.Nome ?? ''),
    imagemUrl: m.Imagem != null ? String(m.Imagem) : undefined,
  };
}

export function payloadFaixaSave(
  data: {
    nomeF: string;
    tabelaId: number;
    ordem: number;
    min: number;
    max: number;
    aliquotaAgua: number;
    aliquotaEsgoto: number;
  },
  id?: number
) {
  const p: Record<string, unknown> = {
    Nome: data.nomeF,
    IdTabelaImposto: data.tabelaId,
    Ordem: data.ordem,
    Min: data.min,
    Max: data.max,
    AliquotaAgua: data.aliquotaAgua,
    AliquotaEsgoto: data.aliquotaEsgoto,
  };
  if (id != null) p.Id = id;
  return p;
}
