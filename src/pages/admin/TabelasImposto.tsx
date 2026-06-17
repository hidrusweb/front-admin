import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { ColumnDef } from '@tanstack/react-table';
import { PlusCircle, Pencil, ToggleLeft, ToggleRight, Trash2, Plus, FileDown } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import { mapFaixaImposto, mapTabelaImposto, payloadFaixaSave, payloadTabelaImpostoSave } from '../../lib/hidrusApi';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';

interface TabelaImposto {
  id: number;
  nome: string;
  ativo: boolean;
  qtdFaixas: number;
}

interface FaixaRow {
  key: string;
  id?: number;
  nomeF: string;
  ordem: number;
  min: number;
  max: number;
  aliquotaAgua: number;
  aliquotaEsgoto: number;
}

const schema = z.object({
  nome: z.string().min(1, 'Obrigatório'),
});

type FormData = z.infer<typeof schema>;

interface CaesbImportFaixa {
  nomeF: string;
  ordem: number;
  min: number;
  max: number;
  aliquotaAgua: number;
  aliquotaEsgoto: number;
}

interface CaesbImportResult {
  nome: string;
  vigenciaInicio?: string | null;
  vigenciaFim?: string | null;
  formatoDetectado?: string;
  faixas: CaesbImportFaixa[];
}

function importedFaixaToRow(f: CaesbImportFaixa): FaixaRow {
  return {
    key: crypto.randomUUID(),
    nomeF: f.nomeF,
    ordem: f.ordem,
    min: f.min,
    max: f.max,
    aliquotaAgua: f.aliquotaAgua,
    aliquotaEsgoto: f.aliquotaEsgoto,
  };
}

function newFaixaRow(ordem: number): FaixaRow {
  return {
    key: crypto.randomUUID(),
    nomeF: '',
    ordem,
    min: 0,
    max: 0,
    aliquotaAgua: 0,
    aliquotaEsgoto: 0,
  };
}

function faixaApiToRow(f: ReturnType<typeof mapFaixaImposto>): FaixaRow {
  return {
    key: String(f.id),
    id: f.id,
    nomeF: f.nomeF,
    ordem: f.ordem,
    min: f.min,
    max: f.max,
    aliquotaAgua: f.aliquotaAgua,
    aliquotaEsgoto: f.aliquotaEsgoto,
  };
}

function validateFaixas(faixas: FaixaRow[]): string | null {
  if (faixas.length === 0) return 'Adicione pelo menos uma faixa de alíquota.';
  for (let i = 0; i < faixas.length; i++) {
    const f = faixas[i];
    if (!f.nomeF.trim()) return `Linha ${i + 1}: informe o nome da faixa.`;
    if (f.max < f.min) return `Linha ${i + 1}: o máximo deve ser ≥ ao mínimo.`;
  }
  return null;
}

function invalidateTabelasQueries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({
    predicate: (q) =>
      q.queryKey[0] === 'tabelas-imposto' ||
      q.queryKey[0] === 'dashboard-tabelas' ||
      q.queryKey[0] === 'faixas',
  });
}

