import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import { mapCondominio, mapTabelaImposto, mapUnidade } from '../../lib/hidrusApi';

type ReportType = 'geral' | 'informativo' | 'demonstrativo';

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
        ? api
            .get(`/consumption/condominium/${condominioId}`)
            .then((r) => (Array.isArray(r.data) ? r.data : []).map((x: unknown) => {
              const c = x as Record<string, unknown>;
              return {
                id: Number(c.Id ?? c.id),
                label: `${String(c.DataInicio ?? '').slice(0, 10)} → ${String(c.DataFim ?? '').slice(0, 10)}`,
              };
            }))
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

  const handleGenerate = async () => {
    if (!condominioId || !tabelaId) {
      toast.error('Selecione o condomínio e a tabela de impostos');
      return;
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
        res = await api.get(`/reports/general/consumo/${consumoId}/tabela/${tabelaId}`);
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
      toast.success('Dados gerados (visualização JSON).');
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

  return (
    <div className="space-y-5 max-w-3xl">
      <h1 className="text-xl font-bold text-gray-800">Relatórios</h1>

      <div className="card space-y-4">
        <p className="text-sm text-gray-600">
          A API Laravel devolve JSON (não PDF). Use os dados abaixo ou baixe o arquivo JSON.
        </p>

        <div>
          <label className="label">Tipo de relatório</label>
          <div className="flex gap-2 flex-wrap">
            {(['geral', 'informativo', 'demonstrativo'] as ReportType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  type === t
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-primary-400'
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Condomínio *</label>
            <select
              className="input"
              value={condominioId}
              onChange={(e) => {
                setCondominioId(e.target.value);
                setConsumoId('');
                setAgrupamentoId('');
                setUnidadeId('');
              }}
            >
              <option value="">Selecione...</option>
              {(condominios as { id: number; nome: string }[]).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Tabela de impostos *</label>
            <select className="input" value={tabelaId} onChange={(e) => setTabelaId(e.target.value)}>
              <option value="">Selecione...</option>
              {(tabelas as { id: number; nome: string }[]).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </div>
        </div>

        {type !== 'demonstrativo' && (
          <div>
            <label className="label">Ciclo de consumo *</label>
            <select className="input" value={consumoId} onChange={(e) => setConsumoId(e.target.value)}>
              <option value="">Selecione...</option>
              {(consumos as { id: number; label: string }[]).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {type === 'informativo' && (
          <div>
            <label className="label">Consumo mínimo (m³) *</label>
            <input
              type="number"
              step="0.01"
              className="input max-w-xs"
              value={consumoMinimo}
              onChange={(e) => setConsumoMinimo(e.target.value)}
            />
          </div>
        )}

        {type === 'demonstrativo' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Agrupamento *</label>
              <select
                className="input"
                value={agrupamentoId}
                onChange={(e) => {
                  setAgrupamentoId(e.target.value);
                  setUnidadeId('');
                }}
                disabled={!condominioId}
              >
                <option value="">Selecione...</option>
                {(agrupamentos as { id: number; nome: string }[]).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Unidade *</label>
              <select className="input" value={unidadeId} onChange={(e) => setUnidadeId(e.target.value)} disabled={!agrupamentoId}>
                <option value="">Selecione...</option>
                {(unidades as { id: number; unidade: string }[]).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.unidade}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">Data de referência (leitura) *</label>
              <input type="date" className="input" value={dataRef} onChange={(e) => setDataRef(e.target.value)} />
            </div>
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={handleGenerate} disabled={loading} className="btn-primary">
            {loading ? 'Gerando...' : 'Gerar relatório'}
          </button>
          {result != null && (
            <button type="button" onClick={downloadJson} className="btn-secondary">
              Baixar JSON
            </button>
          )}
        </div>
      </div>

      {result != null && (
        <div className="card">
          <pre className="text-xs text-gray-700 whitespace-pre-wrap overflow-x-auto max-h-[480px] overflow-y-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
