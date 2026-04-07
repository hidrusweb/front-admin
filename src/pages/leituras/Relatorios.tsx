import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import { hasRole } from '../../lib/auth';
import {
  exportRelatorioGeralExcel,
  exportRelatorioGeralPdf,
  exportRelatorioInformativoExcel,
  exportRelatorioInformativoPdf,
  formatConsumoRelatorioGeralM3,
  parseGeneralReportApi,
  type GeneralReportRow,
  type RelatorioGeralResumoExport,
  type RelatorioInformativoResumoExport,
} from '../../lib/exportRelatorioGeral';
import DemonstrativoConta, { type UnitBill } from '../../components/conta/DemonstrativoConta';
import { logoHydrusHorizontalAbsoluteUrl } from '../../lib/branding';
import { mapCondominio, mapTabelaImposto, mapUnidade, normalizeApiList } from '../../lib/hidrusApi';

type ReportType = 'geral' | 'informativo' | 'demonstrativo';

type ConsumoOption = {
  id: number;
  label: string;
  idTabelaImposto: number;
  tabelaNome: string;
  /** Data fim do ciclo (YYYY-MM-DD) — referência da conta / demonstrativo. */
  dataFim: string;
};

function isoDateOnly(v: unknown): string {
  if (v == null) return '';
  const s = String(v).trim();
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (m) return m[1];
  return s.slice(0, 10);
}

/** Ex.: De 03/04/2026 até 03/05/2026 */
type LixeiraFormRow = {
  id: string;
  agrupamento: string;
  leituraAnterior: number;
  leituraAtual: number;
};

type ResumoGeralFormState = {
  dataCaesb: string;
  totalConsumoStr: string;
  totalCaesbStr: string;
  leituraAntCondStr: string;
  leituraAtualCondStr: string;
  lixeiras: LixeiraFormRow[];
};

function emptyResumoGeralForm(): ResumoGeralFormState {
  return {
    dataCaesb: '',
    totalConsumoStr: '',
    totalCaesbStr: '',
    leituraAntCondStr: '',
    leituraAtualCondStr: '',
    lixeiras: [],
  };
}

/** GET /reports/brief pode retornar objeto plano (Laravel) ou { resumo } (formato API .NET). */
function unwrapBriefPayload(data: unknown): Record<string, unknown> | null {
  if (data == null || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  const inner = o.resumo ?? o.Resumo;
  if (inner != null && typeof inner === 'object') {
    return inner as Record<string, unknown>;
  }
  return o;
}

type ResumoInformativoFormState = {
  unidadesVoltando: string[];
  unidadesAguaNoRelogio: string[];
  unidadesVazamento: string[];
};

function emptyResumoInformativo(): ResumoInformativoFormState {
  return {
    unidadesVoltando: [],
    unidadesAguaNoRelogio: [],
    unidadesVazamento: [],
  };
}

function parseStringListBriefField(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x).trim()).filter((s) => s.length > 0);
}

function informativeBriefPayloadToState(data: unknown): ResumoInformativoFormState {
  const src = unwrapBriefPayload(data);
  if (!src) return emptyResumoInformativo();
  return {
    unidadesAguaNoRelogio: parseStringListBriefField(
      src.UnidadesAguaNoRelogio ?? src.unidadesAguaNoRelogio
    ),
    unidadesVoltando: parseStringListBriefField(src.UnidadesVoltando ?? src.unidadesVoltando),
    unidadesVazamento: parseStringListBriefField(src.UnidadesVazamento ?? src.unidadesVazamento),
  };
}

/** Mês/ano: apenas dígitos, até 6 — exibe mm/aaaa (alinhado ao inputmask 99/9999 do legado). */
function maskMesAnoMmAaaa(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 6);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

