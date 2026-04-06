import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import {
  exportRelatorioGeralExcel,
  exportRelatorioGeralPdf,
  parseGeneralReportApi,
} from '../../lib/exportRelatorioGeral';
import { mapCondominio, mapTabelaImposto, mapUnidade } from '../../lib/hidrusApi';

type ReportType = 'geral' | 'informativo' | 'demonstrativo';

type ConsumoOption = {
  id: number;
  label: string;
  idTabelaImposto: number;
  tabelaNome: string;
};

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
  const [unidadeId, setUnidadeId] = useState('');
  const [tabelaId, setTabelaId] = useState('');
  const [consumoMinimo, setConsumoMinimo] = useState('10');
  const [dataRef, setDataRef] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);

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
              } satisfies ConsumoOption;
            })
          )
        : Promise.resolve([]),
    enabled: !!condominioId,
  });

  const { data: agrupamentos = [] } = useQuery({
    queryKey: ['agrupamentos-by-cond', condominioId],
    queryFn: () =>
      condominioId
        ? api.get(`/grouping/condominio/${condominioId}`).then((r) =>
            (Array.isArray(r.data) ? r.data : []).map((a: unknown) => {
              const x = a as Record<string, unknown>;
              return { id: Number(x.Id ?? x.id), nome: String(x.Nome ?? x.nome ?? '') };
            })
          )
        : Promise.resolve([]),
    enabled: !!condominioId,
  });

  const { data: unidades = [] } = useQuery({
    queryKey: ['unidades-by-agrup', agrupamentoId],
    queryFn: () =>
      agrupamentoId
        ? api.get(`/Unit/agrupamento/${agrupamentoId}`).then((r) =>
            (Array.isArray(r.data) ? r.data : []).map(mapUnidade)
          )
        : Promise.resolve([]),
    enabled: !!agrupamentoId,
  });

  useEffect(() => {
    if (type !== 'geral') return;
    if (!consumoId) {
      setTabelaId('');
      return;
    }
    const c = (consumos as ConsumoOption[]).find((x) => String(x.id) === consumoId);
    if (c?.idTabelaImposto) setTabelaId(String(c.idTabelaImposto));
  }, [type, consumoId, consumos]);

  const tabelaReadonlyLabel = useMemo(() => {
    if (type !== 'geral' || !consumoId) return '';
    const c = (consumos as ConsumoOption[]).find((x) => String(x.id) === consumoId);
    if (!c?.idTabelaImposto) return '';
    if (c.tabelaNome) return `${c.tabelaNome} (id ${c.idTabelaImposto})`;
    const t = (tabelas as { id: number; nome: string }[]).find((x) => x.id === c.idTabelaImposto);
    return t ? `${t.nome} (id ${c.idTabelaImposto})` : `Tabela id ${c.idTabelaImposto}`;
  }, [type, consumoId, consumos, tabelas]);

  const generalRows = useMemo(() => {
    if (type !== 'geral' || result == null) return [];
    return parseGeneralReportApi(result);
  }, [type, result]);

  const handleGenerate = async () => {
    if (!condominioId) {
      toast.error('Selecione o condomínio');
      return;
    }
    if (type === 'demonstrativo' && !tabelaId) {
      toast.error('Selecione a tabela de impostos');
      return;
    }
    if (type === 'geral') {
      if (!consumoId) {
        toast.error('Selecione o período de consumo (ciclo)');
        return;
      }
      const c = (consumos as ConsumoOption[]).find((x) => String(x.id) === consumoId);
      if (!c?.idTabelaImposto) {
        toast.error('O ciclo selecionado não possui tabela de impostos cadastrada');
        return;
      }
    }
    if (type !== 'demonstrativo' && !consumoId) {
      toast.error('Selecione o período de consumo (ciclo)');
      return;
    }
    if (type === 'informativo' && !consumoMinimo) {
      toast.error('Informe o consumo mínimo');
      return;
    }
    if (type === 'demonstrativo' && !unidadeId) {
      toast.error('Selecione a unidade para o demonstrativo');
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      let res;
      if (type === 'geral') {
        const c = (consumos as ConsumoOption[]).find((x) => String(x.id) === consumoId);
        const tid = c?.idTabelaImposto ?? Number(tabelaId);
        res = await api.get(`/reports/general/consumo/${consumoId}/tabela/${tid}`);
      } else if (type === 'informativo') {
        res = await api.get(`/reports/informative/${consumoMinimo}`, {
          params: { idConsumption: consumoId },
        });
      } else {
        res = await api.get(`/reports/bill/unidade/${unidadeId}`, {
          params: { idTabela: tabelaId, dataSelecionada: dataRef },
        });
      }
      setResult(res.data);
      toast.success(type === 'geral' ? 'Relatório gerado. Exporte em PDF ou Excel.' : 'Dados gerados.');
    } catch {
      toast.error('Erro ao gerar relatório');
    } finally {
      setLoading(false);
    }
  };

  const downloadJson = () => {
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

  const fmtBrl = (n: number) =>
    n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtM3 = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const inputBarClass = 'input h-10 py-0 text-sm min-w-0';

  return (
    <div className="w-full max-w-none min-w-0 space-y-5">
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
                setUnidadeId('');
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

          {type === 'demonstrativo' && (
            <div className="flex flex-col gap-1 shrink-0 min-w-[10rem] w-[min(100%,16rem)]">
              <label className="text-xs font-medium text-gray-600 whitespace-nowrap">Tabela *</label>
              <select className={inputBarClass} value={tabelaId} onChange={(e) => setTabelaId(e.target.value)}>
                <option value="">Selecione…</option>
                {(tabelas as { id: number; nome: string }[]).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
            </div>
          )}

          {type !== 'demonstrativo' && (
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

          {type === 'demonstrativo' && (
            <>
              <div className="flex flex-col gap-1 shrink-0 min-w-[9rem] w-[min(100%,14rem)]">
                <label className="text-xs font-medium text-gray-600 whitespace-nowrap">Agrupamento *</label>
                <select
                  className={inputBarClass}
                  value={agrupamentoId}
                  onChange={(e) => {
                    setAgrupamentoId(e.target.value);
                    setUnidadeId('');
                  }}
                  disabled={!condominioId}
                >
                  <option value="">Selecione…</option>
                  {(agrupamentos as { id: number; nome: string }[]).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1 shrink-0 min-w-[9rem] w-[min(100%,14rem)]">
                <label className="text-xs font-medium text-gray-600 whitespace-nowrap">Unidade *</label>
                <select
                  className={inputBarClass}
                  value={unidadeId}
                  onChange={(e) => setUnidadeId(e.target.value)}
                  disabled={!agrupamentoId}
                >
                  <option value="">Selecione…</option>
                  {(unidades as { id: number; unidade: string }[]).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.unidade}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1 shrink-0 w-[10.5rem]">
                <label className="text-xs font-medium text-gray-600 whitespace-nowrap">Data ref. *</label>
                <input type="date" className={inputBarClass} value={dataRef} onChange={(e) => setDataRef(e.target.value)} />
              </div>
            </>
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
              {result != null && type !== 'geral' && (
                <button type="button" onClick={downloadJson} className="btn-secondary px-3 whitespace-nowrap">
                  JSON
                </button>
              )}
              {result != null && type === 'geral' && (
                <button type="button" onClick={downloadJson} className="btn-secondary px-3 text-gray-600 whitespace-nowrap">
                  JSON
                </button>
              )}
            </div>
          </div>
        </div>

        <p className="text-xs text-gray-500">
          Geral: tabela e exportação PDF/Excel. Informativo e demonstrativo: resposta em JSON para conferência.
        </p>
      </div>

      {type === 'geral' && generalRows.length > 0 && (
        <div className="card space-y-3 w-full min-w-0 overflow-hidden">
          <div className="text-sm text-gray-700">
            <span className="font-semibold">{generalRows[0]?.nomeCondominio || 'Condomínio'}</span>
            <span className="text-gray-500">
              {' '}
              · Período {generalRows[0]?.dataInicial} — {generalRows[0]?.dataFinal}
              {generalRows[0]?.dataProximaLeitura ? ` · Próx. leitura ${generalRows[0].dataProximaLeitura}` : ''}
            </span>
          </div>
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
                {generalRows.map((r, i) => (
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
                    {fmtM3(generalRows.reduce((a, r) => a + r.consumo, 0))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtBrl(generalRows.reduce((a, r) => a + r.valorExcedente, 0))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtBrl(generalRows.reduce((a, r) => a + r.tarifaContingencia, 0))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtBrl(generalRows.reduce((a, r) => a + r.valorAreaComum, 0))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtBrl(generalRows.reduce((a, r) => a + r.valorPagar, 0))}
                  </td>
                  <td className="px-3 py-2" />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {result != null && (type !== 'geral' || generalRows.length === 0) && (
        <div className="card w-full min-w-0">
          <p className="text-xs text-gray-500 mb-2">
            {type === 'geral' && generalRows.length === 0 ? 'Resposta vazia ou formato inesperado.' : 'Resposta da API (JSON):'}
          </p>
          <pre className="text-xs text-gray-700 whitespace-pre-wrap overflow-x-auto max-h-[480px] overflow-y-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
