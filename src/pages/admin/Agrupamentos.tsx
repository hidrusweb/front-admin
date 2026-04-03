import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, type Resolver } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { ColumnDef } from '@tanstack/react-table';
import { PlusCircle, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import { mapAgrupamento, mapCondominio, payloadAgrupamentoSave } from '../../lib/hidrusApi';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';

interface Agrupamento {
  id: number;
  nome: string;
  condominioId: number;
  condominioNome?: string;
  taxa: number;
}

const schema = z.object({
  nome: z.string().min(1, 'Obrigatório'),
  condominioId: z.string().min(1, 'Selecione um condomínio'),
  /** string do input number ou número; vazio coagido para número */
  taxaMinima: z.coerce
    .number()
    .refine((n) => Number.isFinite(n), { message: 'Informe um valor válido' })
    .min(0, 'Informe um valor ≥ 0'),
});

type FormData = z.infer<typeof schema>;

export default function Agrupamentos() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Agrupamento | null>(null);
  const [filterCond, setFilterCond] = useState('');

  const { data: condominios = [] } = useQuery({
    queryKey: ['condominios'],
    queryFn: () =>
      api.get('/Condominium/condominium').then((r) => (Array.isArray(r.data) ? r.data : []).map(mapCondominio)),
  });

  const { data: agrupamentos = [], isLoading } = useQuery<Agrupamento[]>({
    queryKey: ['agrupamentos', filterCond],
    queryFn: () =>
      filterCond
        ? api.get(`/grouping/condominio/${filterCond}`).then((r) => (Array.isArray(r.data) ? r.data : []).map(mapAgrupamento))
        : api.get('/grouping').then((r) => (Array.isArray(r.data) ? r.data : []).map(mapAgrupamento)),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema) as Resolver<FormData>,
    defaultValues: { taxaMinima: 0 },
  });

  const openCreate = () => {
    setEditing(null);
    reset({ nome: '', condominioId: filterCond || '', taxaMinima: 0 });
    setModalOpen(true);
  };

  const openEdit = (a: Agrupamento) => {
    setEditing(a);
    reset({ nome: a.nome, condominioId: String(a.condominioId), taxaMinima: a.taxa ?? 0 });
    setModalOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: (data: FormData) => {
      const body = payloadAgrupamentoSave(
        {
          nome: data.nome,
          condominioId: Number(data.condominioId),
          taxa: data.taxaMinima,
        },
        editing?.id
      );
      return editing ? api.put('/grouping', body) : api.post('/grouping', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agrupamentos'] });
      toast.success(editing ? 'Agrupamento atualizado!' : 'Agrupamento criado!');
      setModalOpen(false);
    },
    onError: () => toast.error('Erro ao salvar agrupamento'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/grouping/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agrupamentos'] });
      toast.success('Agrupamento removido!');
    },
    onError: () => toast.error('Erro ao remover agrupamento'),
  });

  const columns: ColumnDef<Agrupamento>[] = [
    { accessorKey: 'nome', header: 'Nome' },
    { accessorKey: 'condominioNome', header: 'Condomínio' },
    {
      accessorKey: 'taxa',
      header: 'Taxa mínima',
      cell: ({ row }) => {
        const v = row.original.taxa;
        return Number.isFinite(v) ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
      },
    },
    {
      id: 'actions',
      header: 'Ações',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <button onClick={() => openEdit(row.original)} className="btn-secondary py-1 px-2 text-xs">
            <Pencil size={14} />
          </button>
          <button
            onClick={() => {
              if (confirm('Remover agrupamento?')) deleteMutation.mutate(row.original.id);
            }}
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
        <h1 className="text-xl font-bold text-gray-800">Agrupamentos</h1>
        <button onClick={openCreate} className="btn-primary">
          <PlusCircle size={16} />
          Novo Agrupamento
        </button>
      </div>

      <div className="card space-y-4">
        <div>
          <label className="label">Filtrar por Condomínio</label>
          <select className="input max-w-xs" value={filterCond} onChange={(e) => setFilterCond(e.target.value)}>
            <option value="">Todos</option>
            {(condominios as any[]).map((c: any) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <p className="text-gray-400 text-sm">Carregando...</p>
        ) : (
          <DataTable data={agrupamentos} columns={columns} searchPlaceholder="Buscar agrupamento..." />
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar Agrupamento' : 'Novo Agrupamento'}>
        <form onSubmit={handleSubmit((d) => saveMutation.mutate(d))} className="space-y-4">
          <div>
            <label className="label">Condomínio *</label>
            <select className="input" {...register('condominioId')}>
              <option value="">Selecione...</option>
              {(condominios as any[]).map((c: any) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
            {errors.condominioId && <p className="text-red-500 text-xs mt-1">{errors.condominioId.message}</p>}
          </div>
          <div>
            <label className="label">Nome *</label>
            <input className="input" {...register('nome')} />
            {errors.nome && <p className="text-red-500 text-xs mt-1">{errors.nome.message}</p>}
          </div>
          <div>
            <label className="label">Taxa mínima *</label>
            <input
              className="input max-w-xs"
              type="number"
              step="0.01"
              min="0"
              {...register('taxaMinima')}
            />
            {errors.taxaMinima && <p className="text-red-500 text-xs mt-1">{errors.taxaMinima.message}</p>}
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
