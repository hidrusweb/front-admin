import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm, Resolver } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import { mapAgrupamento, mapCondominio, mapTabelaImposto, mapUnidade } from '../../lib/hidrusApi';

const schema = z.object({
  data: z.string().min(1, 'Obrigatório'),
  condominioId: z.string().min(1, 'Selecione um condomínio'),
  agrupamentoId: z.string().min(1, 'Selecione um agrupamento'),
  unidadeId: z.string().min(1, 'Selecione uma unidade'),
  valor: z.coerce.number().nonnegative('Valor inválido'),
});

type FormData = z.infer<typeof schema>;

export default function LeiturasCreate() {
  const [condominioId, setCondominioId] = useState('');
  const [agrupamentoId, setAgrupamentoId] = useState('');
  const [unidadeIdx, setUnidadeIdx] = useState(0);
  const [saved, setSaved] = useState(false);

  const { data: condominios = [] } = useQuery({
    queryKey: ['condominios'],
    queryFn: () =>
      api.get('/Condominium/condominium').then((r) => (Array.isArray(r.data) ? r.data : []).map(mapCondominio)),
  });

  const { data: agrupamentos = [] } = useQuery({
    queryKey: ['agrupamentos-by-cond', condominioId],
    queryFn: () =>
      condominioId
        ? api.get(`/grouping/condominio/${condominioId}`).then((r) => (Array.isArray(r.data) ? r.data : []).map(mapAgrupamento))
        : Promise.resolve([]),
    enabled: !!condominioId,
  });

  const { data: unidades = [] } = useQuery({
    queryKey: ['unidades-by-agrup', agrupamentoId],
    queryFn: () =>
      agrupamentoId
        ? api.get(`/Unit/agrupamento/${agrupamentoId}`).then((r) => (Array.isArray(r.data) ? r.data : []).map(mapUnidade))
        : Promise.resolve([]),
    enabled: !!agrupamentoId,
  });

  const { data: tabelas = [] } = useQuery({
    queryKey: ['tabelas-imposto'],
    queryFn: () => api.get('/tableTax/tax').then((r) => (Array.isArray(r.data) ? r.data : []).map(mapTabelaImposto)),
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema) as Resolver<FormData>,
    defaultValues: { data: new Date().toISOString().slice(0, 10) },
  });

  useEffect(() => {
    if (unidades.length > 0 && unidades[unidadeIdx]) {
      setValue('unidadeId', String((unidades[unidadeIdx] as any).id));
    }
  }, [unidades, unidadeIdx, setValue]);

  const createMutation = useMutation({
    mutationFn: (data: FormData) => {
      const idTabela = (tabelas as { id: number }[])[0]?.id;
      if (!idTabela) throw new Error('Nenhuma tabela de impostos cadastrada.');
      return api.post('/mensuration/createmensuration', {
        Data: data.data,
        Valor: Math.round(Number(data.valor)),
        IdUnidade: Number(data.unidadeId),
        IdTabelaImposto: idTabela,
      });
    },
    onSuccess: () => {
      toast.success('Leitura salva!');
      setSaved(true);
      // Advance to next unit
      if (unidadeIdx < (unidades as any[]).length - 1) {
        const next = unidadeIdx + 1;
        setUnidadeIdx(next);
        reset({ data: new Date().toISOString().slice(0, 10), condominioId, agrupamentoId, unidadeId: String((unidades[next] as any).id), valor: undefined });
        setSaved(false);
      }
    },
    onError: () => toast.error('Erro ao salvar leitura'),
  });

  const currentUnit = (unidades as any[])[unidadeIdx];

  return (
    <div className="space-y-5 max-w-lg">
      <h1 className="text-xl font-bold text-gray-800">Criar Leitura</h1>

      <div className="card space-y-4">
        {/* Selectors */}
        <div>
          <label className="label">Condomínio *</label>
          <select
            className="input"
            value={condominioId}
            onChange={(e) => { setCondominioId(e.target.value); setAgrupamentoId(''); setUnidadeIdx(0); setValue('condominioId', e.target.value); setValue('agrupamentoId', ''); setValue('unidadeId', ''); }}
          >
            <option value="">Selecione...</option>
            {(condominios as any[]).map((c: any) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Agrupamento *</label>
          <select
            className="input"
            value={agrupamentoId}
            disabled={!condominioId}
            onChange={(e) => { setAgrupamentoId(e.target.value); setUnidadeIdx(0); setValue('agrupamentoId', e.target.value); setValue('unidadeId', ''); }}
          >
            <option value="">Selecione...</option>
            {(agrupamentos as any[]).map((a: any) => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
        </div>

        {/* Unit info */}
        {currentUnit && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
            <p className="font-semibold text-blue-800">Unidade: {currentUnit.unidade}</p>
            <p className="text-blue-600">{currentUnit.condomino} — {currentUnit.endereco}</p>
            <p className="text-blue-500 text-xs">
              {unidadeIdx + 1} de {(unidades as any[]).length}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="space-y-4">
          <input type="hidden" {...register('condominioId')} value={condominioId} />
          <input type="hidden" {...register('agrupamentoId')} value={agrupamentoId} />
          <input type="hidden" {...register('unidadeId')} />

          <div>
            <label className="label">Data *</label>
            <input type="date" className="input" {...register('data')} />
            {errors.data && <p className="text-red-500 text-xs mt-1">{errors.data.message}</p>}
          </div>

          <div>
            <label className="label">Leitura (m³) *</label>
            <input
              type="number"
              step="0.01"
              className="input"
              autoFocus
              {...register('valor')}
            />
            {errors.valor && <p className="text-red-500 text-xs mt-1">{errors.valor.message}</p>}
          </div>

          <div className="flex gap-3">
            <button type="submit" disabled={isSubmitting || !currentUnit} className="btn-primary">
              {isSubmitting ? 'Salvando...' : 'Salvar e Avançar'}
              <ChevronRight size={16} />
            </button>
          </div>

          {saved && unidadeIdx >= (unidades as any[]).length - 1 && (
            <p className="text-green-600 text-sm font-medium">
              ✓ Todas as unidades do agrupamento foram lançadas!
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
