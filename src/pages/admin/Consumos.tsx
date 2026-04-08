import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Resolver } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { ColumnDef } from '@tanstack/react-table';
import { PlusCircle, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import { mapConsumo, mapCondominio, mapTabelaImposto, payloadConsumoSave } from '../../lib/hidrusApi';
import { isoDateToDdMmYyyy } from '../../lib/formatDateBr';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';

interface Consumo {
  id: number;
  condominioId: number;
  condominioNome?: string;
  idTabelaImposto: number;
  inicio: string;
  fim: string;
  dataProximaLeitura: string;
  taxaMinima: number;
  valorAreaComum: number;
}

const schema = z
  .object({
    condominioId: z.string().min(1, 'Selecione um condomínio'),
    idTabelaImposto: z.string().min(1, 'Selecione a tabela de impostos'),
    inicio: z.string().min(1, 'Obrigatório'),
    fim: z.string().min(1, 'Obrigatório'),
    dataProximaLeitura: z.string().min(1, 'Obrigatório'),
    taxaMinima: z.coerce.number().nonnegative('Inválido'),
    valorAreaComum: z.coerce.number().nonnegative('Inválido'),
  })
  .refine((d) => new Date(d.fim) >= new Date(d.inicio), {
    message: 'O fim não pode ser anterior ao início',
    path: ['fim'],
  })
  .refine((d) => new Date(d.dataProximaLeitura) >= new Date(d.fim), {
    message: 'A próxima leitura não pode ser anterior ao fim do período',
    path: ['dataProximaLeitura'],
  });

type FormData = z.infer<typeof schema>;

export default function Consumos() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Consumo | null>(null);

  const { data: consumos = [], isLoading } = useQuery<Consumo[]>({
    queryKey: ['consumos'],
    queryFn: () =>
      api.get('/consumption/consumption').then((r) => (Array.isArray(r.data) ? r.data : []).map(mapConsumo)),
  });

  const { data: condominios = [] } = useQuery({
    queryKey: ['condominios'],
    queryFn: () =>
      api.get('/Condominium/condominium').then((r) => (Array.isArray(r.data) ? r.data : []).map(mapCondominio)),
  });

  const { data: tabelas = [] } = useQuery({
    queryKey: ['tabelas-imposto'],
    queryFn: () => api.get('/tableTax/tax').then((r) => (Array.isArray(r.data) ? r.data : []).map(mapTabelaImposto)),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) as Resolver<FormData> });

  const openCreate = () => {
    setEditing(null);
    const firstTabela = tabelas[0]?.id;
    reset({
      condominioId: '',
      idTabelaImposto: firstTabela ? String(firstTabela) : '',
      inicio: '',
      fim: '',
      dataProximaLeitura: '',
      taxaMinima: 62.8,
      valorAreaComum: 0,
    });
    setModalOpen(true);
  };

  const openEdit = (c: Consumo) => {
    setEditing(c);
    reset({
      condominioId: String(c.condominioId),
      idTabelaImposto: String(c.idTabelaImposto || ''),
      inicio: c.inicio?.slice(0, 10),
      fim: c.fim?.slice(0, 10),
      dataProximaLeitura: c.dataProximaLeitura?.slice(0, 10) || '',
      taxaMinima: c.taxaMinima ?? 62.8,
      valorAreaComum: c.valorAreaComum ?? 0,
    });
    setModalOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: (data: FormData) => {
      const body = payloadConsumoSave(
        {
          condominioId: Number(data.condominioId),
          idTabelaImposto: Number(data.idTabelaImposto),
          inicio: data.inicio,
          fim: data.fim,
          dataProximaLeitura: data.dataProximaLeitura,
          taxaMinima: data.taxaMinima,
          valorAreaComum: data.valorAreaComum,
        },
        editing?.id
      );
      return editing
        ? api.put('/consumption/updateConsumption', body)
        : api.post('/consumption/createConsumption', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consumos'] });
      toast.success(editing ? 'Consumo atualizado!' : 'Consumo criado!');
      setModalOpen(false);
    },
    onError: () => toast.error('Erro ao salvar consumo'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/consumption/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consumos'] });
      toast.success('Consumo removido!');
    },
    onError: () => toast.error('Erro ao remover consumo'),
  });

  const fmt = (v: number) =>
    v?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const columns: ColumnDef<Consumo>[] = [
    { accessorKey: 'condominioNome', header: 'Condomínio' },
    {
      accessorKey: 'inicio',
      header: 'Início leituras',
      cell: ({ getValue }) => isoDateToDdMmYyyy(getValue() as string | undefined),
    },
    {
      accessorKey: 'fim',
      header: 'Fim leituras',
      cell: ({ getValue }) => isoDateToDdMmYyyy(getValue() as string | undefined),
    },
    {
      accessorKey: 'dataProximaLeitura',
      header: 'Próx. leitura',
      cell: ({ getValue }) => isoDateToDdMmYyyy(getValue() as string | undefined),
    },
    {
      accessorKey: 'taxaMinima',
      header: 'Tarifa fixa',
      cell: ({ getValue }) => fmt(getValue() as number),
    },
    {
      accessorKey: 'valorAreaComum',
      header: 'Área comum',
      cell: ({ getValue }) => fmt(getValue() as number),
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
              if (confirm('Remover consumo?')) deleteMutation.mutate(row.original.id);
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
        <h1 className="text-xl font-bold text-gray-800">Consumos</h1>
        <button onClick={openCreate} className="btn-primary">
          <PlusCircle size={16} />
          Novo Consumo
        </button>
      </div>

      <div className="card">
        {isLoading ? (
          <p className="text-gray-400 text-sm">Carregando...</p>
        ) : (
          <DataTable data={consumos} columns={columns} searchPlaceholder="Buscar consumo..." />
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar Consumo' : 'Novo Consumo'} size="xl">
        <form onSubmit={handleSubmit((d) => saveMutation.mutate(d))} className="space-y-4">
          <p className="text-sm text-gray-500">
            Mesmos campos do legado: período de leituras, próxima leitura, tarifa fixa e valor da área comum.
          </p>
          <div>
            <label className="label">Tabela de impostos *</label>
            <select className="input" {...register('idTabelaImposto')}>
              <option value="">Selecione...</option>
              {(tabelas as { id: number; nome: string }[]).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
            {errors.idTabelaImposto && <p className="text-red-500 text-xs mt-1">{errors.idTabelaImposto.message}</p>}
          </div>
          <div>
            <label className="label">Condomínio *</label>
            <select className="input" {...register('condominioId')}>
              <option value="">Selecione...</option>
              {(condominios as { id: number; nome: string }[]).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
            {errors.condominioId && <p className="text-red-500 text-xs mt-1">{errors.condominioId.message}</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Data de início das leituras *</label>
              <input type="date" className="input" {...register('inicio')} />
              {errors.inicio && <p className="text-red-500 text-xs mt-1">{errors.inicio.message}</p>}
            </div>
            <div>
              <label className="label">Data de término das leituras *</label>
              <input type="date" className="input" {...register('fim')} />
              {errors.fim && <p className="text-red-500 text-xs mt-1">{errors.fim.message}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="label">Data da próxima leitura *</label>
              <input type="date" className="input" {...register('dataProximaLeitura')} />
              {errors.dataProximaLeitura && (
                <p className="text-red-500 text-xs mt-1">{errors.dataProximaLeitura.message}</p>
              )}
            </div>
            <div>
              <label className="label">Tarifa fixa (R$) *</label>
              <input type="number" step="0.01" min={0} className="input" {...register('taxaMinima')} />
              {errors.taxaMinima && <p className="text-red-500 text-xs mt-1">{errors.taxaMinima.message}</p>}
            </div>
            <div>
              <label className="label">Valor da área comum (R$) *</label>
              <input type="number" step="0.01" min={0} className="input" {...register('valorAreaComum')} />
              {errors.valorAreaComum && <p className="text-red-500 text-xs mt-1">{errors.valorAreaComum.message}</p>}
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
