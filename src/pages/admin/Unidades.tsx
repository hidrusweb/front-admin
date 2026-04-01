import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Resolver } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { ColumnDef } from '@tanstack/react-table';
import { PlusCircle, Pencil, Trash2, FileDown } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import { mapAgrupamento, mapCondominio, mapUnidade, payloadUnidadeSave } from '../../lib/hidrusApi';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';

interface Unidade {
  id: number;
  unidade: string;
  endereco: string;
  condomino: string;
  cpf: string;
  email: string;
  telefone: string;
  hidrometro: string;
  agrupamentoId: number;
  condominioId: number;
  condominioNome?: string;
  agrupamentoNome?: string;
}

const schema = z.object({
  condominioId: z.string().min(1, 'Selecione um condomínio'),
  agrupamentoId: z.string().min(1, 'Selecione um agrupamento'),
  unidade: z.string().min(1, 'Obrigatório'),
  endereco: z.string().min(1, 'Obrigatório'),
  condomino: z.string().min(1, 'Obrigatório'),
  cpf: z.string().min(1, 'Obrigatório'),
  email: z.string().email('E-mail inválido'),
  telefone: z.string().min(1, 'Obrigatório'),
  hidrometro: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function Unidades() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Unidade | null>(null);
  const [selectedCond, setSelectedCond] = useState('');

  const { data: condominios = [] } = useQuery({
    queryKey: ['condominios'],
    queryFn: () =>
      api.get('/Condominium/condominium').then((r) => (Array.isArray(r.data) ? r.data : []).map(mapCondominio)),
  });

  const { data: unidades = [], isLoading } = useQuery<Unidade[]>({
    queryKey: ['unidades', selectedCond],
    queryFn: () =>
      selectedCond
        ? api.get(`/Unit/condominio/${selectedCond}`).then((r) => (Array.isArray(r.data) ? r.data : []).map(mapUnidade))
        : api.get('/Unit/GetAll').then((r) => (Array.isArray(r.data) ? r.data : []).map(mapUnidade)),
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) as Resolver<FormData> });

  const formCondominio = watch('condominioId');

  useEffect(() => {
    setValue('agrupamentoId', '');
  }, [formCondominio, setValue]);

  const { data: formAgrupamentos = [] } = useQuery({
    queryKey: ['agrupamentos-by-cond', formCondominio],
    queryFn: () =>
      formCondominio
        ? api
            .get(`/grouping/condominio/${formCondominio}`)
            .then((r) => (Array.isArray(r.data) ? r.data : []).map(mapAgrupamento))
        : Promise.resolve([]),
    enabled: !!formCondominio,
  });

  const openCreate = () => {
    setEditing(null);
    reset({ condominioId: selectedCond, agrupamentoId: '', unidade: '', endereco: '', condomino: '', cpf: '', email: '', telefone: '', hidrometro: '' });
    setModalOpen(true);
  };

  const openEdit = (u: Unidade) => {
    setEditing(u);
    reset({
      condominioId: String(u.condominioId),
      agrupamentoId: String(u.agrupamentoId),
      unidade: u.unidade,
      endereco: u.endereco,
      condomino: u.condomino,
      cpf: u.cpf,
      email: u.email,
      telefone: u.telefone,
      hidrometro: u.hidrometro ?? '',
    });
    setModalOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: (data: FormData) => {
      const body = payloadUnidadeSave(
        {
          unidade: data.unidade,
          condominioId: Number(data.condominioId),
          agrupamentoId: Number(data.agrupamentoId),
          endereco: data.endereco,
          condomino: data.condomino,
          cpf: data.cpf,
          email: data.email,
          telefone: data.telefone,
          hidrometro: data.hidrometro,
        },
        editing?.id
      );
      return editing ? api.put('/Unit', body) : api.post('/Unit', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['unidades'] });
      toast.success(editing ? 'Unidade atualizada!' : 'Unidade criada!');
      setModalOpen(false);
    },
    onError: () => toast.error('Erro ao salvar unidade'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/Unit/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['unidades'] });
      toast.success('Unidade removida!');
    },
    onError: () => toast.error('Erro ao remover unidade'),
  });

  const exportPdf = () => {
    toast.error('Exportação PDF ainda não está disponível na API Laravel.');
  };

  const columns: ColumnDef<Unidade>[] = [
    { accessorKey: 'unidade', header: 'Unidade' },
    { accessorKey: 'endereco', header: 'Endereço' },
    { accessorKey: 'condomino', header: 'Condômino' },
    { accessorKey: 'cpf', header: 'CPF' },
    { accessorKey: 'condominioNome', header: 'Condomínio' },
    { accessorKey: 'agrupamentoNome', header: 'Agrupamento' },
    {
      id: 'actions',
      header: 'Ações',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <button type="button" onClick={() => exportPdf()} className="btn py-1 px-2 text-xs bg-orange-100 text-orange-700 hover:bg-orange-200">
            <FileDown size={14} />
          </button>
          <button onClick={() => openEdit(row.original)} className="btn-secondary py-1 px-2 text-xs">
            <Pencil size={14} />
          </button>
          <button
            onClick={() => { if (confirm('Remover unidade?')) deleteMutation.mutate(row.original.id); }}
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
        <h1 className="text-xl font-bold text-gray-800">Unidades</h1>
        <button onClick={openCreate} className="btn-primary">
          <PlusCircle size={16} />
          Nova Unidade
        </button>
      </div>

      <div className="card space-y-4">
        <div className="flex gap-4">
          <div>
            <label className="label">Filtrar por Condomínio</label>
            <select className="input" value={selectedCond} onChange={(e) => setSelectedCond(e.target.value)}>
              <option value="">Todos</option>
              {(condominios as any[]).map((c: any) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </div>
        </div>

        {isLoading ? (
          <p className="text-gray-400 text-sm">Carregando...</p>
        ) : (
          <DataTable data={unidades} columns={columns} searchPlaceholder="Buscar unidade..." />
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar Unidade' : 'Nova Unidade'} size="xl">
        <form onSubmit={handleSubmit((d) => saveMutation.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Condomínio *</label>
              <select className="input" {...register('condominioId')}>
                <option value="">Selecione...</option>
                {(condominios as any[]).map((c: any) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
              {errors.condominioId && <p className="text-red-500 text-xs mt-1">{errors.condominioId.message}</p>}
            </div>
            <div>
              <label className="label">Agrupamento *</label>
              <select className="input" {...register('agrupamentoId')} disabled={!formCondominio}>
                <option value="">Selecione o agrupamento...</option>
                {(formAgrupamentos as any[]).map((a: any) => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </select>
              {errors.agrupamentoId && <p className="text-red-500 text-xs mt-1">{errors.agrupamentoId.message}</p>}
            </div>
            <div>
              <label className="label">Unidade *</label>
              <input className="input" placeholder="Ex: 101" {...register('unidade')} />
              {errors.unidade && <p className="text-red-500 text-xs mt-1">{errors.unidade.message}</p>}
            </div>
            <div>
              <label className="label">Endereço *</label>
              <input className="input" {...register('endereco')} />
              {errors.endereco && <p className="text-red-500 text-xs mt-1">{errors.endereco.message}</p>}
            </div>
            <div>
              <label className="label">Condômino *</label>
              <input className="input" {...register('condomino')} />
              {errors.condomino && <p className="text-red-500 text-xs mt-1">{errors.condomino.message}</p>}
            </div>
            <div>
              <label className="label">CPF *</label>
              <input className="input" placeholder="000.000.000-00" {...register('cpf')} />
              {errors.cpf && <p className="text-red-500 text-xs mt-1">{errors.cpf.message}</p>}
            </div>
            <div>
              <label className="label">E-mail *</label>
              <input type="email" className="input" {...register('email')} />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
            </div>
            <div>
              <label className="label">Telefone *</label>
              <input className="input" placeholder="(99) 99999-9999" {...register('telefone')} />
              {errors.telefone && <p className="text-red-500 text-xs mt-1">{errors.telefone.message}</p>}
            </div>
            <div>
              <label className="label">Hidrômetro</label>
              <input className="input" {...register('hidrometro')} />
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