/** Valor em centavos a partir da digitação → exibição 1.234,56 */
function maskBrlMoneyInput(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  const centavosTotal = Number.parseInt(digits, 10);
  if (!Number.isFinite(centavosTotal)) return '';
  const reais = Math.floor(centavosTotal / 100);
  const cents = centavosTotal % 100;
  const wholeStr = String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${wholeStr},${String(cents).padStart(2, '0')}`;
}

/** Interpreta string do campo monetário pt-BR (com ou sem milhares) como número. */
function parseBrlMonetaryForm(s: string): number {
  const t = String(s).trim();
  if (!t) return 0;
  const noThousands = t.replace(/\./g, '');
  const normalized = noThousands.replace(',', '.');
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
}

function brlMoneyStrFromNumber(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '';
  const centavosTotal = Math.round((n + Number.EPSILON) * 100);
  return maskBrlMoneyInput(String(centavosTotal));
}

function totalCaesbStrFromApi(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'number' && Number.isFinite(v)) return brlMoneyStrFromNumber(v);
  const s = String(v).trim();
  if (!s) return '';
  if (/^\d{1,3}(\.\d{3})*,\d{2}$/.test(s)) return s;
  if (/^\d+\.\d+$/.test(s)) {
    const n = Number.parseFloat(s);
    return Number.isFinite(n) ? brlMoneyStrFromNumber(n) : '';
  }
  const n = Number.parseFloat(s.replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(n)) return '';
  return brlMoneyStrFromNumber(n);
}

function briefPayloadToForm(data: unknown): ResumoGeralFormState {
  const src = unwrapBriefPayload(data);
  if (!src) return emptyResumoGeralForm();

  const rawLix = src.lixeiras ?? src.Lixeiras;
  const list = Array.isArray(rawLix) ? rawLix : [];
  const lixeiras: LixeiraFormRow[] = list.map((item: unknown, i: number) => {
    const r = item as Record<string, unknown>;
    const agr = String(r.agrupamento ?? r.Agrupamento ?? '');
    const ant = Number(r.leituraAnterior ?? r.LeituraAnterior ?? 0);
    const atu = Number(r.leituraAtual ?? r.LeituraAtual ?? 0);
    const id = r.id != null ? String(r.id) : `lix-${i}-${agr}`;
    return { id, agrupamento: agr, leituraAnterior: ant, leituraAtual: atu };
  });

  return {
    dataCaesb: maskMesAnoMmAaaa(String(src.dataCaesb ?? src.DataCaesb ?? '')),
    totalConsumoStr:
      src.totalConsumo != null || src.TotalConsumo != null
        ? String(src.totalConsumo ?? src.TotalConsumo ?? '')
        : '',
    totalCaesbStr:
      src.totalCaesb != null || src.TotalCaesb != null
        ? totalCaesbStrFromApi(src.totalCaesb ?? src.TotalCaesb)
        : '',
    leituraAntCondStr:
      src.leituraAnteriorCondominio != null || src.LeituraAnteriorCondominio != null
        ? String(src.leituraAnteriorCondominio ?? src.LeituraAnteriorCondominio ?? '')
        : '',
    leituraAtualCondStr:
      src.leituraAtualCondominio != null || src.LeituraAtualCondominio != null
        ? String(src.leituraAtualCondominio ?? src.LeituraAtualCondominio ?? '')
        : '',
    lixeiras,
  };
}

function formatCicloConsumoLabel(inicio: unknown, fim: unknown): string {
  const toBr = (v: unknown): string | null => {
    if (v == null) return null;
    const s = String(v).trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (iso) {
      const [, y, m, d] = iso;
      return `${d}/${m}/${y}`;
    }
    const t = Date.parse(s);
    if (Number.isNaN(t)) return null;
    return new Date(t).toLocaleDateString('pt-BR');
  };
  const a = toBr(inicio);
  const b = toBr(fim);
  if (a && b) return `De ${a} até ${b}`;
  return `${String(inicio ?? '').slice(0, 10)} → ${String(fim ?? '').slice(0, 10)}`;
}

export default function Relatorios() {
  const [type, setType] = useState<ReportType>('geral');
  const [condominioId, setCondominioId] = useState('');
  const [consumoId, setConsumoId] = useState('');
  const [agrupamentoId, setAgrupamentoId] = useState('');
  const [tabelaId, setTabelaId] = useState('');
  const [consumoMinimo, setConsumoMinimo] = useState('10');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  /** Evita reutilizar o JSON do relatório geral na aba informativo (e vice-versa). */
  const [generatedReportKind, setGeneratedReportKind] = useState<'geral' | 'informativo' | null>(null);
  const [demoBills, setDemoBills] = useState<UnitBill[]>([]);
  /** Unidades marcadas no demonstrativo (id → incluir). */
  const [selectedDemoUnits, setSelectedDemoUnits] = useState<Record<number, boolean>>({});

  const [resumoGeral, setResumoGeral] = useState<ResumoGeralFormState>(() => emptyResumoGeralForm());
  const [draftLixeira, setDraftLixeira] = useState({ agrupamento: '', leituraAnterior: '', leituraAtual: '' });
  const [savingResumo, setSavingResumo] = useState(false);

  const [resumoInformativo, setResumoInformativo] = useState<ResumoInformativoFormState>(() =>
    emptyResumoInformativo()
  );
  const [pickInformativoVoltando, setPickInformativoVoltando] = useState('');
  const [pickInformativoAgua, setPickInformativoAgua] = useState('');
  const [pickInformativoVazamento, setPickInformativoVazamento] = useState('');
  const [savingResumoInformativo, setSavingResumoInformativo] = useState(false);

  const isAdministrador = hasRole('ADMINISTRADOR');

  const { data: condominios = [] } = useQuery({
    queryKey: ['condominios'],
    queryFn: () =>
      api.get('/Condominium/condominium').then((r) => (Array.isArray(r.data) ? r.data : []).map(mapCondominio)),
  });

  const { data: tabelas = [] } = useQuery({
    queryKey: ['tabelas-imposto'],
    queryFn: () => api.get('/tableTax/tax').then((r) => (Array.isArray(r.data) ? r.data : []).map(mapTabelaImposto)),
  });

  const { data: consumos = [] } = useQuery({
    queryKey: ['consumos-by-cond', condominioId],
    queryFn: () =>
      condominioId
        ? api.get(`/consumption/condominium/${condominioId}`).then((r) =>
            (Array.isArray(r.data) ? r.data : []).map((x: unknown) => {
              const c = x as Record<string, unknown>;
              const tt = (c.table_tax ?? c.tableTax) as Record<string, unknown> | undefined;
              const idTabela = Number(c.IdTabelaImposto ?? c.idTabelaImposto ?? 0);
              return {
                id: Number(c.Id ?? c.id),
                label: formatCicloConsumoLabel(c.DataInicio ?? c.dataInicio, c.DataFim ?? c.dataFim),
                idTabelaImposto: idTabela,
                tabelaNome: String(tt?.Nome ?? tt?.nome ?? ''),
                dataFim: isoDateOnly(c.DataFim ?? c.dataFim),
              } satisfies ConsumoOption;
            })
          )
        : Promise.resolve([]),
    enabled: !!condominioId,
  });

  const { data: agrupamentos = [] } = useQuery({
    queryKey: ['agrupamentos-by-cond', condominioId, type],
    queryFn: () =>
      condominioId
        ? api.get(`/grouping/condominio/${condominioId}`).then((r) =>
            (Array.isArray(r.data) ? r.data : []).map((a: unknown) => {
              const x = a as Record<string, unknown>;
              return { id: Number(x.Id ?? x.id), nome: String(x.Nome ?? x.nome ?? '') };
            })
          )
        : Promise.resolve([]),
    enabled: !!condominioId && type === 'demonstrativo',
  });

  const { data: unidadesCondominio = [] } = useQuery({
    queryKey: ['unidades-by-condominio', condominioId, type],
    queryFn: () =>
      condominioId
        ? api.get(`/Unit/condominio/${condominioId}`).then((r) => normalizeApiList(r.data).map(mapUnidade))
        : Promise.resolve([]),
    enabled: !!condominioId && type === 'demonstrativo',
  });

  useEffect(() => {
    if (type !== 'demonstrativo') setDemoBills([]);
  }, [type]);

  useEffect(() => {
    setResumoGeral(emptyResumoGeralForm());
    setDraftLixeira({ agrupamento: '', leituraAnterior: '', leituraAtual: '' });
    setResumoInformativo(emptyResumoInformativo());
    setPickInformativoVoltando('');
    setPickInformativoAgua('');
    setPickInformativoVazamento('');
    setGeneratedReportKind(null);
  }, [condominioId, consumoId]);

  useEffect(() => {
    if (type === 'informativo' && generatedReportKind !== 'informativo') {
      setResult(null);
      if (generatedReportKind != null) setGeneratedReportKind(null);
      return;
    }
    if (type === 'geral' && generatedReportKind !== 'geral') {
      setResult(null);
      if (generatedReportKind != null) setGeneratedReportKind(null);
    }
  }, [type, generatedReportKind]);

  useEffect(() => {
    if (type !== 'informativo' || !consumoId || !condominioId) return;
    let cancelled = false;
    void (async () => {
      try {
        const br = await api.get(`/reports/brief/informative/${consumoId}/${condominioId}`);
        if (!cancelled) setResumoInformativo(informativeBriefPayloadToState(br.data));
      } catch (e) {
        if (axios.isAxiosError(e) && e.response?.status === 404) {
          if (!cancelled) setResumoInformativo(emptyResumoInformativo());
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [type, consumoId, condominioId]);

  useEffect(() => {
    if (type !== 'geral' && type !== 'demonstrativo') return;
    if (!consumoId) {
      setTabelaId('');
      return;
    }
    const c = (consumos as ConsumoOption[]).find((x) => String(x.id) === consumoId);
    if (c?.idTabelaImposto) setTabelaId(String(c.idTabelaImposto));
  }, [type, consumoId, consumos]);

  const consumoSelecionado = useMemo(() => {
    if (!consumoId) return undefined;
    return (consumos as ConsumoOption[]).find((x) => String(x.id) === consumoId);
  }, [consumoId, consumos]);

  const dataRefDemonstrativo = consumoSelecionado?.dataFim ?? '';

  const anoMesDemonstrativo = useMemo(() => {
    const s = dataRefDemonstrativo;
    if (!s) return { y: new Date().getFullYear(), m: new Date().getMonth() + 1 };
    const [y, mo] = s.split('-').map(Number);
    return { y: y || new Date().getFullYear(), m: mo || 1 };
  }, [dataRefDemonstrativo]);

  const unidadesDemonstrativoFiltradas = useMemo(() => {
    const list = unidadesCondominio as ReturnType<typeof mapUnidade>[];
    if (!agrupamentoId) return list;
    return list.filter((u) => String(u.agrupamentoId) === agrupamentoId);
  }, [unidadesCondominio, agrupamentoId]);

  const filtradasIdsKey = useMemo(
    () =>
      [...unidadesDemonstrativoFiltradas.map((u) => u.id)]
        .sort((a, b) => a - b)
        .join(','),
    [unidadesDemonstrativoFiltradas]
  );

  useEffect(() => {
    if (type !== 'demonstrativo') return;
    const next: Record<number, boolean> = {};
    for (const u of unidadesDemonstrativoFiltradas) next[u.id] = true;
    setSelectedDemoUnits(next);
    // filtradasIdsKey resume a lista filtrada (condomínio / agrupamento / carga da API).
  }, [type, condominioId, consumoId, agrupamentoId, filtradasIdsKey]);

  const tabelaReadonlyLabel = useMemo(() => {
    if ((type !== 'geral' && type !== 'demonstrativo') || !consumoId) return '';
    const c = consumoSelecionado;
    if (!c?.idTabelaImposto) return '';
    if (c.tabelaNome) return `${c.tabelaNome} (id ${c.idTabelaImposto})`;
    const t = (tabelas as { id: number; nome: string }[]).find((x) => x.id === c.idTabelaImposto);
    return t ? `${t.nome} (id ${c.idTabelaImposto})` : `Tabela id ${c.idTabelaImposto}`;
  }, [type, consumoId, consumoSelecionado, tabelas]);

  const generalRows = useMemo(() => {
    if (type !== 'geral' || result == null) return [];
    return parseGeneralReportApi(result);
  }, [type, result]);

  const resumoGeralExport = useMemo((): RelatorioGeralResumoExport | undefined => {
    if (!isAdministrador) return undefined;
    const lixeiras = [...resumoGeral.lixeiras]
      .sort((a, b) => a.agrupamento.localeCompare(b.agrupamento, 'pt-BR', { sensitivity: 'base' }))
      .map(({ agrupamento, leituraAnterior, leituraAtual }) => ({
        agrupamento,
        leituraAnterior,
        leituraAtual,
        consumo: leituraAtual - leituraAnterior,
      }));
    return {
      dataCaesb: resumoGeral.dataCaesb.trim() || undefined,
      totalConsumo: Number.parseInt(resumoGeral.totalConsumoStr, 10) || 0,
      totalCaesb: parseBrlMonetaryForm(resumoGeral.totalCaesbStr),
      leituraAnteriorCondominio: Number.parseInt(resumoGeral.leituraAntCondStr, 10) || 0,
      leituraAtualCondominio: Number.parseInt(resumoGeral.leituraAtualCondStr, 10) || 0,
      lixeiras,
    };
  }, [isAdministrador, resumoGeral]);

  const informativeRows = useMemo(() => {
    if (type !== 'informativo' || result == null) return [];
    return parseGeneralReportApi(result);
  }, [type, result]);

  const informativeComConsumo = useMemo(() => {
    if (type !== 'informativo') return [];
    return [...informativeRows]
      .filter((r) => r.consumo > 0)
      .sort((a, b) => (a.unidade || '').localeCompare(b.unidade || '', 'pt-BR', { numeric: true }));
  }, [type, informativeRows]);

  const informativeSemConsumo = useMemo(() => {
    if (type !== 'informativo') return [];
    return [...informativeRows]
      .filter((r) => r.consumo <= 0)
      .sort((a, b) => (a.unidade || '').localeCompare(b.unidade || '', 'pt-BR', { numeric: true }));
  }, [type, informativeRows]);

  const unidadesInformativoOpcoes = useMemo(() => {
    const set = new Set<string>();
    for (const r of informativeRows) {
      const u = (r.unidade || '').trim();
      if (u) set.add(u);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  }, [informativeRows]);

  const resumoInformativoExport = useMemo((): RelatorioInformativoResumoExport | undefined => {
    if (type !== 'informativo' || informativeRows.length === 0) return undefined;
    const sortU = (xs: string[]) => [...xs].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
    return {
      unidadesVoltando: sortU(resumoInformativo.unidadesVoltando),
      unidadesAguaNoRelogio: sortU(resumoInformativo.unidadesAguaNoRelogio),
      unidadesVazamento: sortU(resumoInformativo.unidadesVazamento),
    };
  }, [type, informativeRows.length, resumoInformativo]);

  const tabelaPreviewRows: GeneralReportRow[] = type === 'geral' ? generalRows : [];

  const handleGenerate = async () => {
    if (!condominioId) {
      toast.error('Selecione o condomínio');
      return;
    }
    if ((type === 'geral' || type === 'informativo' || type === 'demonstrativo') && !consumoId) {
      toast.error('Selecione o período de consumo (ciclo)');
      return;
    }
    if (type === 'geral') {
      const c = consumoSelecionado;
      if (!c?.idTabelaImposto) {
        toast.error('O ciclo selecionado não possui tabela de impostos cadastrada');
        return;
      }
    }
    if (type === 'demonstrativo') {
      const c = consumoSelecionado;
      if (!c?.idTabelaImposto) {
        toast.error('O ciclo selecionado não possui tabela de impostos cadastrada');
        return;
      }
      if (!c.dataFim) {
        toast.error('O ciclo não possui data fim para referência da conta');
        return;
      }
      const ids = unidadesDemonstrativoFiltradas
        .filter((u) => selectedDemoUnits[u.id])
        .map((u) => u.id);
      if (ids.length === 0) {
        toast.error('Selecione ao menos uma unidade');
        return;
      }
    }
    if (type === 'informativo' && !consumoMinimo) {
      toast.error('Informe o consumo mínimo');
      return;
    }

    setLoading(true);
    setResult(null);
    if (type === 'demonstrativo') setDemoBills([]);
    try {
      if (type === 'geral') {
        const c = consumoSelecionado;
        const tid = c?.idTabelaImposto ?? Number(tabelaId);
        const res = await api.get(`/reports/general/consumo/${consumoId}/tabela/${tid}`);
        setResult(res.data);
        setGeneratedReportKind('geral');
        if (isAdministrador && condominioId) {
          try {
            const br = await api.get(`/reports/brief/${consumoId}/${condominioId}`);
            setResumoGeral(briefPayloadToForm(br.data));
          } catch (e) {
            if (axios.isAxiosError(e) && e.response?.status === 404) {
              setResumoGeral(emptyResumoGeralForm());
            }
          }
        }
        toast.success('Relatório gerado. Exporte em PDF ou Excel.');
      } else if (type === 'informativo') {
        const res = await api.get(`/reports/informative/${consumoMinimo}`, {
          params: { idConsumption: consumoId },
        });
        setResult(res.data);
        setGeneratedReportKind('informativo');
        if (condominioId) {
          try {
            const br = await api.get(`/reports/brief/informative/${consumoId}/${condominioId}`);
            setResumoInformativo(informativeBriefPayloadToState(br.data));
          } catch (e) {
            if (axios.isAxiosError(e) && e.response?.status === 404) {
              setResumoInformativo(emptyResumoInformativo());
            }
          }
        }
        toast.success('Relatório gerado. Exporte em PDF ou Excel.');
      } else if (type === 'demonstrativo') {
        const c = consumoSelecionado!;
        const ids = unidadesDemonstrativoFiltradas
          .filter((u) => selectedDemoUnits[u.id])
          .map((u) => u.id);
        const settled = await Promise.allSettled(
          ids.map((id) =>
            api.get<UnitBill>(`/reports/bill/unidade/${id}`, {
              params: { idTabela: c.idTabelaImposto, dataSelecionada: c.dataFim },
            })
          )
        );
        const bills: UnitBill[] = [];
        let falhas = 0;
        for (const s of settled) {
          if (s.status === 'fulfilled') bills.push(s.value.data);
          else falhas += 1;
        }
        bills.sort((a, b) =>
          (a.Unidade || '').localeCompare(b.Unidade || '', 'pt-BR', { numeric: true })
        );
        setDemoBills(bills);
        setGeneratedReportKind(null);
        if (falhas > 0) {
          toast.error(`${falhas} unidade(s) não puderam ser geradas (sem leitura no período ou erro).`);
        }
        if (bills.length > 0) {
          toast.success(`${bills.length} demonstrativo(s) gerado(s). Use Imprimir para todos.`);
        } else if (falhas === 0) {
          toast.error('Nenhum demonstrativo retornado.');
        }
      }
    } catch {
      toast.error('Erro ao gerar relatório');
    } finally {
      setLoading(false);
    }
  };

  const handleExportPdfGeral = async () => {
    if (generalRows.length === 0) {
      toast.error('Gere o relatório geral antes de exportar.');
      return;
    }
    const ok = await exportRelatorioGeralPdf(generalRows, resumoGeralExport);
    if (ok) toast.success('PDF baixado.');
    else toast.error('Não há linhas para exportar.');
  };

  const handleExportExcelGeral = () => {
    if (generalRows.length === 0) {
      toast.error('Gere o relatório geral antes de exportar.');
      return;
    }
    if (exportRelatorioGeralExcel(generalRows, resumoGeralExport)) toast.success('Planilha baixada.');
    else toast.error('Não há linhas para exportar.');
  };

  const addLixeiraRow = () => {
    const agrupamento = draftLixeira.agrupamento.trim();
    const leituraAnterior = Number.parseInt(draftLixeira.leituraAnterior, 10);
    const leituraAtual = Number.parseInt(draftLixeira.leituraAtual, 10);
    if (!agrupamento) {
      toast.error('Digite um bloco (agrupamento).');
      return;
    }
    if (
      resumoGeral.lixeiras.some(
        (x) => x.agrupamento.trim().toUpperCase() === agrupamento.toUpperCase()
      )
    ) {
      toast.error('Já existe uma lixeira para esse bloco.');
      return;
    }
    if (Number.isNaN(leituraAnterior)) {
      toast.error('Digite um valor para a leitura anterior.');
      return;
    }
    if (Number.isNaN(leituraAtual)) {
      toast.error('Digite um valor para a leitura atual.');
      return;
    }
    if (leituraAnterior > leituraAtual) {
      toast.error('Leitura anterior maior que a atual. Confira a leitura dessa lixeira.');
      return;
    }
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `lix-${Date.now()}`;
    setResumoGeral((prev) => ({
      ...prev,
      lixeiras: [...prev.lixeiras, { id, agrupamento, leituraAnterior, leituraAtual }],
    }));
    setDraftLixeira({ agrupamento: '', leituraAnterior: '', leituraAtual: '' });
  };

  const removeLixeiraRow = (id: string) => {
    setResumoGeral((prev) => ({ ...prev, lixeiras: prev.lixeiras.filter((l) => l.id !== id) }));
  };

  const salvarResumoGeral = async () => {
    if (!consumoId || !condominioId) {
      toast.error('Selecione condomínio e ciclo.');
      return;
    }
    const lixeirasPayload = [...resumoGeral.lixeiras]
      .sort((a, b) => a.agrupamento.localeCompare(b.agrupamento, 'pt-BR', { sensitivity: 'base' }))
      .map(({ agrupamento, leituraAnterior, leituraAtual }) => ({
        agrupamento,
        leituraAnterior,
        leituraAtual,
        consumo: leituraAtual - leituraAnterior,
      }));
    const body = {
      dataCaesb: resumoGeral.dataCaesb.trim(),
      totalConsumo: Number.parseInt(resumoGeral.totalConsumoStr, 10) || 0,
      totalCaesb: parseBrlMonetaryForm(resumoGeral.totalCaesbStr),
      leituraAnteriorCondominio: Number.parseInt(resumoGeral.leituraAntCondStr, 10) || 0,
      leituraAtualCondominio: Number.parseInt(resumoGeral.leituraAtualCondStr, 10) || 0,
      lixeiras: lixeirasPayload,
    };
    setSavingResumo(true);
    try {
      await api.post(`/reports/brief/${consumoId}/${condominioId}`, body);
      toast.success('Resumo salvo no banco (mesmo ciclo e condomínio).');
    } catch {
      toast.error('Não foi possível salvar o resumo.');
    } finally {
      setSavingResumo(false);
    }
  };

  type InformativoListKey = keyof ResumoInformativoFormState;

  const addUnidadeInformativo = (key: InformativoListKey, unit: string, clearPick: () => void) => {
    const u = unit.trim();
    if (!u) {
      toast.error('Informe o nome da unidade.');
      return;
    }
    if (resumoInformativo[key].some((x) => x.toUpperCase() === u.toUpperCase())) {
      toast.error('Esta unidade já está na lista.');
      return;
    }
    setResumoInformativo((prev) => ({ ...prev, [key]: [...prev[key], u] }));
    clearPick();
  };

  const removeUnidadeInformativo = (key: InformativoListKey, unit: string) => {
    setResumoInformativo((prev) => ({ ...prev, [key]: prev[key].filter((x) => x !== unit) }));
  };

  const salvarResumoInformativo = async () => {
    if (!consumoId || !condominioId) {
      toast.error('Selecione condomínio e ciclo.');
      return;
    }
    setSavingResumoInformativo(true);
    try {
      await api.post(`/reports/brief/informative/${consumoId}/${condominioId}`, {
        UnidadesAguaNoRelogio: resumoInformativo.unidadesAguaNoRelogio,
        UnidadesVoltando: resumoInformativo.unidadesVoltando,
        UnidadesVazamento: resumoInformativo.unidadesVazamento,
      });
      toast.success('Resumo informativo salvo.');
    } catch {
      toast.error('Não foi possível salvar o resumo informativo.');
    } finally {
      setSavingResumoInformativo(false);
    }
  };

  const consumoMinimoNum = Number(consumoMinimo);

  const handleExportPdfInformativo = async () => {
    if (informativeRows.length === 0) {
      toast.error('Gere o relatório informativo antes de exportar.');
      return;
    }
    if (Number.isNaN(consumoMinimoNum)) {
      toast.error('Consumo mínimo inválido.');
      return;
    }
    const ok = await exportRelatorioInformativoPdf(
      informativeRows,
      consumoMinimoNum,
      resumoInformativoExport
    );
    if (ok) toast.success('PDF baixado.');
    else toast.error('Não há linhas para exportar.');
  };

  const handleExportExcelInformativo = () => {
    if (informativeRows.length === 0) {
      toast.error('Gere o relatório informativo antes de exportar.');
      return;
    }
    if (Number.isNaN(consumoMinimoNum)) {
      toast.error('Consumo mínimo inválido.');
      return;
    }
    if (exportRelatorioInformativoExcel(informativeRows, consumoMinimoNum, resumoInformativoExport))
      toast.success('Planilha baixada.');
    else toast.error('Não há linhas para exportar.');
  };

  const fmtBrl = (n: number) =>
    n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  /** Exibição tipo legado: inteiros sem decimais. */
  const fmtConsumoInformativo = (consumo: number) => {
    const rounded = Math.round(consumo);
    if (Math.abs(consumo - rounded) < 1e-6) return `${rounded} m³`;
    return `${consumo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m³`;
  };

  const inputBarClass = 'input h-10 py-0 text-sm min-w-0';

  const demoSelecionadasCount =
    type === 'demonstrativo'
      ? unidadesDemonstrativoFiltradas.filter((u) => selectedDemoUnits[u.id]).length
      : 0;

  const labelUnidadeDemo = (u: ReturnType<typeof mapUnidade>) =>
    u.agrupamentoNome ? `${u.agrupamentoNome}-${u.unidade}` : u.unidade;

  return (
    <div className="w-full max-w-none min-w-0 space-y-5">
      <div className="print:hidden">
        <h1 className="text-xl font-bold text-gray-800">Relatórios</h1>

        <div className="card py-4 px-4 space-y-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-gray-600">Tipo de relatório</span>
          <div className="flex flex-wrap h-auto min-h-10 items-stretch rounded-lg border border-gray-300 overflow-hidden bg-white w-fit max-w-full">
            {(['geral', 'informativo', 'demonstrativo'] as ReportType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`px-4 py-2.5 text-sm font-medium border-r border-gray-200 last:border-r-0 transition-colors ${
                  type === t ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1 shrink-0 min-w-[11rem] w-[min(100%,18rem)]">
            <label className="text-xs font-medium text-gray-600 whitespace-nowrap">Condomínio *</label>
            <select
              className={inputBarClass}
              value={condominioId}
              onChange={(e) => {
                setCondominioId(e.target.value);
                setConsumoId('');
                setAgrupamentoId('');
                setTabelaId('');
              }}
            >
              <option value="">Selecione…</option>
              {(condominios as { id: number; nome: string }[]).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>

          {(type === 'geral' || type === 'informativo' || type === 'demonstrativo') && (
            <div className="flex flex-col gap-1 shrink-0 min-w-[12rem] w-[min(100%,20rem)]">
              <label className="text-xs font-medium text-gray-600 whitespace-nowrap">Ciclo *</label>
              <select className={inputBarClass} value={consumoId} onChange={(e) => setConsumoId(e.target.value)}>
                <option value="">Selecione…</option>
                {(consumos as ConsumoOption[]).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {type === 'geral' && (
            <div className="flex flex-col gap-1 shrink-0 min-w-[10rem] flex-1 basis-[14rem] max-w-xl">
              <label className="text-xs font-medium text-gray-600 whitespace-nowrap">Tabela (ciclo)</label>
              <input
                type="text"
                readOnly
                className={`${inputBarClass} bg-gray-50 text-gray-700 cursor-not-allowed`}
                value={tabelaReadonlyLabel}
                placeholder="—"
                title={tabelaReadonlyLabel || undefined}
              />
            </div>
          )}

          {type === 'demonstrativo' && (
            <div className="flex flex-col gap-1 shrink-0 min-w-[10rem] flex-1 basis-[14rem] max-w-xl">
              <label className="text-xs font-medium text-gray-600 whitespace-nowrap">
                Tabela de impostos (do ciclo, informativa)
              </label>
              <input
                type="text"
                readOnly
                className={`${inputBarClass} bg-gray-50 text-gray-700 cursor-not-allowed`}
                value={tabelaReadonlyLabel}
                placeholder="Selecione o ciclo"
                title={tabelaReadonlyLabel || undefined}
              />
            </div>
          )}

          {type === 'informativo' && (
            <div className="flex flex-col gap-1 shrink-0 w-[6.5rem]">
              <label className="text-xs font-medium text-gray-600 whitespace-nowrap">Mín. m³ *</label>
              <input
                type="number"
                step="0.01"
                className={inputBarClass}
                value={consumoMinimo}
                onChange={(e) => setConsumoMinimo(e.target.value)}
              />
            </div>
          )}


          <div className="flex flex-col gap-1 shrink-0">
            <span className="text-xs font-medium text-gray-600 whitespace-nowrap">Ações</span>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button type="button" onClick={handleGenerate} disabled={loading} className="btn-primary px-4 whitespace-nowrap">
                {loading ? 'Gerando…' : 'Gerar'}
              </button>
              {type === 'geral' && generalRows.length > 0 && (
                <>
                  <button type="button" onClick={handleExportPdfGeral} className="btn-secondary px-3 whitespace-nowrap">
                    PDF
                  </button>
                  <button type="button" onClick={handleExportExcelGeral} className="btn-secondary px-3 whitespace-nowrap">
                    Excel
                  </button>
                </>
              )}
              {type === 'informativo' && informativeRows.length > 0 && (
                <>
                  <button type="button" onClick={handleExportPdfInformativo} className="btn-secondary px-3 whitespace-nowrap">
                    PDF
                  </button>
                  <button type="button" onClick={handleExportExcelInformativo} className="btn-secondary px-3 whitespace-nowrap">
                    Excel
                  </button>
                </>
              )}
              {type === 'demonstrativo' && demoBills.length > 0 && (
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="btn-secondary px-3 whitespace-nowrap"
                >
                  Imprimir
                </button>
              )}
            </div>
          </div>
        </div>

        {type === 'demonstrativo' && condominioId && (
          <div className="space-y-3 pt-3 border-t border-gray-200">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1 shrink-0 min-w-[11rem] w-[min(100%,16rem)]">
                <label className="text-xs font-medium text-gray-600 whitespace-nowrap">
                  Agrupamento (filtro opcional)
                </label>
                <select
                  className={inputBarClass}
                  value={agrupamentoId}
                  onChange={(e) => setAgrupamentoId(e.target.value)}
                >
                  <option value="">Todos os agrupamentos</option>
                  {(agrupamentos as { id: number; nome: string }[]).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nome}
                    </option>
                  ))}
                </select>
              </div>
              {consumoId && dataRefDemonstrativo && (
                <p className="text-xs text-gray-500 pb-2">
                  Referência da conta: <span className="font-medium text-gray-700">{dataRefDemonstrativo}</span> (fim do
                  ciclo)
                </p>
              )}
            </div>
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <span className="text-xs font-medium text-gray-700">
                  Unidades a incluir ({demoSelecionadasCount} de {unidadesDemonstrativoFiltradas.length})
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="text-xs font-medium text-primary-700 hover:text-primary-900"
                    onClick={() => {
                      const next: Record<number, boolean> = { ...selectedDemoUnits };
                      for (const u of unidadesDemonstrativoFiltradas) next[u.id] = true;
                      setSelectedDemoUnits(next);
                    }}
                  >
                    Selecionar todas
                  </button>
                  <button
                    type="button"
                    className="text-xs font-medium text-gray-600 hover:text-gray-900"
                    onClick={() => {
                      const next: Record<number, boolean> = { ...selectedDemoUnits };
                      for (const u of unidadesDemonstrativoFiltradas) next[u.id] = false;
                      setSelectedDemoUnits(next);
                    }}
                  >
                    Limpar seleção
                  </button>
                </div>
              </div>
              <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50/80 p-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {unidadesDemonstrativoFiltradas.length === 0 ? (
                  <p className="text-sm text-gray-500 col-span-full">Nenhuma unidade carregada para este condomínio.</p>
                ) : (
                  unidadesDemonstrativoFiltradas.map((u) => (
                    <label
                      key={u.id}
                      className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer select-none"
                    >
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        checked={Boolean(selectedDemoUnits[u.id])}
                        onChange={() =>
                          setSelectedDemoUnits((prev) => ({ ...prev, [u.id]: !prev[u.id] }))
                        }
                      />
                      <span className="truncate" title={labelUnidadeDemo(u)}>
                        {labelUnidadeDemo(u)}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        <p className="text-xs text-gray-500">
          Geral: tabela completa. Informativo: listas por consumo. Demonstrativo: mesmo layout do módulo contas; escolha o
          ciclo (define tabela e data de referência), filtre por agrupamento se quiser e marque as unidades.
        </p>
        </div>
      </div>

      {type === 'informativo' && informativeRows.length > 0 && (
        <div className="w-full min-w-0 space-y-4">
          <div className="rounded-lg border border-gray-200 bg-[#d2d2d2] px-4 py-4 shadow-sm">
            <div className="flex flex-row items-center justify-between gap-3 min-w-0">
              <img
                src={logoHydrusHorizontalAbsoluteUrl()}
                alt="HIDRUS"
                className="hydrus-print-logo h-10 sm:h-11 w-auto max-w-[min(46%,200px)] sm:max-w-[220px] object-contain object-left shrink-0"
              />
              <div className="flex-1 min-w-0 text-right">
                <p className="text-base font-semibold text-gray-900 leading-snug">
                  {informativeRows[0]?.nomeCondominio}
                </p>
                <p className="text-base font-semibold text-gray-900 leading-snug">Relatório informativo</p>
                <p className="text-sm font-medium text-gray-800 leading-snug">
                  Leitura de {informativeRows[0]?.dataInicial} a {informativeRows[0]?.dataFinal}
                </p>
              </div>
            </div>
          </div>

          <div className="card space-y-8 w-full min-w-0 overflow-hidden">
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-gray-900 m-0 leading-snug">
                Unidades com consumo acima de {consumoMinimo} (m³){' '}
                <span className="text-sm font-normal text-gray-600">
                  (Total de <strong className="text-gray-900">{informativeComConsumo.length}</strong> unidades)
                </span>
              </h2>
              <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-2 text-sm text-gray-900 list-none p-0 m-0">
                {informativeComConsumo.map((r, i) => (
                  <li key={`${r.unidade}-${i}`} className="border-b border-gray-100 pb-2 sm:border-0 sm:pb-0">
                    <span className="font-medium">{r.unidade}</span>
                    <span className="text-gray-600"> (Consumo: {fmtConsumoInformativo(r.consumo)})</span>
                  </li>
                ))}
              </ul>
              {informativeComConsumo.length === 0 && (
                <p className="text-sm text-gray-500 m-0">Nenhuma unidade nesta faixa.</p>
              )}
            </section>

            <section className="space-y-3 border-t border-gray-200 pt-6">
              <h2 className="text-base font-semibold text-gray-900 m-0 leading-snug">
                Unidades sem consumo{' '}
                <span className="text-sm font-normal text-gray-600">
                  (Total de <strong className="text-gray-900">{informativeSemConsumo.length}</strong> unidades)
                </span>
              </h2>
              <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-3 gap-y-2 text-sm text-gray-900 list-none p-0 m-0">
                {informativeSemConsumo.map((r, i) => (
                  <li key={`${r.unidade}-sem-${i}`} className="border-b border-gray-100 pb-1.5">
                    {r.unidade}
                  </li>
                ))}
              </ul>
              {informativeSemConsumo.length === 0 && (
                <p className="text-sm text-gray-500 m-0">Nenhuma unidade sem consumo na seleção.</p>
              )}
            </section>

            <datalist id="informativo-unidades-sugestoes">
              {unidadesInformativoOpcoes.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>

            <section className="space-y-3 border-t border-gray-200 pt-6">
              <h2 className="text-base font-semibold text-gray-900 m-0 leading-snug">
                Unidades com hidrômetro voltando{' '}
                <span className="text-sm font-normal text-gray-600">
                  (Total de <strong className="text-gray-900">{resumoInformativo.unidadesVoltando.length}</strong>{' '}
                  unidades)
                </span>
              </h2>
              {isAdministrador && (
                <div className="flex flex-wrap items-end gap-2 print:hidden">
                  <div className="flex flex-col gap-1 min-w-[12rem] flex-1 basis-[14rem]">
                    <label className="text-xs font-medium text-gray-600">Unidade (lista ou digite)</label>
                    <input
                      type="text"
                      className={inputBarClass}
                      list="informativo-unidades-sugestoes"
                      value={pickInformativoVoltando}
                      onChange={(e) => setPickInformativoVoltando(e.target.value)}
                      placeholder="Ex.: F-401"
                    />
                  </div>
                  <button
                    type="button"
                    className="btn-secondary px-3 h-10 shrink-0"
                    onClick={() =>
                      addUnidadeInformativo('unidadesVoltando', pickInformativoVoltando, () =>
                        setPickInformativoVoltando('')
                      )
                    }
                  >
                    Adicionar
                  </button>
                </div>
              )}
              <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-3 gap-y-2 text-sm text-gray-900 list-none p-0 m-0">
                {[...resumoInformativo.unidadesVoltando]
                  .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }))
                  .map((u) => (
                    <li
                      key={`volt-${u}`}
                      className="inline-flex items-center gap-1 rounded-full bg-slate-200/90 text-slate-900 px-2.5 py-1"
                    >
                      <span className="truncate" title={u}>
                        {u}
                      </span>
                      {isAdministrador && (
                        <button
                          type="button"
                          className="text-slate-600 hover:text-red-700 shrink-0 print:hidden p-0.5"
                          aria-label={`Remover ${u}`}
                          onClick={() => removeUnidadeInformativo('unidadesVoltando', u)}
                        >
                          ×
                        </button>
                      )}
                    </li>
                  ))}
              </ul>
              {resumoInformativo.unidadesVoltando.length === 0 && (
                <p className="text-sm text-gray-500 m-0">Nenhuma unidade nesta lista.</p>
              )}
            </section>

            <section className="space-y-3 border-t border-gray-200 pt-6">
              <h2 className="text-base font-semibold text-gray-900 m-0 leading-snug">
                Unidades com água no relógio{' '}
                <span className="text-sm font-normal text-gray-600">
                  (Total de <strong className="text-gray-900">{resumoInformativo.unidadesAguaNoRelogio.length}</strong>{' '}
                  unidades)
                </span>
              </h2>
              {isAdministrador && (
                <div className="flex flex-wrap items-end gap-2 print:hidden">
                  <div className="flex flex-col gap-1 min-w-[12rem] flex-1 basis-[14rem]">
                    <label className="text-xs font-medium text-gray-600">Unidade (lista ou digite)</label>
                    <input
                      type="text"
                      className={inputBarClass}
                      list="informativo-unidades-sugestoes"
                      value={pickInformativoAgua}
                      onChange={(e) => setPickInformativoAgua(e.target.value)}
                      placeholder="Ex.: CASA-36"
                    />
                  </div>
                  <button
                    type="button"
                    className="btn-secondary px-3 h-10 shrink-0"
                    onClick={() =>
                      addUnidadeInformativo('unidadesAguaNoRelogio', pickInformativoAgua, () =>
                        setPickInformativoAgua('')
                      )
                    }
                  >
                    Adicionar
                  </button>
                </div>
              )}
              <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-3 gap-y-2 text-sm text-gray-900 list-none p-0 m-0">
                {[...resumoInformativo.unidadesAguaNoRelogio]
                  .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }))
                  .map((u) => (
                    <li
                      key={`agua-${u}`}
                      className="inline-flex items-center gap-1 rounded-full bg-slate-200/90 text-slate-900 px-2.5 py-1"
                    >
                      <span className="truncate" title={u}>
                        {u}
                      </span>
                      {isAdministrador && (
                        <button
                          type="button"
                          className="text-slate-600 hover:text-red-700 shrink-0 print:hidden p-0.5"
                          aria-label={`Remover ${u}`}
                          onClick={() => removeUnidadeInformativo('unidadesAguaNoRelogio', u)}
                        >
                          ×
                        </button>
                      )}
                    </li>
                  ))}
              </ul>
              {resumoInformativo.unidadesAguaNoRelogio.length === 0 && (
                <p className="text-sm text-gray-500 m-0">Nenhuma unidade nesta lista.</p>
              )}
            </section>

            <section className="space-y-3 border-t border-gray-200 pt-6">
              <h2 className="text-base font-semibold text-gray-900 m-0 leading-snug">
                Unidades com vazamento{' '}
                <span className="text-sm font-normal text-gray-600">
                  (Total de <strong className="text-gray-900">{resumoInformativo.unidadesVazamento.length}</strong>{' '}
                  unidades)
                </span>
              </h2>
              {isAdministrador && (
                <div className="flex flex-wrap items-end gap-2 print:hidden">
                  <div className="flex flex-col gap-1 min-w-[12rem] flex-1 basis-[14rem]">
                    <label className="text-xs font-medium text-gray-600">Unidade (lista ou digite)</label>
                    <input
                      type="text"
                      className={inputBarClass}
                      list="informativo-unidades-sugestoes"
                      value={pickInformativoVazamento}
                      onChange={(e) => setPickInformativoVazamento(e.target.value)}
                      placeholder="Ex.: CASA-55"
                    />
                  </div>
                  <button
                    type="button"
                    className="btn-secondary px-3 h-10 shrink-0"
                    onClick={() =>
                      addUnidadeInformativo('unidadesVazamento', pickInformativoVazamento, () =>
                        setPickInformativoVazamento('')
                      )
                    }
                  >
                    Adicionar
                  </button>
                </div>
              )}
              <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-3 gap-y-2 text-sm text-gray-900 list-none p-0 m-0">
                {[...resumoInformativo.unidadesVazamento]
                  .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }))
                  .map((u) => (
                    <li
                      key={`vaz-${u}`}
                      className="inline-flex items-center gap-1 rounded-full bg-slate-200/90 text-slate-900 px-2.5 py-1"
                    >
                      <span className="truncate" title={u}>
                        {u}
                      </span>
                      {isAdministrador && (
                        <button
                          type="button"
                          className="text-slate-600 hover:text-red-700 shrink-0 print:hidden p-0.5"
                          aria-label={`Remover ${u}`}
                          onClick={() => removeUnidadeInformativo('unidadesVazamento', u)}
                        >
                          ×
                        </button>
                      )}
                    </li>
                  ))}
              </ul>
              {resumoInformativo.unidadesVazamento.length === 0 && (
                <p className="text-sm text-gray-500 m-0">Nenhuma unidade nesta lista.</p>
              )}
            </section>

            {isAdministrador && (
              <div className="rounded-lg border border-amber-200/80 bg-amber-50/40 px-4 py-4 space-y-2 border-t-0 print:hidden">
                <p className="text-xs text-gray-600 m-0">
                  Resumo informativo gravado em{' '}
                  <code className="text-[11px] bg-white/80 px-1 rounded">
                    TB_RELATORIO_INFORMATIVO_RESUMO
                  </code>{' '}
                  (ou arquivo legado até migrar). Endpoint:{' '}
                  <code className="text-[11px] bg-white/80 px-1 rounded">
                    /api/reports/brief/informative/&#123;consumo&#125;/&#123;condomínio&#125;
                  </code>
                  .
                </p>
                <button
                  type="button"
                  className="btn-primary px-4"
                  disabled={savingResumoInformativo || !consumoId || !condominioId}
                  onClick={() => void salvarResumoInformativo()}
                >
                  {savingResumoInformativo ? 'Salvando…' : 'Salvar resumo informativo'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {type === 'geral' && tabelaPreviewRows.length > 0 && (
        <div className="w-full min-w-0 space-y-4 print:overflow-visible">
          <div className="rounded-lg border border-gray-200 bg-[#d2d2d2] px-4 py-4 shadow-sm">
            <div className="flex flex-row items-center justify-between gap-3 min-w-0">
              <img
                src={logoHydrusHorizontalAbsoluteUrl()}
                alt="HIDRUS"
                className="hydrus-print-logo h-10 sm:h-11 w-auto max-w-[min(46%,200px)] sm:max-w-[220px] object-contain object-left shrink-0"
              />
              <div className="flex-1 min-w-0 text-right">
                <p className="text-base font-semibold text-gray-900 leading-snug">
                  {tabelaPreviewRows[0]?.nomeCondominio || 'Condomínio'}
                </p>
                <p className="text-base font-semibold text-gray-900 leading-snug">Relatório geral</p>
                <p className="text-sm font-medium text-gray-800 leading-snug">
                  Leitura de {tabelaPreviewRows[0]?.dataInicial} a {tabelaPreviewRows[0]?.dataFinal}
                  {tabelaPreviewRows[0]?.dataProximaLeitura
                    ? ` · Próx. leitura ${tabelaPreviewRows[0].dataProximaLeitura}`
                    : ''}
                </p>
              </div>
            </div>
          </div>
          <div className="card space-y-3 w-full min-w-0 overflow-hidden print:overflow-visible print:shadow-none">
            <div className="max-h-[min(70vh,36rem)] overflow-auto rounded-lg border border-gray-200 print:max-h-none print:overflow-visible">
            <table className="min-w-full text-sm text-left">
              <thead className="bg-slate-800 text-white">
                <tr>
                  <th className="px-3 py-2 font-medium whitespace-nowrap text-center w-14">Ordem</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">Unidade</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap text-right">Leit. ant.</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap text-right">Leit. atual</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap text-right">Consumo (m³)</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap text-right">Valor a pagar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {tabelaPreviewRows.map((r, i) => (
                  <tr key={`${r.unidade}-${i}`} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-center tabular-nums text-gray-700">{i + 1}</td>
                    <td className="px-3 py-2 text-gray-900">{r.unidade}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.leituraAnterior}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.leituraAtual}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatConsumoRelatorioGeralM3(r.consumo)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-900">{fmtBrl(r.valorPagar)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-100 font-medium text-slate-900">
                <tr>
                  <td className="px-3 py-2" colSpan={4}>
                    Totais
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatConsumoRelatorioGeralM3(tabelaPreviewRows.reduce((a, r) => a + r.consumo, 0))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtBrl(tabelaPreviewRows.reduce((a, r) => a + r.valorPagar, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
            </div>

            {isAdministrador && (
              <div className="rounded-lg border border-amber-200/80 bg-amber-50/40 px-4 py-4 space-y-4">
                <h2 className="text-base font-semibold text-gray-900 m-0">Resumo</h2>
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-gray-800 m-0">Conta CAESB</h3>
                  <div className="flex flex-wrap gap-3">
                    <div className="flex flex-col gap-1 min-w-[8rem] flex-1 basis-[10rem]">
                      <label className="text-xs font-medium text-gray-600">Mês/ano</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        maxLength={7}
                        className={inputBarClass}
                        placeholder="mm/aaaa"
                        value={resumoGeral.dataCaesb}
                        onChange={(e) =>
                          setResumoGeral((p) => ({ ...p, dataCaesb: maskMesAnoMmAaaa(e.target.value) }))
                        }
                      />
                    </div>
                    <div className="flex flex-col gap-1 min-w-[8rem] flex-1 basis-[10rem]">
                      <label className="text-xs font-medium text-gray-600">Consumo total (m³)</label>
                      <input
                        type="number"
                        className={inputBarClass}
                        value={resumoGeral.totalConsumoStr}
                        onChange={(e) => setResumoGeral((p) => ({ ...p, totalConsumoStr: e.target.value }))}
                      />
                    </div>
                    <div className="flex flex-col gap-1 min-w-[8rem] flex-1 basis-[10rem]">
                      <label className="text-xs font-medium text-gray-600">Valor total (R$)</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        className={`${inputBarClass} tabular-nums`}
                        placeholder="0,00"
                        value={resumoGeral.totalCaesbStr}
                        onChange={(e) =>
                          setResumoGeral((p) => ({ ...p, totalCaesbStr: maskBrlMoneyInput(e.target.value) }))
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-gray-800 m-0">Hidrômetro geral</h3>
                  <div className="flex flex-wrap gap-3">
                    <div className="flex flex-col gap-1 min-w-[8rem] flex-1 basis-[10rem]">
                      <label className="text-xs font-medium text-gray-600">Leitura anterior (m³)</label>
                      <input
                        type="number"
                        className={inputBarClass}
                        value={resumoGeral.leituraAntCondStr}
                        onChange={(e) => setResumoGeral((p) => ({ ...p, leituraAntCondStr: e.target.value }))}
                      />
                    </div>
                    <div className="flex flex-col gap-1 min-w-[8rem] flex-1 basis-[10rem]">
                      <label className="text-xs font-medium text-gray-600">Leitura atual (m³)</label>
                      <input
                        type="number"
                        className={inputBarClass}
                        value={resumoGeral.leituraAtualCondStr}
                        onChange={(e) => setResumoGeral((p) => ({ ...p, leituraAtualCondStr: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-gray-800 m-0">Lixeiras</h3>
                  <div className="flex flex-wrap gap-3 items-end">
                    <div className="flex flex-col gap-1 min-w-[8rem] flex-1 basis-[10rem]">
                      <label className="text-xs font-medium text-gray-600">Bloco (agrupamento)</label>
                      <input
                        type="text"
                        className={inputBarClass}
                        placeholder="Bloco"
                        value={draftLixeira.agrupamento}
                        onChange={(e) => setDraftLixeira((d) => ({ ...d, agrupamento: e.target.value }))}
                      />
                    </div>
                    <div className="flex flex-col gap-1 min-w-[7rem] w-[7.5rem]">
                      <label className="text-xs font-medium text-gray-600">Leit. ant.</label>
                      <input
                        type="number"
                        className={inputBarClass}
                        value={draftLixeira.leituraAnterior}
                        onChange={(e) => setDraftLixeira((d) => ({ ...d, leituraAnterior: e.target.value }))}
                      />
                    </div>
                    <div className="flex flex-col gap-1 min-w-[7rem] w-[7.5rem]">
                      <label className="text-xs font-medium text-gray-600">Leit. atual</label>
                      <input
                        type="number"
                        className={inputBarClass}
                        value={draftLixeira.leituraAtual}
                        onChange={(e) => setDraftLixeira((d) => ({ ...d, leituraAtual: e.target.value }))}
                      />
                    </div>
                    <button type="button" className="btn-secondary px-4 h-10 shrink-0" onClick={addLixeiraRow}>
                      Adicionar lixeira
                    </button>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                    {resumoGeral.lixeiras.length === 0 ? (
                      <p className="text-xs text-gray-500 px-3 py-3 m-0">Nenhuma lixeira neste resumo.</p>
                    ) : (
                      <table className="min-w-full text-sm text-left">
                        <thead className="bg-slate-800 text-white">
                          <tr>
                            <th className="px-3 py-2 font-medium">Bloco</th>
                            <th className="px-3 py-2 font-medium text-right">Leitura anterior</th>
                            <th className="px-3 py-2 font-medium text-right">Leitura atual</th>
                            <th className="px-3 py-2 font-medium text-right">Consumo</th>
                            <th className="px-3 py-2 font-medium text-center w-24">Remover?</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {[...resumoGeral.lixeiras]
                            .sort((a, b) =>
                              a.agrupamento.localeCompare(b.agrupamento, 'pt-BR', { sensitivity: 'base' })
                            )
                            .map((lix) => (
                              <tr key={lix.id} className="hover:bg-slate-50">
                                <td className="px-3 py-2 text-gray-900">{lix.agrupamento}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{lix.leituraAnterior}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{lix.leituraAtual}</td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {lix.leituraAtual - lix.leituraAnterior}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <button
                                    type="button"
                                    className="text-red-600 hover:text-red-800 text-xs font-medium"
                                    onClick={() => removeLixeiraRow(lix.id)}
                                  >
                                    Remover
                                  </button>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  className="btn-primary px-4"
                  disabled={savingResumo || !consumoId || !condominioId}
                  onClick={() => void salvarResumoGeral()}
                >
                  {savingResumo ? 'Salvando…' : 'Salvar resumo'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {type === 'informativo' && result != null && Array.isArray(result) && result.length === 0 && (
        <div className="card text-sm text-gray-600">
          Nenhuma unidade entrou neste relatório. No legado entram só unidades com consumo acima do mínimo ou com
          consumo zero; faixas entre 0 e o mínimo ficam de fora.
        </div>
      )}

      {type === 'demonstrativo' && demoBills.length > 0 && (
        <div className="w-full min-w-0 space-y-8 print:space-y-0">
          {demoBills.map((bill, i) => (
            <div key={`${bill.IdUnidade ?? 'u'}-${i}`} className="demonstrativo-bill-break">
              <DemonstrativoConta
                bill={bill}
                anoRef={anoMesDemonstrativo.y}
                mesRef={anoMesDemonstrativo.m}
                showPrintButton={false}
              />
            </div>
          ))}
        </div>
      )}

      {result != null &&
        ((type === 'geral' && generalRows.length === 0) ||
          (type === 'informativo' && !Array.isArray(result)) ||
          (type === 'informativo' && Array.isArray(result) && informativeRows.length === 0 && result.length > 0)) && (
        <div className="card w-full min-w-0">
          <p className="text-xs text-gray-500 mb-2">
            {type === 'geral' && generalRows.length === 0
              ? 'Resposta vazia ou formato inesperado.'
              : type === 'informativo' && Array.isArray(result) && result.length > 0 && informativeRows.length === 0
                ? 'Formato de resposta inesperado (JSON bruto):'
                : 'Resposta da API (JSON):'}
          </p>
          <pre className="text-xs text-gray-700 whitespace-pre-wrap overflow-x-auto max-h-[480px] overflow-y-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
