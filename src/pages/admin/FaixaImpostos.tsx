import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Resolver } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { ColumnDef } from '@tanstack/react-table';
import { PlusCircle, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import { mapFaixaImposto, mapTabelaImposto, payloadFaixaSave } from '../../lib/hidrusApi';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';

interface TabelaImposto {
  id: number;
  nome: string;
}

interface FaixaImposto {
  id: number;
  nomeF: string;
  tabela: string;
  tabelaId: number;
  ordem: number;
  min: number;
  max: number;
  aliquotaAgua: number;
  aliquotaEsgoto: number;
}

const schema = z.object({
  tabelaId: z.string().min(1, 'Selecione uma tabela'),
  nomeF: z.string().min(1, 'Obrigatório'),
  ordem: z.coerce.number().int().nonnegative(),
  min: z.coerce.number().nonnegative(),
  max: z.coerce.number().nonnegative(),
  aliquotaAgua: z.coerce.number().nonnegative(),
  aliquotaEsgoto: z.coerce.number().nonnegative(),
});

type FormData = z.infer<typeof schema>;

export default function FaixaImpostos() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FaixaImposto | null>(null);
  const [selectedTabela, setSelectedTabela] = useState('');

  const { data: tabelas = [] } = useQuery<TabelaImposto[]>({
    queryKey: ['tabelas-imposto'],
    queryFn: () => api.get('/tableTax/tax').then((r) => (Array.isArray(r.data) ? r.data : []).map(mapTabelaImposto)),
  });

  const { data: faixas = [], isLoading } = useQuery<FaixaImposto[]>({
    queryKey: ['faixas', selectedTabela],
    queryFn: () =>
      selectedTabela
        ? api
            .get(`/taxRanges/tableTax/${selectedTabela}`)
            .then((r) => (Array.isArray(r.data) ? r.data : []).map(mapFaixaImposto))
        : Promise.resolve([]),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) as Resolver<FormData> });

  const openCreate = () => {
    setEditing(null);
    reset({ tabelaId: selectedTabela, nomeF: '', ordem: 1, min: 0, max: 0, aliquotaAgua: 0, aliquotaEsgoto: 0 });
    setModalOpen(true);
  };

  const openEdit = (f: FaixaImposto) => {
    setEditing(f);
    reset({
      tabelaId: String(f.tabelaId),
      nomeF: f.nomeF,
      ordem: f.ordem,
      min: f.min,
      max: f.max,
      aliquotaAgua: f.aliquotaAgua,
      aliquotaEsgoto: f.aliquotaEsgoto,
    });
    setModalOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: (data: FormData) => {
      const body = payloadFaixaSave(
        {
          nomeF: data.nomeF,
          tabelaId: Number(data.tabelaId),
          ordem: data.ordem,
          min: data.min,
          max: data.max,
          aliquotaAgua: data.aliquotaAgua,
          aliquotaEsgoto: data.aliquotaEsgoto,
        },
        editing?.id
      );
      return editing ? api.put('/taxRanges', body) : api.post('/taxRanges', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['faixas'] });
      toast.success(editing ? 'Faixa atualizada!' : 'Faixa criada!');
      setModalOpen(false);
    },
    onError: () => toast.error('Erro ao salvar faixa'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/taxRanges/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['faixas'] });
      toast.success('Faixa removida!');
    },
    onError: () => toast.error('Erro ao remover faixa'),
  });

  const fmt = (v: number) => v?.toFixed(4);

  const columns: ColumnDef<FaixaImposto>[] = [
    { accessorKey: 'nomeF', header: 'Nome' },
    { accessorKey: 'tabela', header: 'Tabela' },
    { accessorKey: 'ordem', header: 'Ordem' },
    { accessorKey: 'min', header: 'Min (m³)' },
    { accessorKey: 'max', header: 'Max (m³)' },
    { accessorKey: 'aliquotaAgua', header: 'Alíquota Água', cell: ({ getValue }) => fmt(getValue() as number) },
    { accessorKey: 'aliquotaEsgoto', header: 'Alíquota Esgoto', cell: ({ getValue }) => fmt(getValue() as number) },
    {
      id: 'actions',
      header: 'Ações',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <button onClick={() => openEdit(row.original)} className="btn-secondary py-1 px-2 text-xs">
            <Pencil size={14} />
          </button>
          <button
            onClick={() => { if (confirm('Remover faixa?')) deleteMutation.mutate(row.original.id); }}
            className="btn-danger py-1 px-2 text-xs"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">Faixas de Impostos</h1>
        <button onClick={openCreate} className="btn-primary">
          <PlusCircle size={16} />
          Nova Faixa
        </button>
      </div>

      <div className="card space-y-4">
        <div>
          <label className="label">Filtrar por Tabela</label>
          <select className="input max-w-xs" value={selectedTabela} onChange={(e) => setSelectedTabela(e.target.value)}>
            <option value="">Todas</option>
            {(tabelas as any[]).map((t: any) => (
              <option key={t.id} value={t.id}>{t.nome}</option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <p className="text-gray-400 text-sm">Carregando...</p>
        ) : (
          <DataTable data={faixas} columns={columns} searchPlaceholder="Buscar faixa..." />
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar Faixa' : 'Nova Faixa'} size="lg">
        <form onSubmit={handleSubmit((d) => saveMutation.mutate(d))} className="space-y-4">
          <div>
            <label className="label">Tabela *</label>
            <select className="input" {...register('tabelaId')}>
              <option value="">Selecione...</option>
              {(tabelas as any[]).map((t: any) => (
                <option key={t.id} value={t.id}>{t.nome}</option>
              ))}
            </select>
            {errors.tabelaId && <p className="text-red-500 text-xs mt-1">{errors.tabelaId.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Nome *</label>
              <input className="input" {...register('nomeF')} />
              {errors.nomeF && <p className="text-red-500 text-xs mt-1">{errors.nomeF.message}</p>}
            </div>
            <div>
              <label className="label">Ordem</label>
              <input type="number" className="input" {...register('ordem')} />
            </div>
            <div>
              <label className="label">Min (m³)</label>
              <input type="number" step="0.01" className="input" {...register('min')} />
            </div>
            <div>
              <label className="label">Max (m³)</label>
              <input type="number" step="0.01" className="input" {...register('max')} />
            </div>
            <div>
              <label className="label">Alíquota Água</label>
              <input type="number" step="0.0001" className="input" {...register('aliquotaAgua')} />
            </div>
            <div>
              <label className="label">Alíquota Esgoto</label>
              <input type="number" step="0.0001" className="input" {...register('aliquotaEsgoto')} />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={isSubmitting} className="btn-primary">
              {isSubmitting ? 'Salvando...' : 'Salvar'}
            </button>
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">
              Cancelar
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
