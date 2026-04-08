import { useState, useEffect, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { useForm, Resolver } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { ImageIcon, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';
import api from '../../lib/api';
import { mapCondominio, mapMensuration, mapUnidade } from '../../lib/hidrusApi';
import { isoDateToDdMmYyyy } from '../../lib/formatDateBr';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';

interface Leitura {
  id: number;
  idUnidade: number;
  idTabelaImposto: number;
  data: string;
  valor: number;
  observacao: string;
  unidade: string;
  agrupamento: string;
  condominio: string;
  imagemUrl?: string;
}

const editSchema = z.object({
  data: z.string().min(1, 'Obrigatório'),
  valor: z.coerce.number().int().nonnegative('Contagem inválida'),
  observacao: z.string().optional(),
});

type EditForm = z.infer<typeof editSchema>;

function mensagemErroApi(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const d = err.response?.data as {
      message?: string;
      errors?: Record<string, string[]>;
    };
    if (d?.errors) {
      const flat = Object.values(d.errors).flat().filter(Boolean);
      if (flat.length) return flat.join(' ');
    }
    if (d?.message && !/^Request failed with status code \d+$/.test(d.message)) return d.message;
    if (err.response?.status === 422) return 'Dados inválidos; verifique os campos e tente novamente.';
    return err.message || 'Erro ao salvar';
  }
  if (err instanceof Error) return err.message;
  return 'Erro ao salvar';
}

function tituloModalEditarLeitura(l: Leitura): string {
  const condo = l.condominio?.trim() ?? '';
  const unid = l.unidade?.trim() ?? '';
  const agg = l.agrupamento?.trim() ?? '';
  const hasAggOrUnit = agg || unid;
  const aggUnit = [agg, unid].filter(Boolean).join(' - ');
  if (condo && hasAggOrUnit) return `Editar Leitura — ${condo} (${aggUnit})`;
  if (condo) return `Editar Leitura — ${condo}`;
  if (hasAggOrUnit) return `Editar Leitura — (${aggUnit})`;
  return 'Editar Leitura';
}

export default function LeiturasIndex() {
  const qc = useQueryClient();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [condominioId, setCondominioId] = useState('');
  const [agrupamentoId, setAgrupamentoId] = useState('');
  const [unidadeId, setUnidadeId] = useState('');
  const [ano, setAno] = useState(String(currentYear));
  const [mes, setMes] = useState(String(currentMonth));

  const [editing, setEditing] = useState<Leitura | null>(null);
  const [imagemFile, setImagemFile] = useState<File | null>(null);
  const [imagemPreviewUrl, setImagemPreviewUrl] = useState<string | null>(null);
  const [imagemCadastradaQuebrada, setImagemCadastradaQuebrada] = useState(false);
  const imagemInputRef = useRef<HTMLInputElement>(null);

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

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EditForm>({
    resolver: zodResolver(editSchema) as Resolver<EditForm>,
    defaultValues: { data: '', valor: 0, observacao: '' },
  });

  useEffect(() => {
    if (!editing) return;
    reset({
      data: editing.data.slice(0, 10),
      valor: editing.valor,
      observacao: editing.observacao,
    });
  }, [editing, reset]);

  useEffect(() => {
    if (!editing) {
      setImagemFile(null);
      setImagemPreviewUrl(null);
      setImagemCadastradaQuebrada(false);
    } else {
      setImagemCadastradaQuebrada(false);
    }
  }, [editing]);

  useEffect(() => {
    if (!imagemFile) {
      setImagemPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(imagemFile);
    setImagemPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imagemFile]);

  const saveMutation = useMutation({
    mutationFn: async (form: EditForm) => {
      if (!editing) throw new Error('Nenhuma leitura selecionada.');
      if (!editing.idTabelaImposto) throw new Error('Leitura sem tabela de impostos; não é possível salvar.');

      const basePayload = {
        Id: editing.id,
        Data: editing.data.slice(0, 10),
        Valor: Math.round(Number(form.valor)),
        IdUnidade: editing.idUnidade,
        IdTabelaImposto: editing.idTabelaImposto,
        Observacao: form.observacao ?? '',
      };

      if (imagemFile) {
        const fd = new FormData();
        fd.append('Id', String(basePayload.Id));
        fd.append('Data', basePayload.Data);
        fd.append('Valor', String(basePayload.Valor));
        fd.append('IdUnidade', String(basePayload.IdUnidade));
        fd.append('IdTabelaImposto', String(basePayload.IdTabelaImposto));
        fd.append('Observacao', basePayload.Observacao);
        fd.append('imagem', imagemFile);
        await api.post('/mensuration/updatemensuration', fd);
      } else {
        await api.put('/mensuration/updatemensuration', basePayload);
      }
    },
    onSuccess: () => {
      toast.success('Leitura atualizada!');
      qc.invalidateQueries({ queryKey: ['leituras'] });
      setEditing(null);
      setImagemFile(null);
    },
    onError: (e: unknown) => {
      toast.error(mensagemErroApi(e));
    },
  });

  const onPickImagem = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setImagemFile(f ?? null);
  };

  const MONTHS = [
    { value: '1', label: 'Janeiro' },
    { value: '2', label: 'Fevereiro' },
    { value: '3', label: 'Março' },
    { value: '4', label: 'Abril' },
    { value: '5', label: 'Maio' },
    { value: '6', label: 'Junho' },
    { value: '7', label: 'Julho' },
    { value: '8', label: 'Agosto' },
    { value: '9', label: 'Setembro' },
    { value: '10', label: 'Outubro' },
    { value: '11', label: 'Novembro' },
    { value: '12', label: 'Dezembro' },
  ];

  const years = Array.from({ length: 5 }, (_, i) => String(currentYear - i));

  const columns: ColumnDef<Leitura>[] = [
    {
      accessorKey: 'data',
      header: 'Data',
      cell: ({ getValue }) => isoDateToDdMmYyyy(getValue() as string | undefined),
    },
    { accessorKey: 'unidade', header: 'Unidade' },
    { accessorKey: 'agrupamento', header: 'Agrupamento' },
    { accessorKey: 'condominio', header: 'Condomínio' },
    {
      accessorKey: 'valor',
      header: 'Contagem (Hidrômetro)',
      cell: ({ getValue }) => <span className="text-sm font-medium tabular-nums">{getValue() as number}</span>,
    },
    {
      accessorKey: 'observacao',
      header: 'Observações',
      cell: ({ row }) => {
        const o = row.original.observacao;
        if (!o) return <span className="text-gray-400 text-xs">—</span>;
        const short = o.length > 48 ? `${o.slice(0, 48)}…` : o;
        return <span className="text-sm" title={o}>{short}</span>;
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <button
          type="button"
          className="btn-secondary py-1 px-2 text-xs inline-flex items-center gap-1"
          onClick={() => setEditing(row.original)}
          title="Editar leitura"
        >
          <Pencil size={14} />
          Editar
        </button>
      ),
    },
  ];

  const busy = isSubmitting || saveMutation.isPending;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-gray-800">Leituras</h1>

      <div className="card space-y-4">
        <h2 className="font-semibold text-gray-700">Filtros</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="label">Condomínio</label>
            <select
              className="input"
              value={condominioId}
              onChange={(e) => {
                setCondominioId(e.target.value);
                setAgrupamentoId('');
                setUnidadeId('');
              }}
            >
              <option value="">Todos</option>
              {(condominios as { id: number; nome: string }[]).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Agrupamento</label>
            <select
              className="input"
              value={agrupamentoId}
              onChange={(e) => {
                setAgrupamentoId(e.target.value);
                setUnidadeId('');
              }}
              disabled={!condominioId}
            >
              <option value="">Todos</option>
              {(agrupamentos as { id: number; nome: string }[]).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Unidade</label>
            <select className="input" value={unidadeId} onChange={(e) => setUnidadeId(e.target.value)} disabled={!condominioId}>
              <option value="">Todas</option>
              {(unidades as { id: number; unidade: string; condomino: string }[]).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.unidade} - {u.condomino}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Ano</label>
            <select className="input" value={ano} onChange={(e) => setAno(e.target.value)}>
              <option value="">Todos</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Mês</label>
            <select className="input" value={mes} onChange={(e) => setMes(e.target.value)}>
              <option value="">Todos</option>
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
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

      <Modal
        isOpen={!!editing}
        onClose={() => {
          if (!busy) setEditing(null);
        }}
        title={editing ? tituloModalEditarLeitura(editing) : 'Editar Leitura'}
        size="lg"
      >
        {editing && (
          <form
            className="space-y-5"
            onSubmit={handleSubmit((data) => saveMutation.mutateAsync(data))}
          >
            <div className="flex flex-col items-center border-b border-gray-100 pb-5">
              <label className="label mb-3 block w-full text-center">Foto da leitura</label>
              <input ref={imagemInputRef} type="file" accept="image/*" className="sr-only" onChange={onPickImagem} />
              <button
                type="button"
                onClick={() => imagemInputRef.current?.click()}
                className="relative mx-auto block w-full max-w-sm overflow-hidden rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 transition hover:border-primary-400 hover:bg-primary-50/30 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {imagemPreviewUrl ? (
                  <img src={imagemPreviewUrl} alt="" className="mx-auto h-44 w-full max-h-52 object-contain sm:h-52" />
                ) : editing.imagemUrl && !imagemCadastradaQuebrada ? (
                  <img
                    src={editing.imagemUrl}
                    alt=""
                    className="mx-auto h-44 w-full max-h-52 object-contain sm:h-52"
                    onError={() => setImagemCadastradaQuebrada(true)}
                  />
                ) : (
                  <div className="flex h-44 w-full flex-col items-center justify-center gap-2 px-6 text-gray-500 sm:h-52">
                    <ImageIcon className="h-10 w-10 opacity-50" strokeWidth={1.25} />
                    <span className="text-sm font-medium text-gray-600">Sem foto da leitura</span>
                    <span className="text-xs text-center text-gray-500 leading-snug">
                      {editing.imagemUrl
                        ? 'A imagem cadastrada não pôde ser carregada. Envie uma nova foto se precisar.'
                        : 'Clique para adicionar foto'}
                    </span>
                  </div>
                )}
              </button>
            </div>
            <div>
              <label className="label">Data da leitura</label>
              <input
                type="date"
                readOnly
                className="input bg-gray-50 text-gray-700 cursor-default"
                {...register('data')}
              />
            </div>
            <div>
              <label className="label">Contagem do hidrômetro</label>
              <input type="number" min={0} step={1} className="input" {...register('valor')} />
              <p className="text-xs text-gray-500 mt-1">Valor registrado na leitura (contagem do hidrômetro).</p>
              {errors.valor && <p className="text-red-600 text-xs mt-1">{errors.valor.message}</p>}
            </div>
            <div>
              <label className="label">Observações</label>
              <textarea className="input min-h-[88px]" rows={3} {...register('observacao')} />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => setEditing(null)}>
                Cancelar
              </button>
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
