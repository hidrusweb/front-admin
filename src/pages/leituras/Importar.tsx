import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Upload, CheckCircle2, XCircle, Loader2, ImageIcon, FileSpreadsheet } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import { mapCondominio, normalizeApiList } from '../../lib/hidrusApi';
import {
  parseCsvLeituras,
  buildImageMapFromFiles,
  extractSignificantUnitNumber,
  getImageFileForUnit,
  hasImageForUnit,
  normalizeUnitNameForMatch,
  normalizeUnitNameLoose,
} from '../../lib/importLeituras';

interface ServerRow {
  unidade: string;
  leitura: number;
  importado: boolean;
  temImagem: boolean;
  imagemSalva: boolean;
  message: string | null;
}

export default function LeiturasImport() {
  const [condominioId, setCondominioId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvRows, setCsvRows] = useState<{ unidade: string; leitura: number }[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<{ file: File; url: string }[]>([]);
  const [serverResults, setServerResults] = useState<ServerRow[] | null>(null);
  const [resumo, setResumo] = useState<{ total: number; ok: number; erro: number; comFoto: number } | null>(null);
  const [loading, setLoading] = useState(false);
  /** Linha atual (1-based) durante importação sequencial */
  const [importProgress, setImportProgress] = useState<{
    current: number;
    total: number;
    unidade: string;
  } | null>(null);
  const [importFatalError, setImportFatalError] = useState<string | null>(null);

  const csvInputRef = useRef<HTMLInputElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);

  const {
    data: condominios = [],
    isLoading: condominiosLoading,
    isError: condominiosError,
    error: condominiosErr,
    refetch: refetchCondominios,
  } = useQuery({
    queryKey: ['condominios'],
    queryFn: () =>
      api.get('/Condominium/condominium').then((r) => normalizeApiList(r.data).map(mapCondominio)),
  });

  const condominiosFetchMessage = useMemo(() => {
    if (!condominiosErr) return '';
    if (axios.isAxiosError(condominiosErr)) {
      const d = condominiosErr.response?.data as { message?: string } | undefined;
      return d?.message ?? condominiosErr.message;
    }
    return condominiosErr instanceof Error ? condominiosErr.message : String(condominiosErr);
  }, [condominiosErr]);

  const imageMap = useMemo(() => buildImageMapFromFiles(imageFiles), [imageFiles]);

  useEffect(() => {
    const urls = imageFiles.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u.url));
  }, [imageFiles]);

  const readCsvFile = async (file: File) => {
    const text = await file.text();
    const rows = parseCsvLeituras(text);
    setCsvRows(rows);
    if (rows.length === 0) {
      toast.error('Nenhuma linha válida no CSV. Use o formato Unidade;Leitura');
    }
  };

  const onCsvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setCsvFile(f);
    setServerResults(null);
    setResumo(null);
    setImportFatalError(null);
    if (f) void readCsvFile(f);
    else setCsvRows([]);
  };

  const onImagesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    setImageFiles(list ? Array.from(list) : []);
    setServerResults(null);
    setResumo(null);
    setImportFatalError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!condominioId) {
      toast.error('Selecione o condomínio');
      return;
    }
    if (!csvFile) {
      toast.error('Selecione o arquivo CSV');
      return;
    }
    if (csvRows.length === 0) {
      toast.error('O CSV não tem linhas válidas para importar');
      return;
    }

    setLoading(true);
    setServerResults([]);
    setResumo(null);
    setImportFatalError(null);
    setImportProgress({ current: 1, total: csvRows.length, unidade: csvRows[0].unidade });

    const acc: ServerRow[] = [];

    const pushAxiosRow = (row: { unidade: string; leitura: number }, err: unknown, hasImg: boolean): void => {
      let msg = 'Falha ao enviar';
      if (axios.isAxiosError(err)) {
        const d = err.response?.data as { message?: string } | undefined;
        msg = d?.message ?? err.message;
      } else if (err instanceof Error) {
        msg = err.message;
      }
      acc.push({
        unidade: row.unidade,
        leitura: row.leitura,
        importado: false,
        temImagem: hasImg,
        imagemSalva: false,
        message: msg,
      });
      setServerResults([...acc]);
    };

    try {
      for (let i = 0; i < csvRows.length; i++) {
        const row = csvRows[i];
        setImportProgress({ current: i + 1, total: csvRows.length, unidade: row.unidade });

        const form = new FormData();
        form.append('idCondominio', condominioId);
        form.append('data', date);
        form.append('unidade', row.unidade);
        form.append('leitura', String(row.leitura));

        const imgFile = getImageFileForUnit(imageMap, row.unidade);
        if (imgFile) {
          form.append('imagem', imgFile);
        }

        try {
          const res = await api.post<ServerRow>('/mensuration/import-row', form, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          acc.push(res.data);
          setServerResults([...acc]);
        } catch (err: unknown) {
          pushAxiosRow(row, err, !!imgFile);
        }
      }

      const ok = acc.filter((r) => r.importado).length;
      const erro = acc.filter((r) => !r.importado).length;
      const comFoto = acc.filter((r) => r.imagemSalva).length;
      setResumo({ total: acc.length, ok, erro, comFoto });
      setServerResults(acc);
      toast.success(
        erro > 0 ? `Importação concluída com ${erro} erro(s).` : 'Importação concluída com sucesso.'
      );
    } catch (err: unknown) {
      let msg = 'Erro inesperado na importação';
      if (axios.isAxiosError(err)) {
        const d = err.response?.data as { message?: string } | undefined;
        msg = d?.message ?? err.message;
      } else if (err instanceof Error) {
        msg = err.message;
      }
      setImportFatalError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
      setImportProgress(null);
    }
  };

  const csvOrfas = useMemo(() => {
    const matchesSomeRow = (stem: string) =>
      csvRows.some((row) => {
        if (normalizeUnitNameForMatch(row.unidade) === normalizeUnitNameForMatch(stem)) return true;
        if (
          normalizeUnitNameLoose(row.unidade) !== '' &&
          normalizeUnitNameLoose(row.unidade) === normalizeUnitNameLoose(stem)
        ) {
          return true;
        }
        const nr = extractSignificantUnitNumber(row.unidade);
        const ns = extractSignificantUnitNumber(stem);
        return nr !== null && ns !== null && nr === ns;
      });
    return imageFiles.filter((f) => {
      const stem = f.name.replace(/\.[^.]+$/i, '');
      return !matchesSomeRow(stem);
    });
  }, [csvRows, imageFiles]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <h1 className="text-xl font-bold text-gray-800">Importar Leituras</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Dados da leitura */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-gray-800">Dados da leitura</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Condomínio *</label>
              <select
                className="input"
                value={condominioId}
                onChange={(e) => {
                  setCondominioId(e.target.value);
                  setServerResults(null);
                  setResumo(null);
                  setImportFatalError(null);
                }}
                required
                disabled={condominiosLoading || condominiosError}
              >
                <option value="">
                  {condominiosLoading ? 'Carregando…' : 'Selecione...'}
                </option>
                {condominios
                  .filter((c: { id: number }) => Number.isFinite(c.id) && c.id > 0)
                  .map((c: { id: number; nome: string }) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
              </select>
              {condominiosError && (
                <div className="mt-2 space-y-1">
                  <p className="text-sm text-red-600">
                    Não foi possível carregar os condomínios. Verifique se a API está acessível e se você continua logado.
                    {condominiosFetchMessage ? (
                      <span className="block text-xs mt-1 opacity-90">{condominiosFetchMessage}</span>
                    ) : null}
                  </p>
                  <button type="button" className="text-sm text-primary-600 underline" onClick={() => refetchCondominios()}>
                    Tentar novamente
                  </button>
                </div>
              )}
              {!condominiosLoading && !condominiosError && condominios.length === 0 && (
                <p className="text-sm text-amber-700 mt-2">
                  Nenhum condomínio ativo cadastrado. Cadastre em Administração → Condomínios.
                </p>
              )}
            </div>
            <div>
              <label className="label">Data das leituras *</label>
              <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Imagens */}
          <div className="card space-y-3 flex flex-col min-h-[320px]">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <ImageIcon size={18} className="text-primary-600" />
                Imagens
              </h2>
              <button
                type="button"
                onClick={() => imgInputRef.current?.click()}
                className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1 font-medium"
              >
                <Upload size={16} />
                Selecionar imagens
              </button>
            </div>
            <input
              ref={imgInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={onImagesChange}
            />
            <p className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 border border-gray-100">
              <strong>Observação:</strong> as imagens serão vinculadas pelo <strong>nome do arquivo</strong> (sem extensão),
              igual ao nome da unidade no CSV — ex.: <code className="text-xs bg-white px-1 rounded">A-101.jpg</code> para a
              unidade <code className="text-xs bg-white px-1 rounded">A-101</code>. As fotos ficam salvas no{' '}
              <strong>storage do Laravel</strong> (<code className="text-xs">storage/app/public/mensurations/…</code>).
            </p>
            {previews.length === 0 ? (
              <p className="text-sm text-gray-400 flex-1 flex items-center justify-center border border-dashed border-gray-200 rounded-xl py-12">
                Nenhuma imagem selecionada
              </p>
            ) : (
              <div className="flex-1 overflow-y-auto max-h-[420px] space-y-3 pr-1">
                {previews.map(({ file, url }) => (
                  <div
                    key={file.name + file.size}
                    className="flex gap-3 items-center p-2 rounded-lg border border-gray-100 bg-white"
                  >
                    <img src={url} alt="" className="w-16 h-16 object-cover rounded-md border border-gray-200 shrink-0" />
                    <span className="text-sm font-medium text-gray-800 break-all">{file.name}</span>
                  </div>
                ))}
              </div>
            )}
            {csvOrfas.length > 0 && (
              <p className="text-xs text-amber-600">
                {csvOrfas.length} imagem(ns) sem linha correspondente no CSV (nome do arquivo ≠ unidade na planilha).
              </p>
            )}
          </div>

          {/* CSV / tabela */}
          <div className="card flex flex-col min-h-[320px] max-h-[560px] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <FileSpreadsheet size={18} className="text-primary-600" />
                Leituras do CSV
              </h2>
              <button
                type="button"
                onClick={() => csvInputRef.current?.click()}
                className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1 font-medium"
              >
                <Upload size={16} />
                Selecionar planilha
              </button>
            </div>
            <input ref={csvInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onCsvChange} />
            <p className="text-xs text-gray-500">
              Formato: <code className="bg-gray-100 px-1 rounded">Unidade;Leitura</code> — separador <code className="bg-gray-100 px-1">;</code>. No
              sistema legado (.NET), a coluna Unidade é <strong>Agrupamento-Número</strong> (ex.: <code className="bg-gray-100 px-1">P-404</code> = agrupamento{' '}
              <em>P</em> + unidade <em>404</em> no cadastro). Você também pode usar só o nome completo da unidade, se for igual ao cadastro. Cabeçalho opcional:{' '}
              <code className="bg-gray-100 px-1">Unidade;Leitura</code>.
            </p>
            {csvFile && (
              <p className="text-xs text-green-700">
                Arquivo: <strong>{csvFile.name}</strong> — {csvRows.length} linha(s)
              </p>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto border border-gray-200 rounded-lg max-h-[420px]">
              <table className="w-full min-w-[280px] text-sm">
                <thead className="bg-gray-50 text-gray-700 shadow-sm sticky top-0 z-[1]">
                  <tr>
                    <th className="text-left p-3 font-semibold">Unidade</th>
                    <th className="text-right p-3 font-semibold">Leitura (m³)</th>
                    <th className="text-center p-3 font-semibold w-32">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {csvRows.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-8 text-center text-gray-400">
                        Carregue um CSV para visualizar as linhas e a conferência com as imagens
                      </td>
                    </tr>
                  ) : (
                    csvRows.map((row, idx) => {
                      const ok = hasImageForUnit(imageMap, row.unidade);
                      return (
                        <tr key={`${row.unidade}-${idx}`} className="border-t border-gray-100">
                          <td className="p-3 font-medium text-gray-700">{row.unidade}</td>
                          <td className="p-3 text-right tabular-nums">{row.leitura}</td>
                          <td className="p-3 text-center">
                            {ok ? (
                              <span className="inline-flex items-center justify-center text-green-600" title="Imagem encontrada">
                                <CheckCircle2 size={22} />
                              </span>
                            ) : (
                              <span className="inline-flex items-center justify-center text-gray-300" title="Sem imagem com o mesmo nome">
                                <XCircle size={22} />
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !csvFile || !condominioId || csvRows.length === 0}
          className="btn-primary w-full justify-center py-3 text-base"
        >
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Importando…
            </>
          ) : (
            <>
              <Upload size={18} />
              Importar ({csvRows.length} linha{csvRows.length !== 1 ? 's' : ''})
            </>
          )}
        </button>
      </form>

      {(loading || (serverResults !== null && serverResults.length > 0) || importFatalError) && (
        <div className="card space-y-4 border border-gray-200">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            {loading ? <Loader2 size={18} className="animate-spin text-primary-600" /> : null}
            Progresso da importação
          </h2>

          {importFatalError && (
            <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm p-3">
              <strong>Erro:</strong> {importFatalError}
            </div>
          )}

          {importProgress && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-gray-600">
                <span>
                  Linha {importProgress.current} de {importProgress.total}
                </span>
                <span className="font-medium text-gray-800 truncate max-w-[60%]" title={importProgress.unidade}>
                  {importProgress.unidade}
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-gray-200 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary-600 transition-[width] duration-200 ease-out"
                  style={{
                    width: `${Math.min(100, (importProgress.current / importProgress.total) * 100)}%`,
                  }}
                />
              </div>
              <p className="text-xs text-gray-500">
                Cada linha é enviada em uma requisição separada (com a foto da unidade, se houver), para não exceder o limite de
                upload do servidor.
              </p>
            </div>
          )}

          {resumo && !loading && (
            <p className="text-sm text-gray-700">
              Total: {resumo.total} — OK: <strong className="text-green-700">{resumo.ok}</strong> — Erros:{' '}
              <strong className="text-red-600">{resumo.erro}</strong> — Com foto salva: <strong>{resumo.comFoto}</strong>
            </p>
          )}

          {serverResults !== null && serverResults.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Detalhe por unidade</h3>
              <div className="space-y-1 max-h-72 overflow-y-auto border border-gray-100 rounded-lg p-1">
                {serverResults.map((r, i) => (
                  <div
                    key={`${r.unidade}-${i}`}
                    className={`flex items-start gap-2 p-2 rounded-lg text-sm ${
                      r.importado ? 'bg-green-50 text-green-900' : 'bg-red-50 text-red-900'
                    }`}
                  >
                    {r.importado ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> : <XCircle size={16} className="shrink-0 mt-0.5" />}
                    <div>
                      <span className="font-medium">{r.unidade}</span> — leitura {r.leitura}
                      {r.imagemSalva && <span className="text-green-700"> (foto gravada)</span>}
                      {!r.imagemSalva && r.importado && <span className="text-gray-400"> (sem foto)</span>}
                      {r.message && <span className="block text-red-800 mt-0.5">{r.message}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!loading && serverResults !== null && serverResults.length > 0 && (
            <p className="text-xs text-gray-500">
              Imagens em <code className="bg-gray-100 px-1 rounded">storage/app/public/mensurations/…</code>. Na hospedagem:{' '}
              <code className="bg-gray-100 px-1">php artisan storage:link</code>.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
