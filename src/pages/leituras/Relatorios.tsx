import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import {
  exportRelatorioGeralExcel,
  exportRelatorioGeralPdf,
  exportRelatorioInformativoExcel,
  exportRelatorioInformativoPdf,
  parseGeneralReportApi,
  type GeneralReportRow,
} from '../../lib/exportRelatorioGeral';
import DemonstrativoConta, { type UnitBill } from '../../components/conta/DemonstrativoConta';
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
  const [demoBills, setDemoBills] = useState<UnitBill[]>([]);
  /** Unidades marcadas no demonstrativo (id → incluir). */
  const [selectedDemoUnits, setSelectedDemoUnits] = useState<Record<number, boolean>>({});

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
        toast.success('Relatório gerado. Exporte em PDF ou Excel.');
      } else if (type === 'informativo') {
        const res = await api.get(`/reports/informative/${consumoMinimo}`, {
          params: { idConsumption: consumoId },
        });
        setResult(res.data);
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

  const downloadJson = () => {
    if (type === 'demonstrativo') {
      if (demoBills.length === 0) return;
      const blob = new Blob([JSON.stringify(demoBills, null, 2)], { type: 'application/json' });
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `relatorio-demonstrativo.json`;
      a.click();
      URL.revokeObjectURL(href);
      return;
    }
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = `relatorio-${type}.json`;
    a.click();
    URL.revokeObjectURL(href);
  };

  const handleExportPdfGeral = () => {
    if (generalRows.length === 0) {
      toast.error('Gere o relatório geral antes de exportar.');
      return;
    }
    if (exportRelatorioGeralPdf(generalRows)) toast.success('PDF baixado.');
    else toast.error('Não há linhas para exportar.');
  };

  const handleExportExcelGeral = () => {
    if (generalRows.length === 0) {
      toast.error('Gere o relatório geral antes de exportar.');
      return;
    }
    if (exportRelatorioGeralExcel(generalRows)) toast.success('Planilha baixada.');
    else toast.error('Não há linhas para exportar.');
  };

  const consumoMinimoNum = Number(consumoMinimo);

  const handleExportPdfInformativo = () => {
    if (informativeRows.length === 0) {
      toast.error('Gere o relatório informativo antes de exportar.');
      return;
    }
    if (Number.isNaN(consumoMinimoNum)) {
      toast.error('Consumo mínimo inválido.');
      return;
    }
    if (exportRelatorioInformativoPdf(informativeRows, consumoMinimoNum)) toast.success('PDF baixado.');
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
    if (exportRelatorioInformativoExcel(informativeRows, consumoMinimoNum)) toast.success('Planilha baixada.');
    else toast.error('Não há linhas para exportar.');
  };

  const fmtBrl = (n: number) =>
    n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtM3 = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
              {type === 'demonstrativo' && demoBills.length > 0 && (
                <button type="button" onClick={downloadJson} className="btn-secondary px-3 whitespace-nowrap">
                  JSON
                </button>
              )}
              {result != null && (type === 'geral' || type === 'informativo') && (
                <button type="button" onClick={downloadJson} className="btn-secondary px-3 text-gray-600 whitespace-nowrap">
                  JSON
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
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <img
                src="/images/logo-hydrus-horizontal.png"
                alt="HIDRUS"
                className="h-11 sm:h-12 w-auto max-w-[min(100%,260px)] object-contain object-left shrink-0 mx-auto sm:mx-0"
              />
              <div className="flex-1 text-center sm:text-left min-w-0">
                <p className="text-base font-semibold text-gray-900">{informativeRows[0]?.nomeCondominio}</p>
                <p className="text-base font-semibold text-gray-900">Relatório informativo</p>
                <p className="text-sm font-medium text-gray-800">
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
          </div>
        </div>
      )}

      {type === 'geral' && tabelaPreviewRows.length > 0 && (
        <div className="w-full min-w-0 space-y-4">
          <div className="rounded-lg border border-gray-200 bg-[#d2d2d2] px-4 py-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <img
                src="/images/logo-hydrus-horizontal.png"
                alt="HIDRUS"
                className="h-11 sm:h-12 w-auto max-w-[min(100%,260px)] object-contain object-left shrink-0 mx-auto sm:mx-0"
              />
              <div className="flex-1 text-center sm:text-left min-w-0">
                <p className="text-base font-semibold text-gray-900">
                  {tabelaPreviewRows[0]?.nomeCondominio || 'Condomínio'}
                </p>
                <p className="text-base font-semibold text-gray-900">Relatório geral</p>
                <p className="text-sm font-medium text-gray-800">
                  Leitura de {tabelaPreviewRows[0]?.dataInicial} a {tabelaPreviewRows[0]?.dataFinal}
                  {tabelaPreviewRows[0]?.dataProximaLeitura
                    ? ` · Próx. leitura ${tabelaPreviewRows[0].dataProximaLeitura}`
                    : ''}
                </p>
              </div>
            </div>
          </div>
          <div className="card space-y-3 w-full min-w-0 overflow-hidden">
            <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-sm text-left">
              <thead className="bg-slate-800 text-white">
                <tr>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">Unidade</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap text-right">Leit. ant.</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap text-right">Leit. atual</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap text-right">Consumo (m³)</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap text-right">Val. excedente</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap text-right">Tar. conting.</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap text-right">Área comum</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap text-right">Valor a pagar</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">Hidrômetro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {tabelaPreviewRows.map((r, i) => (
                  <tr key={`${r.unidade}-${i}`} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-gray-900">{r.unidade}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.leituraAnterior}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.leituraAtual}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtM3(r.consumo)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtBrl(r.valorExcedente)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtBrl(r.tarifaContingencia)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtBrl(r.valorAreaComum)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-900">{fmtBrl(r.valorPagar)}</td>
                    <td className="px-3 py-2 text-gray-600">{r.hidrometro || '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-100 font-medium text-slate-900">
                <tr>
                  <td className="px-3 py-2">Totais</td>
                  <td className="px-3 py-2 text-right" colSpan={2} />
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtM3(tabelaPreviewRows.reduce((a, r) => a + r.consumo, 0))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtBrl(tabelaPreviewRows.reduce((a, r) => a + r.valorExcedente, 0))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtBrl(tabelaPreviewRows.reduce((a, r) => a + r.tarifaContingencia, 0))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtBrl(tabelaPreviewRows.reduce((a, r) => a + r.valorAreaComum, 0))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtBrl(tabelaPreviewRows.reduce((a, r) => a + r.valorPagar, 0))}
                  </td>
                  <td className="px-3 py-2" />
                </tr>
              </tfoot>
            </table>
            </div>
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
