import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import api from '../../lib/api';
import { mapCondominio, mapMensuration, mapUnidade } from '../../lib/hidrusApi';
import DataTable from '../../components/DataTable';

interface Leitura {
  id: number;
  data: string;
  valor: number;
  unidade: string;
  agrupamento: string;
  condominio: string;
  imagemUrl?: string;
}

export default function LeiturasIndex() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [condominioId, setCondominioId] = useState('');
  const [agrupamentoId, setAgrupamentoId] = useState('');
  const [unidadeId, setUnidadeId] = useState('');
  const [ano, setAno] = useState(String(currentYear));
  const [mes, setMes] = useState(String(currentMonth));

  const { data: condominios = [] } = useQuery({
    queryKey: ['condominios'],
    queryFn: () =>
      api.get('/Condominium/condominium').then((r) => (Array.isArray(r.data) ? r.data : []).map(mapCondominio)),
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
    queryKey: ['unidades-by-agrup', agrupamentoId, condominioId],
    queryFn: () => {
      if (agrupamentoId) return api.get(`/Unit/agrupamento/${agrupamentoId}`).then((r) => (Array.isArray(r.data) ? r.data : []).map(mapUnidade));
      if (condominioId) return api.get(`/Unit/condominio/${condominioId}`).then((r) => (Array.isArray(r.data) ? r.data : []).map(mapUnidade));
      return Promise.resolve([]);
    },
    enabled: !!(condominioId || agrupamentoId),
  });

  const { data: leituras = [], isLoading } = useQuery<Leitura[]>({
    queryKey: ['leituras', condominioId, agrupamentoId, unidadeId, ano, mes],
    queryFn: async () => {
      if (!condominioId || !ano || !mes) return [];
      const r = await api.get(`/mensuration/condominio/${condominioId}/ano/${ano}/mes/${mes}`, {
        params: {
          idAgrupamento: agrupamentoId || undefined,
          idUnidade: unidadeId || undefined,
        },
      });
      return (Array.isArray(r.data) ? r.data : []).map(mapMensuration);
    },
    enabled: !!(condominioId && ano && mes),
  });

  const MONTHS = [
    { value: '1', label: 'Janeiro' }, { value: '2', label: 'Fevereiro' },
    { value: '3', label: 'Março' }, { value: '4', label: 'Abril' },
    { value: '5', label: 'Maio' }, { value: '6', label: 'Junho' },
    { value: '7', label: 'Julho' }, { value: '8', label: 'Agosto' },
    { value: '9', label: 'Setembro' }, { value: '10', label: 'Outubro' },
    { value: '11', label: 'Novembro' }, { value: '12', label: 'Dezembro' },
  ];

  const years = Array.from({ length: 5 }, (_, i) => String(currentYear - i));

  const columns: ColumnDef<Leitura>[] = [
    { accessorKey: 'data', header: 'Data', cell: ({ getValue }) => (getValue() as string)?.slice(0, 10) },
    { accessorKey: 'unidade', header: 'Unidade' },
    { accessorKey: 'agrupamento', header: 'Agrupamento' },
    { accessorKey: 'condominio', header: 'Condomínio' },
    { accessorKey: 'valor', header: 'Valor (m³)' },
    {
      id: 'imagem',
      header: 'Imagem',
      cell: ({ row }) =>
        row.original.imagemUrl ? (
          <a href={row.original.imagemUrl} target="_blank" rel="noreferrer" className="text-primary-600 text-xs underline">
            Ver
          </a>
        ) : (
          <span className="text-gray-400 text-xs">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-gray-800">Leituras</h1>

      <div className="card space-y-4">
        <h2 className="font-semibold text-gray-700">Filtros</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <label className="label">Condomínio</label>
            <select className="input" value={condominioId} onChange={(e) => { setCondominioId(e.target.value); setAgrupamentoId(''); setUnidadeId(''); }}>
              <option value="">Todos</option>
              {(condominios as any[]).map((c: any) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Agrupamento</label>
            <select className="input" value={agrupamentoId} onChange={(e) => { setAgrupamentoId(e.target.value); setUnidadeId(''); }} disabled={!condominioId}>
              <option value="">Todos</option>
              {(agrupamentos as any[]).map((a: any) => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Unidade</label>
            <select className="input" value={unidadeId} onChange={(e) => setUnidadeId(e.target.value)} disabled={!condominioId}>
              <option value="">Todas</option>
              {(unidades as any[]).map((u: any) => <option key={u.id} value={u.id}>{u.unidade} - {u.condomino}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Ano</label>
            <select className="input" value={ano} onChange={(e) => setAno(e.target.value)}>
              <option value="">Todos</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Mês</label>
            <select className="input" value={mes} onChange={(e) => setMes(e.target.value)}>
              <option value="">Todos</option>
              {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        {isLoading ? (
          <p className="text-gray-400 text-sm">Carregando...</p>
        ) : (
          <DataTable data={leituras} columns={columns} searchPlaceholder="Buscar leitura..." />
        )}
      </div>
    </div>
  );
}
