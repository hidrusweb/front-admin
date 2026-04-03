import { useState, useEffect } from 'react';
import type { ChangeEvent } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm, Resolver } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronRight, ImagePlus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import { mapAgrupamento, mapCondominio, mapTabelaImposto, mapUnidade, normalizeApiList } from '../../lib/hidrusApi';

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
  const [unidadeId, setUnidadeId] = useState('');
  const [saved, setSaved] = useState(false);
  const [imagemFile, setImagemFile] = useState<File | null>(null);
  const [imagemPreview, setImagemPreview] = useState<string | null>(null);

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
        ? api
            .get(`/Unit/agrupamento/${agrupamentoId}`)
            .then((r) => normalizeApiList<ReturnType<typeof mapUnidade>>(r.data).map(mapUnidade))
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
    if (unidades.length === 0) {
      setUnidadeId('');
      setValue('unidadeId', '');
      return;
    }
    const first = String((unidades[0] as { id: number }).id);
    setUnidadeId((prev) => {
      const stillValid = (unidades as { id: number }[]).some((u) => String(u.id) === prev);
      return stillValid ? prev : first;
    });
  }, [unidades, agrupamentoId, setValue]);

  useEffect(() => {
    if (unidadeId) setValue('unidadeId', unidadeId);
  }, [unidadeId, setValue]);

  useEffect(() => {
    if (!imagemFile) {
      setImagemPreview(null);
      return;
    }
    const url = URL.createObjectURL(imagemFile);
    setImagemPreview(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [imagemFile]);

  const createMutation = useMutation({
    mutationFn: (payload: { data: FormData; imagem: File | null }) => {
      const { data, imagem } = payload;
      const idTabela = (tabelas as { id: number }[])[0]?.id;
      if (!idTabela) throw new Error('Nenhuma tabela de impostos cadastrada.');
      const fd = new FormData();
      fd.append('Data', data.data);
      fd.append('Valor', String(Math.round(Number(data.valor))));
      fd.append('IdUnidade', String(Number(data.unidadeId)));
      fd.append('IdTabelaImposto', String(idTabela));
      if (imagem) {
        fd.append('imagem', imagem);
      }
      return api.post('/mensuration/createmensuration', fd);
    },
    onSuccess: () => {
      toast.success('Leitura salva!');
      setSaved(true);
      setImagemFile(null);
      const list = unidades as { id: number }[];
      const idx = list.findIndex((u) => String(u.id) === unidadeId);
      if (idx >= 0 && idx < list.length - 1) {
        const nextId = String(list[idx + 1].id);
        setUnidadeId(nextId);
        reset({
          data: new Date().toISOString().slice(0, 10),
          condominioId,
          agrupamentoId,
          unidadeId: nextId,
          valor: undefined,
        });
        setSaved(false);
      }
    },
    onError: () => toast.error('Erro ao salvar leitura'),
  });

  const currentUnit = (unidades as { id: number; unidade: string; condomino: string; endereco: string }[]).find(
    (u) => String(u.id) === unidadeId
  );

  return (
    <div className="space-y-5 max-w-5xl">
      <h1 className="text-xl font-bold text-gray-800">Criar Leitura</h1>

      <div className="grid gap-6 lg:grid-cols-[1fr,minmax(260px,360px)] items-start">
      <div className="card space-y-4">
        {/* Selectors */}
        <div>
          <label className="label">Condomínio *</label>
          <select
            className="input"
            value={condominioId}
            onChange={(e) => {
              setCondominioId(e.target.value);
              setAgrupamentoId('');
              setUnidadeId('');
              setValue('condominioId', e.target.value);
              setValue('agrupamentoId', '');
              setValue('unidadeId', '');
            }}
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
            onChange={(e) => {
              setAgrupamentoId(e.target.value);
              setUnidadeId('');
              setValue('agrupamentoId', e.target.value);
              setValue('unidadeId', '');
            }}
          >
            <option value="">Selecione...</option>
            {(agrupamentos as any[]).map((a: any) => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
        </div>

        <div>
          <label className="label">Unidade *</label>
          <select
            className="input"
            value={unidadeId}
            disabled={!agrupamentoId || (unidades as unknown[]).length === 0}
            onChange={(e) => {
              const v = e.target.value;
              setUnidadeId(v);
              setValue('unidadeId', v);
            }}
          >
            <option value="">
              {(unidades as unknown[]).length === 0 && agrupamentoId ? 'Nenhuma unidade neste agrupamento' : 'Selecione...'}
            </option>
            {(unidades as { id: number; unidade: string; condomino: string }[]).map((u) => (
              <option key={u.id} value={u.id}>
                {u.unidade} — {u.condomino || '—'}
              </option>
            ))}
          </select>
          {agrupamentoId && (unidades as unknown[]).length === 0 && (
            <p className="text-amber-600 text-xs mt-1">Verifique se as unidades estão vinculadas a este agrupamento no cadastro.</p>
          )}
        </div>

        {/* Unit info */}
        {currentUnit && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
            <p className="font-semibold text-blue-800">Unidade: {currentUnit.unidade}</p>
            <p className="text-blue-600">{currentUnit.condomino} — {currentUnit.endereco}</p>
          </div>
        )}

        <form onSubmit={handleSubmit((d) => createMutation.mutate({ data: d, imagem: imagemFile }))} className="space-y-4">
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

          {saved &&
            unidadeId &&
            (unidades as { id: number }[]).findIndex((u) => String(u.id) === unidadeId) >=
              (unidades as { id: number }[]).length - 1 && (
            <p className="text-green-600 text-sm font-medium">
              ✓ Todas as unidades do agrupamento foram lançadas!
            </p>
          )}
        </form>
      </div>

      <div className="card space-y-4">
        <div className="flex items-center gap-2 text-gray-800">
          <ImagePlus size={20} className="text-primary-600 shrink-0" />
          <h2 className="font-semibold text-gray-800">Foto da leitura</h2>
        </div>
        <p className="text-sm text-gray-500">
          Opcional. Envie uma foto do hidrômetro para anexar à leitura (máx. 10&nbsp;MB).
        </p>

        <div className="relative rounded-lg border-2 border-dashed border-gray-200 bg-gray-50/80 min-h-[200px] flex flex-col items-center justify-center overflow-hidden">
          {imagemPreview ? (
            <>
              <img src={imagemPreview} alt="Pré-visualização" className="max-h-64 w-full object-contain" />
              <button
                type="button"
                onClick={() => setImagemFile(null)}
                className="absolute top-2 right-2 rounded-full bg-white/90 p-1.5 shadow border border-gray-200 text-gray-600 hover:bg-red-50 hover:text-red-600"
                aria-label="Remover imagem"
              >
                <X size={18} />
              </button>
            </>
          ) : (
            <label className="flex flex-col items-center justify-center gap-2 cursor-pointer p-8 w-full text-center">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="sr-only"
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  const f = e.target.files?.[0];
                  setImagemFile(f ?? null);
                  e.target.value = '';
                }}
              />
              <span className="text-sm font-medium text-primary-600">Clique para escolher ou enviar foto</span>
              <span className="text-xs text-gray-400">PNG, JPG, WebP ou GIF</span>
            </label>
          )}
        </div>

        {imagemPreview && (
          <label className="block">
            <span className="text-sm text-primary-600 font-medium cursor-pointer hover:underline">Trocar imagem</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="sr-only"
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const f = e.target.files?.[0];
                setImagemFile(f ?? null);
                e.target.value = '';
              }}
            />
          </label>
        )}
      </div>
      </div>
    </div>
  );
}