function FaixasEditor({
  faixas,
  faixasError,
  onUpdate,
  onAdd,
  onRemove,
  minRows = 1,
}: {
  faixas: FaixaRow[];
  faixasError: string | null;
  onUpdate: (key: string, field: keyof Omit<FaixaRow, 'key'>, value: string | number) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
  minRows?: number;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <label className="label mb-0">Faixas de alíquota *</label>
        <button type="button" onClick={onAdd} className="btn-secondary text-xs py-1.5 px-2.5">
          <Plus size={14} />
          Adicionar faixa
        </button>
      </div>

      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left font-medium px-2 py-2 w-10">#</th>
              <th className="text-left font-medium px-2 py-2">Nome</th>
              <th className="text-left font-medium px-2 py-2 w-16">Ordem</th>
              <th className="text-left font-medium px-2 py-2 w-20">Min (m³)</th>
              <th className="text-left font-medium px-2 py-2 w-20">Max (m³)</th>
              <th className="text-left font-medium px-2 py-2 w-24">Água</th>
              <th className="text-left font-medium px-2 py-2 w-24">Esgoto</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {faixas.map((f, idx) => (
              <tr key={f.key} className="border-t border-gray-100">
                <td className="px-2 py-1.5 text-gray-400">{idx + 1}</td>
                <td className="px-2 py-1.5">
                  <input
                    className="input py-1.5 text-sm"
                    value={f.nomeF}
                    onChange={(e) => onUpdate(f.key, 'nomeF', e.target.value)}
                    placeholder="Ex.: Faixa 1"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    className="input py-1.5 text-sm"
                    value={f.ordem}
                    onChange={(e) => onUpdate(f.key, 'ordem', Number(e.target.value))}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input py-1.5 text-sm"
                    value={f.min}
                    onChange={(e) => onUpdate(f.key, 'min', Number(e.target.value))}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input py-1.5 text-sm"
                    value={f.max}
                    onChange={(e) => onUpdate(f.key, 'max', Number(e.target.value))}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input py-1.5 text-sm"
                    value={f.aliquotaAgua}
                    onChange={(e) => onUpdate(f.key, 'aliquotaAgua', Number(e.target.value))}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input py-1.5 text-sm"
                    value={f.aliquotaEsgoto}
                    onChange={(e) => onUpdate(f.key, 'aliquotaEsgoto', Number(e.target.value))}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => onRemove(f.key)}
                    disabled={faixas.length <= minRows}
                    className="btn-danger py-1 px-1.5 text-xs disabled:opacity-40"
                    title="Remover faixa"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {faixasError && <p className="text-red-500 text-xs">{faixasError}</p>}
      <p className="text-xs text-gray-500">
        Use &quot;Adicionar faixa&quot; para incluir mais linhas. A ordem define a sequência de cálculo.
      </p>
    </div>
  );
}

export default function TabelasImposto() {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'manage'>('create');
  const [editing, setEditing] = useState<TabelaImposto | null>(null);
  const [faixas, setFaixas] = useState<FaixaRow[]>([]);
  const [deletedFaixaIds, setDeletedFaixaIds] = useState<number[]>([]);
  const [faixasError, setFaixasError] = useState<string | null>(null);
  const [importUrl, setImportUrl] = useState('');
  const [loadingFaixas, setLoadingFaixas] = useState(false);

  const { data: tabelas = [], isLoading } = useQuery<TabelaImposto[]>({
    queryKey: ['tabelas-imposto'],
    queryFn: () => api.get('/tableTax/tax').then((r) => (Array.isArray(r.data) ? r.data : []).map(mapTabelaImposto)),
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const loadFaixasForTable = async (tabelaId: number) => {
    setLoadingFaixas(true);
    try {
      const res = await api.get(`/taxRanges/tableTax/${tabelaId}`);
      const rows = (Array.isArray(res.data) ? res.data : []).map(mapFaixaImposto).map(faixaApiToRow);
      setFaixas(rows.length > 0 ? rows : [newFaixaRow(1)]);
    } catch {
      toast.error('Erro ao carregar faixas da tabela');
      setFaixas([newFaixaRow(1)]);
    } finally {
      setLoadingFaixas(false);
    }
  };

  const openCreate = () => {
    setModalMode('create');
    setEditing(null);
    setFaixas([newFaixaRow(1)]);
    setDeletedFaixaIds([]);
    setFaixasError(null);
    setImportUrl('');
    reset({ nome: '' });
    setModalOpen(true);
  };

  const openManage = async (t: TabelaImposto) => {
    setModalMode('manage');
    setEditing(t);
    setDeletedFaixaIds([]);
    setFaixasError(null);
    reset({ nome: t.nome });
    setModalOpen(true);
    await loadFaixasForTable(t.id);
  };

  useEffect(() => {
    const tabelaParam = searchParams.get('tabela');
    if (!tabelaParam || tabelas.length === 0 || modalOpen) return;
    const t = tabelas.find((x) => String(x.id) === tabelaParam);
    if (t) {
      void openManage(t);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, tabelas, modalOpen, setSearchParams]);

  const updateFaixa = (key: string, field: keyof Omit<FaixaRow, 'key'>, value: string | number) => {
    setFaixas((rows) => rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
    setFaixasError(null);
  };

  const addFaixaRow = () => {
    setFaixas((rows) => [...rows, newFaixaRow(rows.length + 1)]);
    setFaixasError(null);
  };

  const removeFaixaRow = (key: string) => {
    setFaixas((rows) => {
      const removed = rows.find((r) => r.key === key);
      if (removed?.id) {
        setDeletedFaixaIds((ids) => [...ids, removed.id!]);
      }
      const next = rows.filter((r) => r.key !== key);
      return next.map((r, i) => ({ ...r, ordem: i + 1 }));
    });
    setFaixasError(null);
  };

  const importMutation = useMutation({
    mutationFn: (url: string) =>
      api
        .post<{ success: boolean; data?: CaesbImportResult; message?: string }>('/tableTax/import-pdf', { url })
        .then((r) => {
          if (!r.data?.success || !r.data.data) {
            throw new Error(r.data?.message || 'Não foi possível importar o PDF.');
          }
          return r.data.data;
        }),
    onSuccess: (data) => {
      setValue('nome', data.nome, { shouldValidate: true });
      setFaixas(data.faixas.map(importedFaixaToRow));
      setFaixasError(null);
      toast.success(
        `Importado (${data.formatoDetectado ?? 'CAESB'}): ${data.faixas.length} faixas. Revise antes de salvar.`
      );
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (err instanceof Error ? err.message : 'Erro ao importar PDF');
      toast.error(msg);
    },
  });

  const syncFaixas = async (tabelaId: number) => {
    const faixaErr = validateFaixas(faixas);
    if (faixaErr) throw new Error(faixaErr);

    const keptIds = new Set(faixas.filter((f) => f.id).map((f) => f.id!));
    for (const id of deletedFaixaIds) {
      if (!keptIds.has(id)) {
        await api.delete(`/taxRanges/${id}`);
      }
    }

    for (const f of faixas) {
      const body = payloadFaixaSave(
        {
          nomeF: f.nomeF.trim(),
          tabelaId,
          ordem: f.ordem,
          min: f.min,
          max: f.max,
          aliquotaAgua: Math.round(f.aliquotaAgua * 100) / 100,
          aliquotaEsgoto: Math.round(f.aliquotaEsgoto * 100) / 100,
        },
        f.id
      );
      if (f.id) {
        await api.put('/taxRanges', body);
      } else {
        await api.post('/taxRanges', body);
      }
    }
  };

  const saveMutation = useMutation({
    mutationFn: async (data: FormData) => {
      if (modalMode === 'manage' && editing) {
        await api.put('/tableTax/updatetax', payloadTabelaImpostoSave({ nome: data.nome }, editing.id));
        await syncFaixas(editing.id);
        return;
      }

      const res = await api.post('/tableTax/createtax', payloadTabelaImpostoSave({ nome: data.nome }));
      const created = res.data?.data as { Id?: number; id?: number } | undefined;
      const tabelaId = Number(created?.Id ?? created?.id ?? 0);
      if (!tabelaId) throw new Error('Tabela criada, mas o ID não foi retornado pela API.');
      await syncFaixas(tabelaId);
    },
    onSuccess: () => {
      invalidateTabelasQueries(qc);
      toast.success(modalMode === 'manage' ? 'Tabela e faixas atualizadas!' : 'Tabela e faixas criadas!');
      setModalOpen(false);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar tabela';
      if (msg.includes('faixa') || msg.includes('Linha')) setFaixasError(msg);
      toast.error(msg);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (t: TabelaImposto) =>
      t.ativo ? api.patch(`/tableTax/desativetax/${t.id}`) : api.patch(`/tableTax/activetax/${t.id}`),
    onSuccess: () => {
      invalidateTabelasQueries(qc);
      toast.success('Status atualizado!');
    },
    onError: () => toast.error('Erro ao alterar status'),
  });

  const columns: ColumnDef<TabelaImposto>[] = [
    { accessorKey: 'nome', header: 'Nome' },
    {
      accessorKey: 'qtdFaixas',
      header: 'Faixas',
      cell: ({ row }) => row.original.qtdFaixas,
    },
    {
      accessorKey: 'ativo',
      header: 'Status',
      cell: ({ row }) => (
        <span className={row.original.ativo ? 'badge-active' : 'badge-inactive'}>
          {row.original.ativo ? 'Ativa' : 'Inativa'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Ações',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <button
            onClick={() => void openManage(row.original)}
            className="btn-secondary py-1 px-2 text-xs"
            title="Ver e editar faixas"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => toggleMutation.mutate(row.original)}
            className="btn-secondary py-1 px-2 text-xs"
            title={row.original.ativo ? 'Desativar' : 'Ativar'}
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
        <div>
          <h1 className="text-xl font-bold text-gray-800">Tabelas de Impostos</h1>
          <p className="text-sm text-gray-500 mt-1">
            Cadastre tabelas tarifárias e gerencie as faixas de alíquota em um só lugar.
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <PlusCircle size={16} />
          Nova Tabela
        </button>
      </div>

      <div className="card">
        {isLoading ? (
          <p className="text-gray-400 text-sm">Carregando...</p>
        ) : (
          <DataTable data={tabelas} columns={columns} searchPlaceholder="Buscar tabela..." />
        )}
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalMode === 'manage' ? `Tabela: ${editing?.nome ?? ''}` : 'Nova Tabela com Faixas'}
        size="2xl"
      >
        <form onSubmit={handleSubmit((d) => saveMutation.mutate(d))} className="space-y-4">
          {modalMode === 'create' && (
            <div className="rounded-lg border border-primary-200 bg-primary-50/60 p-3 space-y-3">
              <div className="flex items-start gap-2">
                <FileDown size={18} className="text-primary-700 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-sm font-medium text-gray-800">Importar tabela CAESB (PDF)</p>
                  <p className="text-xs text-gray-600">
                    Informe o link do PDF oficial (s3.caesb.df.gov.br). Suporta tabelas de 2018 em diante
                    e alguns formatos anteriores; PDFs apenas escaneados precisam de cadastro manual.
                  </p>
                  <input
                    className="input text-sm"
                    type="url"
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    placeholder="https://s3.caesb.df.gov.br/..."
                  />
                  <button
                    type="button"
                    onClick={() => importMutation.mutate(importUrl.trim())}
                    disabled={!importUrl.trim() || importMutation.isPending}
                    className="btn-secondary text-xs py-1.5 px-2.5"
                  >
                    {importMutation.isPending ? 'Importando...' : 'Importar do PDF'}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="label">Nome da tabela *</label>
            <input className="input" {...register('nome')} placeholder="Ex.: Tabela CAESB 2025" />
            {errors.nome && <p className="text-red-500 text-xs mt-1">{errors.nome.message}</p>}
          </div>

          {loadingFaixas ? (
            <p className="text-gray-400 text-sm">Carregando faixas...</p>
          ) : (
            <FaixasEditor
              faixas={faixas}
              faixasError={faixasError}
              onUpdate={updateFaixa}
              onAdd={addFaixaRow}
              onRemove={removeFaixaRow}
            />
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting || saveMutation.isPending || loadingFaixas}
              className="btn-primary"
            >
              {isSubmitting || saveMutation.isPending ? 'Salvando...' : modalMode === 'manage' ? 'Salvar' : 'Criar tabela e faixas'}
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
