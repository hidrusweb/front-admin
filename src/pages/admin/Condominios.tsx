import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { ColumnDef } from '@tanstack/react-table';
import { PlusCircle, Pencil, ToggleLeft, ToggleRight } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import { mapCondominio, payloadCondominioSave, payloadCondominioUpdate } from '../../lib/hidrusApi';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';

interface Condominio {
  id: number;
  nome: string;
  cnpj: string;
  responsavel: string;
  telefone: string;
  email: string;
  endereco: string;
  cidade: string;
  cep: string;
  ativo: boolean;
  usaPadraoCaesb: boolean;
}

const schema = z.object({
  nome: z.string().min(1, 'Obrigatório'),
  responsavel: z.string().min(1, 'Obrigatório'),
  cnpj: z.string().min(1, 'Obrigatório'),
  email: z.string().email('E-mail inválido'),
  telefone: z.string().min(1, 'Obrigatório'),
  endereco: z.string().min(1, 'Obrigatório'),
  cidade: z.string().min(1, 'Obrigatório'),
  cep: z.string().min(1, 'Obrigatório'),
  usaPadraoCaesb: z.boolean(),
});

type FormData = z.infer<typeof schema>;

export default function Condominios() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Condominio | null>(null);

  const { data: condominios = [], isLoading } = useQuery<Condominio[]>({
    queryKey: ['condominios', 'admin-inclusive'],
    queryFn: () =>
      api
        .get('/Condominium/condominium', { params: { includeInactive: true } })
        .then((r) => (Array.isArray(r.data) ? r.data : []).map(mapCondominio)),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema), defaultValues: { usaPadraoCaesb: false } });

  const openCreate = () => {
    setEditing(null);
    reset({ nome: '', responsavel: '', cnpj: '', email: '', telefone: '', endereco: '', cidade: '', cep: '', usaPadraoCaesb: false });
    setModalOpen(true);
  };

  const openEdit = (c: Condominio) => {
    setEditing(c);
    reset({ nome: c.nome, responsavel: c.responsavel, cnpj: c.cnpj, email: c.email, telefone: c.telefone, endereco: c.endereco, cidade: c.cidade, cep: c.cep, usaPadraoCaesb: c.usaPadraoCaesb });
    setModalOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: (data: FormData) => {
      const body = payloadCondominioSave(data);
      return editing
        ? api.put('/Condominium/updatecondominium', payloadCondominioUpdate(editing.id, data))
        : api.post('/Condominium/createcondominium', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({
        predicate: (q) =>
          q.queryKey[0] === 'condominios' || q.queryKey[0] === 'dashboard-condominios',
      });
      toast.success(editing ? 'Condomínio atualizado!' : 'Condomínio criado!');
      setModalOpen(false);
    },
    onError: () => toast.error('Erro ao salvar condomínio'),
  });

  const toggleMutation = useMutation({
    mutationFn: (c: Condominio) =>
      c.ativo
        ? api.patch(`/Condominium/desactive/${c.id}`)
        : api.patch(`/Condominium/active/${c.id}`),
    onSuccess: () =>
      qc.invalidateQueries({
        predicate: (q) =>
          q.queryKey[0] === 'condominios' || q.queryKey[0] === 'dashboard-condominios',
      }),
    onError: () => toast.error('Erro ao alterar status'),
  });

  const columns: ColumnDef<Condominio>[] = [
    { accessorKey: 'nome', header: 'Nome' },
    { accessorKey: 'cnpj', header: 'CNPJ' },
    { accessorKey: 'responsavel', header: 'Responsável' },
    { accessorKey: 'telefone', header: 'Telefone' },
    {
      accessorKey: 'ativo',
      header: 'Status',
      cell: ({ row }) => (
        <span className={row.original.ativo ? 'badge-active' : 'badge-inactive'}>
          {row.original.ativo ? 'Ativo' : 'Inativo'}
        </span>
      ),
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
            onClick={() => toggleMutation.mutate(row.original)}
            className={`btn py-1 px-2 text-xs ${row.original.ativo ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
          >
            {row.original.ativo ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">Condomínios</h1>
        <button onClick={openCreate} className="btn-primary">
          <PlusCircle size={16} />
          Novo Condomínio
        </button>
      </div>

      <div className="card">
        {isLoading ? (
          <p className="text-gray-400 text-sm">Carregando...</p>
        ) : (
          <DataTable data={condominios} columns={columns} searchPlaceholder="Buscar condomínio..." />
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar Condomínio' : 'Novo Condomínio'} size="lg">
        <form onSubmit={handleSubmit((d) => saveMutation.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Nome *</label>
              <input className="input" {...register('nome')} />
              {errors.nome && <p className="text-red-500 text-xs mt-1">{errors.nome.message}</p>}
            </div>
            <div>
              <label className="label">CNPJ *</label>
              <input className="input" placeholder="00.000.000/0000-00" {...register('cnpj')} />
              {errors.cnpj && <p className="text-red-500 text-xs mt-1">{errors.cnpj.message}</p>}
            </div>
            <div>
              <label className="label">Responsável *</label>
              <input className="input" {...register('responsavel')} />
              {errors.responsavel && <p className="text-red-500 text-xs mt-1">{errors.responsavel.message}</p>}
            </div>
            <div>
              <label className="label">Telefone *</label>
              <input className="input" placeholder="(99) 99999-9999" {...register('telefone')} />
              {errors.telefone && <p className="text-red-500 text-xs mt-1">{errors.telefone.message}</p>}
            </div>
            <div>
              <label className="label">E-mail *</label>
              <input type="email" className="input" {...register('email')} />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
            </div>
            <div>
              <label className="label">CEP *</label>
              <input className="input" placeholder="00000-000" {...register('cep')} />
              {errors.cep && <p className="text-red-500 text-xs mt-1">{errors.cep.message}</p>}
            </div>
            <div>
              <label className="label">Endereço *</label>
              <input className="input" {...register('endereco')} />
              {errors.endereco && <p className="text-red-500 text-xs mt-1">{errors.endereco.message}</p>}
            </div>
            <div>
              <label className="label">Cidade *</label>
              <input className="input" {...register('cidade')} />
              {errors.cidade && <p className="text-red-500 text-xs mt-1">{errors.cidade.message}</p>}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="caesb" {...register('usaPadraoCaesb')} className="w-4 h-4" />
            <label htmlFor="caesb" className="text-sm text-gray-700">Usa padrão CAESB</label>
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
