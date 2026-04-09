import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ImagePlus, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../lib/api';
import { isoDateToDdMmYyyy } from '../../../lib/formatDateBr';
import { mapCondominio, mapConsumo, normalizeApiList } from '../../../lib/hidrusApi';

type ResultRow = {
  arquivo: string;
  unidade: string;
  ok: boolean;
  message: string | null;
};

/** Evita 413 (post_max_size típico 8M) e o limite padrão do PHP max_file_uploads (20). */
const MAX_BATCH_BYTES = 4 * 1024 * 1024;
const MAX_FILES_PER_BATCH = 20;
const MULTIPART_OVERHEAD_PER_FILE = 2048;

function chunkFilesForUpload(files: File[]): File[][] {
  const chunks: File[][] = [];
  let current: File[] = [];
  let sum = 0;

  for (const f of files) {
    if (f.size > MAX_BATCH_BYTES) {
      if (current.length) {
        chunks.push(current);
        current = [];
        sum = 0;
      }
      chunks.push([f]);
      continue;
    }
    const add = f.size + MULTIPART_OVERHEAD_PER_FILE;
    const sizeOverflow = current.length > 0 && sum + add > MAX_BATCH_BYTES;
    const countOverflow = current.length >= MAX_FILES_PER_BATCH;
    if (current.length > 0 && (sizeOverflow || countOverflow)) {
      chunks.push(current);
      current = [];
      sum = 0;
    }
    current.push(f);
    sum += add;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

function labelConsumo(c: ReturnType<typeof mapConsumo>): string {
  const fim = isoDateToDdMmYyyy(c.fim.slice(0, 10));
  return `Leitura (DataFim): ${fim} · Tabela #${c.idTabelaImposto}`;
}

export default function ImportarImagensLeituras() {
  const [condominioId, setCondominioId] = useState('');
  const [consumoId, setConsumoId] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ResultRow[] | null>(null);
  const [resumo, setResumo] = useState<{ total: number; ok: number; erro: number } | null>(null);

  const { data: condominios = [], isLoading: loadingCond } = useQuery({
    queryKey: ['condominios'],
    queryFn: () =>
      api.get('/Condominium/condominium').then((r) => normalizeApiList(r.data).map(mapCondominio)),
  });

  const { data: consumos = [], isLoading: loadingCons } = useQuery({
    queryKey: ['consumos'],
    queryFn: () =>
      api.get('/consumption/consumption').then((r) => normalizeApiList(r.data).map(mapConsumo)),
  });

  const consumosDoCondominio = useMemo(() => {
    if (!condominioId) return [];
    return consumos.filter((c) => String(c.condominioId) === condominioId && c.ativo);
  }, [consumos, condominioId]);

  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    setFiles(list ? Array.from(list) : []);
    setResults(null);
    setResumo(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!condominioId) {
      toast.error('Selecione o condomínio.');
      return;
    }
    if (!consumoId) {
      toast.error('Selecione o consumo (ciclo).');
      return;
    }
    if (files.length === 0) {
      toast.error('Selecione ao menos uma imagem.');
      return;
    }

    const batches = chunkFilesForUpload(files);

    setLoading(true);
    setResults(null);
    setResumo(null);
    const toastId = 'bulk-img-leituras';
    const allResults: ResultRow[] = [];
    let okSum = 0;
    let erroSum = 0;

    try {
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        toast.loading(`Enviando lote ${i + 1}/${batches.length} (${batch.length} arquivo(s))…`, { id: toastId });

        const fd = new FormData();
        fd.append('idCondominio', condominioId);
        fd.append('idConsumo', consumoId);
        for (const f of batch) {
          fd.append('imagens[]', f);
        }

        const r = await api.post<{ results: ResultRow[]; resumo: { total: number; ok: number; erro: number } }>(
          '/mensuration/bulk-update-images',
          fd,
          { timeout: 120_000 }
        );
        allResults.push(...r.data.results);
        okSum += r.data.resumo.ok;
        erroSum += r.data.resumo.erro;
      }

      toast.dismiss(toastId);
      setResults(allResults);
      setResumo({ total: allResults.length, ok: okSum, erro: erroSum });
      if (erroSum === 0) {
        toast.success(`${okSum} imagem(ns) atualizada(s)${batches.length > 1 ? ` em ${batches.length} lotes` : ''}.`);
      } else {
        toast.error(`${erroSum} falha(s), ${okSum} ok. Veja a lista abaixo.`);
      }
    } catch (err: unknown) {
      toast.dismiss(toastId);
      const ax = err as { response?: { status?: number; data?: { message?: string } } };
      if (ax.response?.status === 413) {
        toast.error(
          'Lote ainda grande demais para o PHP (post_max_size). Aumente post_max_size e upload_max_filesize no php.ini ou reduza o tamanho das fotos.'
        );
      } else {
        toast.error(ax.response?.data?.message ?? 'Falha ao enviar imagens.');
      }
      if (allResults.length > 0) {
        setResults(allResults);
        setResumo({ total: allResults.length, ok: okSum, erro: erroSum });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Importar imagens nas leituras</h1>
        <p className="text-sm text-gray-600 mt-2 max-w-3xl leading-relaxed">
          Atualiza o campo de foto das leituras já cadastradas no ciclo escolhido. Cada arquivo deve se chamar como a
          unidade no padrão <strong>AGRUPAMENTO-UNIDADE</strong> (ex.: <code className="text-xs bg-gray-100 px-1 rounded">A-201.jpg</code>
          , <code className="text-xs bg-gray-100 px-1 rounded">BLOCO2-305.png</code>). O sistema localiza a leitura pela
          <strong> DataFim</strong> do ciclo selecionado. Diferente do importador por CSV em Leituras → Importar.
        </p>
      </div>

      <form onSubmit={(ev) => void submit(ev)} className="card space-y-5 max-w-2xl">
        <div>
          <label className="label">Condomínio *</label>
          <select
            className="input"
            value={condominioId}
            onChange={(e) => {
              setCondominioId(e.target.value);
              setConsumoId('');
              setResults(null);
              setResumo(null);
            }}
            disabled={loadingCond}
          >
            <option value="">Selecione…</option>
            {(condominios as { id: number; nome: string }[]).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Consumo (ciclo) *</label>
          <select
            className="input"
            value={consumoId}
            onChange={(e) => {
              setConsumoId(e.target.value);
              setResults(null);
              setResumo(null);
            }}
            disabled={!condominioId || loadingCons}
          >
            <option value="">{condominioId ? 'Selecione o ciclo…' : 'Escolha primeiro o condomínio'}</option>
            {consumosDoCondominio.map((c) => (
              <option key={c.id} value={c.id}>
                {labelConsumo(c)}
              </option>
            ))}
          </select>
          {condominioId && consumosDoCondominio.length === 0 && !loadingCons ? (
            <p className="text-xs text-amber-700 mt-1">Nenhum consumo ativo para este condomínio.</p>
          ) : null}
        </div>

        <div>
          <label className="label">Imagens *</label>
          <input
            type="file"
            accept="image/*"
            multiple
            className="input py-2 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-800"
            onChange={onFiles}
          />
          <p className="text-xs text-gray-500 mt-1">
            {files.length > 0
              ? `${files.length} arquivo(s) selecionado(s). O envio é feito em lotes pequenos para caber nos limites do servidor.`
              : 'Até 500 arquivos (máx. 10 MB cada). Envio automático em lotes para evitar erro 413.'}
          </p>
        </div>

        <button type="submit" className="btn-primary inline-flex items-center gap-2" disabled={loading}>
          {loading ? <Loader2 className="animate-spin" size={18} /> : <ImagePlus size={18} />}
          {loading ? 'Enviando…' : 'Atualizar imagens nas leituras'}
        </button>
      </form>

      {resumo && (
        <div className="text-sm text-gray-700">
          Resumo: <strong>{resumo.ok}</strong> ok · <strong>{resumo.erro}</strong> com erro ·{' '}
          <strong>{resumo.total}</strong> arquivo(s) processado(s).
        </div>
      )}

      {results && results.length > 0 && (
        <div className="card overflow-x-auto">
          <h2 className="font-semibold text-gray-800 mb-3">Resultado por arquivo</h2>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-600">
                <th className="py-2 pr-3">Arquivo</th>
                <th className="py-2 pr-3">Unidade</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2">Mensagem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {results.map((row, i) => (
                <tr key={`${row.arquivo}-${i}`}>
                  <td className="py-2 pr-3 font-mono text-xs">{row.arquivo}</td>
                  <td className="py-2 pr-3">{row.unidade}</td>
                  <td className="py-2 pr-3">
                    {row.ok ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        <CheckCircle2 size={16} /> Ok
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-700">
                        <XCircle size={16} /> Erro
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-gray-600 text-xs max-w-md">{row.message ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
