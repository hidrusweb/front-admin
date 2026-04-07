import { useEffect, useMemo, useState } from 'react';
import { logoHydrusHorizontalAbsoluteUrl } from '../../lib/branding';

/** Resposta de GET /reports/bill/unidade/{id}. */
export interface UnitBill {
  IdUnidade?: number;
  Unidade: string;
  Consumo?: number;
  LeituraAtual: number;
  LeituraAnterior: number;
  DataLeitura?: string | null;
  DataLeituraAnterior?: string | null;
  DataProximaLeitura?: string | null;
  ValorPagar: number;
  ValorAreaComum: number;
  ValorExcendente?: number | null;
  NomeCondominio?: string;
  NomeCondomino?: string | null;
  CnpjCondominio?: string;
  UrlImagem?: string | null;
  Hidrometro?: string | null;
  UsaPadraoCaesb?: boolean;
  TaxaMinima?: number;
  Historico?: Array<{
    MesLeitura: number;
    AnoLeitura: number;
    ConsumoDoMes: number;
    DataLeitura?: string;
  }>;
  FaixasEnquadramento?: Array<{
    OrdemFaixa: number;
    NomeFaixa?: string;
    Minimo: number;
    Maximo: number;
    Enquadramento: number;
    AliquotaAgua: number;
    AliquotaEsgoto: number;
    TotalFaixa: number;
  }>;
}

const brl = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

const fmtDay = (d: string | null | undefined) => {
  if (!d) return '—';
  const [y, mo, day] = String(d).split('T')[0].split('-').map(Number);
  if (!y || !mo) return '—';
  return new Date(y, mo - 1, day || 1).toLocaleDateString('pt-BR');
};

const mesCurto = (mes: number) =>
  ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][mes] ?? String(mes);

function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url || url.length < 8) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const api = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api';
  const origin = api.replace(/\/api\/?$/i, '');
  return `${origin}/${String(url).replace(/^\//, '')}`;
}

function nomeExibicaoUnidade(unidade: string): { agrupamento: string; numero: string } {
  const i = unidade.indexOf('-');
  if (i <= 0) return { agrupamento: '', numero: unidade };
  return { agrupamento: unidade.slice(0, i), numero: unidade.slice(i + 1) };
}

function niceCeilChartMax(maxConsumo: number): number {
  if (maxConsumo <= 0) return 1;
  const padded = maxConsumo * 1.15;
  const exp = Math.floor(Math.log10(padded));
  const base = 10 ** exp;
  const m = padded / base;
  const step = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10;
  return step * base;
}

function niceFloorChartMin(minConsumo: number): number {
  if (minConsumo >= 0) return 0;
  return -niceCeilChartMax(Math.abs(minConsumo));
}

function formatM3Tick(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1).replace(/\.0$/, '');
}

function ReadingImageSlot({ src, maxHeightClass }: { src: string | null; maxHeightClass: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [src]);
  const showImage = Boolean(src) && !broken;
  return (
    <div className="flex items-center justify-center min-h-[160px] print:min-h-0 w-full">
      {showImage ? (
        <img
          src={src!}
          alt="Registro da leitura do hidrômetro"
          className={`max-w-full object-contain rounded-xl ring-1 ring-slate-200 print-photo-max print:max-h-[5rem] ${maxHeightClass}`}
          onError={() => setBroken(true)}
        />
      ) : (
        <div className="w-full h-40 rounded-xl bg-slate-100 flex flex-col items-center justify-center gap-1 px-3 text-center print:h-16 print:gap-0 print:px-2">
          <p className="text-sm font-medium text-slate-600 print:text-[10px]">Sem imagem</p>
          <p className="text-xs text-slate-500 leading-snug print:text-[9px] print:leading-tight">
            Não há foto cadastrada ou a imagem não pôde ser carregada.
          </p>
        </div>
      )}
    </div>
  );
}

type Props = {
  bill: UnitBill;
  anoRef: number;
  mesRef: number;
  /** Se false, não renderiza o botão flutuante de impressão (ex.: página de relatórios com botão global). */
  showPrintButton?: boolean;
};

export default function DemonstrativoConta({ bill, anoRef, mesRef, showPrintButton = true }: Props) {
  const consumo = bill.Consumo ?? Math.max(0, Number(bill.LeituraAtual) - Number(bill.LeituraAnterior));
  const excedenteM3 = Math.max(0, consumo - 10);
  const caesb = bill.UsaPadraoCaesb === true;
  const { agrupamento, numero } = nomeExibicaoUnidade(bill.Unidade || '');
  const condoNome = bill.NomeCondominio ?? '';
  const img = resolveImageUrl(bill.UrlImagem ?? undefined);

  const historicoOrdenado = useMemo(() => {
    const h = bill.Historico ?? [];
    return [...h].sort((a, b) => {
      const da = a.DataLeitura ?? `${a.AnoLeitura}-${String(a.MesLeitura).padStart(2, '0')}-01`;
      const db = b.DataLeitura ?? `${b.AnoLeitura}-${String(b.MesLeitura).padStart(2, '0')}-01`;
      return da.localeCompare(db);
    });
  }, [bill.Historico]);

  const historicoRecentePrimeiro = useMemo(() => [...historicoOrdenado].reverse(), [historicoOrdenado]);

  const { chartMin, chartMax, chartSpan, maxConsumoHist, minConsumoHist } = useMemo(() => {
    const vals = historicoOrdenado.map((x) => Number(x.ConsumoDoMes));
    if (vals.length === 0) {
      return { chartMin: 0, chartMax: 1, chartSpan: 1, maxConsumoHist: 0, minConsumoHist: 0 };
    }
    const rawMax = Math.max(...vals);
    const rawMin = Math.min(...vals);
    const maxW0 = Math.max(0, rawMax);
    const minW0 = Math.min(0, rawMin);
    let cMax = maxW0 === 0 && minW0 === 0 ? 1 : maxW0 === 0 ? 0 : niceCeilChartMax(maxW0);
    let cMin = minW0 === 0 ? 0 : niceFloorChartMin(minW0);
    if (cMax === cMin) {
      cMax += 1;
      cMin -= 1;
    }
    const chartSpan = cMax - cMin;
    return { chartMin: cMin, chartMax: cMax, chartSpan, maxConsumoHist: rawMax, minConsumoHist: rawMin };
  }, [historicoOrdenado]);

  const faixas = bill.FaixasEnquadramento ?? [];
  const sumFaixas = faixas.reduce((s, f) => s + (f.TotalFaixa ?? 0), 0);
  const taxaMin = bill.TaxaMinima ?? 0;
  const dataLeitura = bill.DataLeitura;
  const unitLabel = agrupamento && numero ? `${agrupamento} · ${numero}` : bill.Unidade || '—';
  const spanSafe = chartSpan > 0 ? chartSpan : 1;
  const zeroLinePctHistorico = ((0 - chartMin) / spanSafe) * 100;

  return (
    <div className="demonstrativo-print-root bg-slate-100 min-h-full print:bg-white">
      <div className="max-w-3xl mx-auto px-4 py-6 print:py-0 print:px-0 print:max-w-none">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5 print-a4-tight print:mb-2">
          <div className="flex items-center min-h-[3.5rem]">
            <img
              src={logoHydrusHorizontalAbsoluteUrl()}
              alt="HIDRUS"
              className="hydrus-print-logo h-12 sm:h-14 w-auto max-w-[min(100%,280px)] object-contain object-left print:h-11"
            />
          </div>
          <div className="text-right">
            <p className="text-xs font-medium uppercase tracking-wider text-cyan-600">Demonstrativo</p>
            <p className="text-lg font-semibold text-slate-900 tabular-nums">
              {mesCurto(mesRef)} / {anoRef}
            </p>
          </div>
        </div>

        <div className="print-keep-together rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/80 overflow-hidden print:shadow-none print:ring-1 print:ring-slate-300">
          <div className="bg-gradient-to-br from-slate-50 via-white to-slate-50/30 px-5 py-4 border-b border-slate-100 print-a4-tight">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-slate-500">Condomínio</p>
                <h2 className="text-lg font-semibold text-slate-900 leading-tight">{condoNome || '—'}</h2>
              </div>
              <span className="shrink-0 inline-flex items-center rounded-full bg-cyan-50 text-cyan-800 px-3 py-1 text-sm font-medium ring-1 ring-cyan-100">
                {unitLabel}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-sm text-slate-600 w-full">
              <span className="min-w-0">
                <span className="text-slate-400">Condômino</span>{' '}
                <span className="font-medium text-slate-800">{(bill.NomeCondomino ?? '—').replace(/"/g, '')}</span>
              </span>
              <span className="text-right tabular-nums">
                <span className="text-slate-400">Hidrômetro</span>{' '}
                <span className="font-medium text-slate-800">{bill.Hidrometro ?? '—'}</span>
              </span>
            </div>
          </div>

          {caesb ? (
            <div className="p-5 grid md:grid-cols-2 gap-6 print:grid-cols-2 print:gap-3 print:p-3 print-a4-tight">
              <div className="space-y-4 print:space-y-2">
                <h3 className="text-sm font-semibold text-slate-800">
                  Demonstrativo · {mesCurto(mesRef)} / {anoRef}
                </h3>
                <div className="rounded-xl bg-slate-50 px-4 py-3 text-center ring-1 ring-slate-100">
                  <p className="text-xs text-slate-500">Consumo</p>
                  <p className="text-xl font-semibold text-slate-900 tabular-nums print:text-base">{consumo} m³</p>
                </div>
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Leituras</p>
                <div className="grid grid-cols-3 gap-2 text-center text-[11px] print:text-[9px]">
                  <div className="rounded-lg bg-slate-50 py-2 px-1 ring-1 ring-slate-100">
                    <div className="text-slate-500 leading-tight">Anterior</div>
                    <div className="text-[10px] text-slate-400">{fmtDay(bill.DataLeituraAnterior)}</div>
                    <div className="mt-1 font-semibold text-slate-900 tabular-nums">{bill.LeituraAnterior}</div>
                  </div>
                  <div className="rounded-lg bg-cyan-50/80 py-2 px-1 ring-1 ring-cyan-100/80">
                    <div className="text-cyan-800 leading-tight">Atual</div>
                    <div className="text-[10px] text-cyan-700/80">{fmtDay(dataLeitura)}</div>
                    <div className="mt-1 font-semibold text-slate-900 tabular-nums">{bill.LeituraAtual}</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 py-2 px-1 ring-1 ring-slate-100">
                    <div className="text-slate-500 leading-tight">Próxima leitura</div>
                    <div className="text-[10px] text-slate-400" aria-hidden>
                      {'\u00a0'}
                    </div>
                    <div className="mt-1 font-semibold text-slate-900 tabular-nums">
                      {fmtDay(bill.DataProximaLeitura)}
                    </div>
                  </div>
                </div>
              </div>
              <ReadingImageSlot src={img} maxHeightClass="max-h-[280px]" />
            </div>
          ) : (
            <div className="p-5 grid md:grid-cols-2 gap-6 print:grid-cols-2 print:gap-3 print:p-3 print-a4-tight">
              <div className="space-y-4 print:space-y-2">
                <h3 className="text-sm font-semibold text-slate-800">
                  Demonstrativo · {mesCurto(mesRef)} / {anoRef}
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-slate-50 p-3 text-center ring-1 ring-slate-100">
                    <p className="text-xs text-slate-500">Consumo</p>
                    <p className="font-semibold text-slate-900 tabular-nums print:text-sm">{consumo} m³</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 text-center ring-1 ring-slate-100">
                    <p className="text-xs text-slate-500">Excedente a 10 m³</p>
                    <p className="font-semibold text-slate-900 tabular-nums print:text-sm">{excedenteM3} m³</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 text-center ring-1 ring-slate-100">
                    <p className="text-xs text-slate-500">Taxa mínima</p>
                    <p className="font-semibold text-slate-900 print:text-xs">{brl(taxaMin)}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 text-center ring-1 ring-slate-100">
                    <p className="text-xs text-slate-500">Valor excedente</p>
                    <p className="font-semibold text-slate-900 print:text-xs">{brl(bill.ValorExcendente ?? 0)}</p>
                  </div>
                </div>
                <div className="rounded-xl bg-gradient-to-r from-cyan-600 to-slate-800 p-4 text-center text-white shadow-sm">
                  <p className="text-xs text-white/80">Total a pagar</p>
                  <p className="text-xl font-bold tabular-nums print:text-base">{brl(bill.ValorPagar)}</p>
                </div>
              </div>
              <ReadingImageSlot src={img} maxHeightClass="max-h-[320px]" />
            </div>
          )}
        </div>

        <section className="mt-6 print:mt-2 print-keep-together">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 print:mb-1">
            {caesb ? 'Detalhamento da conta' : 'Faixas de cobrança'}
          </h4>
          <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/80 overflow-hidden print:shadow-none print-keep-together">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse print-table-compact">
                <thead>
                  <tr className="bg-slate-100 text-slate-700">
                    <th className="px-3 py-2 text-left font-semibold text-xs">Faixa</th>
                    <th className="px-2 py-2 text-center font-semibold text-xs">Mín.</th>
                    <th className="px-2 py-2 text-center font-semibold text-xs">Máx.</th>
                    <th className="px-2 py-2 text-center font-semibold text-xs">Enq.</th>
                    <th className="px-2 py-2 text-center font-semibold text-xs">Água</th>
                    <th className="px-2 py-2 text-center font-semibold text-xs">Esgoto</th>
                    <th className="px-3 py-2 text-right font-semibold text-xs">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {faixas.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-500 text-sm">
                        Nenhuma faixa para este período.
                      </td>
                    </tr>
                  ) : (
                    faixas.map((f) => (
                      <tr key={f.OrdemFaixa} className="hover:bg-slate-50/80 print:hover:bg-transparent">
                        <td className="px-3 py-2 text-slate-800 text-xs">
                          {(f.NomeFaixa ?? `Faixa ${f.OrdemFaixa}`).replace(/"/g, '')}
                        </td>
                        <td className="px-2 py-2 text-center tabular-nums text-xs">{f.Minimo}</td>
                        <td className="px-2 py-2 text-center tabular-nums text-xs">{f.Maximo}</td>
                        <td className="px-2 py-2 text-center tabular-nums text-xs">{f.Enquadramento}</td>
                        <td className="px-2 py-2 text-center text-xs tabular-nums">{brl(Number(f.AliquotaAgua))}</td>
                        <td className="px-2 py-2 text-center text-xs tabular-nums">{brl(Number(f.AliquotaEsgoto))}</td>
                        <td className="px-3 py-2 text-right font-medium text-xs tabular-nums">{brl(f.TotalFaixa)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot className="bg-slate-50 text-slate-800">
                  <tr>
                    <td colSpan={6} className="px-3 py-2 text-right text-xs font-medium">
                      Total faixas (variável)
                    </td>
                    <td className="px-3 py-2 text-right text-xs font-bold tabular-nums">{brl(sumFaixas)}</td>
                  </tr>
                  <tr>
                    <td colSpan={6} className="px-3 py-2 text-right text-xs font-medium">
                      Tarifa mínima
                    </td>
                    <td className="px-3 py-2 text-right text-xs font-bold tabular-nums">{brl(taxaMin)}</td>
                  </tr>
                  <tr>
                    <td colSpan={6} className="px-3 py-2 text-right text-xs font-medium">
                      Área comum
                    </td>
                    <td className="px-3 py-2 text-right text-xs font-bold tabular-nums">{brl(bill.ValorAreaComum)}</td>
                  </tr>
                  <tr className="bg-slate-200/80">
                    <td colSpan={6} className="px-3 py-2 text-right text-xs font-bold">
                      Total a pagar
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-bold tabular-nums">{brl(bill.ValorPagar)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </section>

        <section className="mt-6 mb-8 print:mt-2 print:mb-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3 print:mb-1">
            Histórico recente
          </h4>
          <div className="grid md:grid-cols-2 gap-5 print:grid-cols-2 print:gap-2">
            <ul className="space-y-0 border-l-2 border-cyan-200/80 ml-1 pl-4 print:pl-2 print:ml-0">
              {historicoRecentePrimeiro.map((h) => {
                const ativo = h.AnoLeitura === anoRef && h.MesLeitura === mesRef;
                const c = Number(h.ConsumoDoMes);
                const labelMes =
                  ['', 'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][
                    h.MesLeitura
                  ];
                return (
                  <li
                    key={`${h.AnoLeitura}-${h.MesLeitura}`}
                    className={`relative pl-2 py-1.5 text-xs print:py-0.5 ${ativo ? 'font-semibold text-cyan-700' : 'text-slate-600'}`}
                  >
                    <span
                      className={`absolute -left-[19px] top-2 w-2 h-2 rounded-full print:top-1.5 ${ativo ? 'bg-cyan-500' : 'bg-slate-300'}`}
                    />
                    {labelMes}/{h.AnoLeitura}:{' '}
                    <strong
                      className={`tabular-nums ${!ativo && c < 0 ? 'text-amber-700' : ''} ${ativo && c < 0 ? 'text-cyan-900' : ''}`}
                    >
                      {formatM3Tick(c)}
                    </strong>{' '}
                    m³
                  </li>
                );
              })}
            </ul>
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-2 mb-2 print:mb-1">
                <p className="text-xs font-medium text-slate-700">Consumo mensal (m³)</p>
                {historicoOrdenado.length > 0 && (
                  <p className="text-[11px] text-slate-500 print:hidden text-right">
                    No período:{' '}
                    <span
                      className={`font-semibold tabular-nums ${minConsumoHist < 0 ? 'text-amber-800' : 'text-slate-700'}`}
                    >
                      {formatM3Tick(minConsumoHist)}
                    </span>
                    {' — '}
                    <span className="font-semibold tabular-nums text-slate-700">{formatM3Tick(maxConsumoHist)}</span>
                  </p>
                )}
              </div>
              {historicoOrdenado.length === 0 ? (
                <p className="text-sm text-slate-400 py-6 text-center rounded-xl bg-slate-50 border border-slate-100">
                  Sem histórico para o gráfico.
                </p>
              ) : (
                <div className="demonstrativo-chart-card rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden print:overflow-visible print:shadow-none print:border-slate-300">
                  <div className="flex gap-2 p-3 pl-1 sm:pl-2 print:p-1.5 print:gap-1 print:overflow-visible">
                    <div className="flex flex-col shrink-0 w-9 sm:w-11 print:w-8" aria-hidden>
                      <div className="h-5 shrink-0 min-h-[1.25rem] print:h-4 print:min-h-4" />
                      <div className="flex h-44 print-chart-h flex-col justify-between text-[10px] sm:text-xs text-slate-500 tabular-nums text-right pr-1 print:text-[8px]">
                        {[0, 1, 2, 3, 4].map((i) => (
                          <span key={i}>{formatM3Tick(chartMax - (chartSpan * i) / 4)}</span>
                        ))}
                      </div>
                    </div>
                    <div className="demonstrativo-chart-stack flex-1 min-w-0 flex flex-col min-h-0 print:overflow-visible">
                      <div className="flex justify-around gap-0.5 sm:gap-1 px-0.5 h-5 min-h-[1.25rem] shrink-0 items-end pb-0.5 print:h-4 print:min-h-4 print:gap-0">
                        {historicoOrdenado.map((h) => {
                          const v = Number(h.ConsumoDoMes);
                          const ativo = h.AnoLeitura === anoRef && h.MesLeitura === mesRef;
                          return (
                            <div
                              key={`v-${h.AnoLeitura}-${h.MesLeitura}`}
                              className="flex-1 flex justify-center min-w-0 max-w-[56px]"
                            >
                              <span
                                className={`text-[10px] sm:text-xs font-semibold tabular-nums whitespace-nowrap print:text-[8px] ${
                                  v < 0
                                    ? ativo
                                      ? 'text-amber-900'
                                      : 'text-amber-700'
                                    : ativo
                                      ? 'text-cyan-700'
                                      : 'text-slate-700'
                                }`}
                              >
                                {formatM3Tick(v)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="demonstrativo-chart-plot relative h-44 print-chart-h overflow-hidden print:overflow-visible">
                        <div className="absolute inset-0 flex flex-col pointer-events-none">
                          {[0, 1, 2, 3].map((i) => (
                            <div key={i} className="flex-1 border-b border-dashed border-slate-200/90" />
                          ))}
                          <div className="flex-1" />
                        </div>
                        <div
                          className="absolute left-0 right-0 z-10 border-t-2 border-slate-600/75 pointer-events-none"
                          style={{ bottom: `${zeroLinePctHistorico}%` }}
                        />
                        <div className="absolute inset-0 flex justify-around gap-0.5 sm:gap-1 px-0.5 print:gap-0">
                          {historicoOrdenado.map((h) => {
                            const v = Number(h.ConsumoDoMes);
                            const hPct = (Math.abs(v) / spanSafe) * 100;
                            const ativo = h.AnoLeitura === anoRef && h.MesLeitura === mesRef;
                            const mesLbl =
                              ['', 'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][
                                h.MesLeitura
                              ] ?? '?';
                            return (
                              <div
                                key={`b-${h.AnoLeitura}-${h.MesLeitura}`}
                                className="flex-1 flex flex-col items-center min-w-0 max-w-[56px] h-full min-h-0 relative group"
                              >
                                <div className="relative flex-1 w-full max-w-[44px] mx-auto min-h-0">
                                  {v >= 0 ? (
                                    <div
                                      className={`absolute left-1/2 -translate-x-1/2 w-full max-w-[40px] rounded-t-md transition-colors ${
                                        ativo
                                          ? 'bg-gradient-to-t from-cyan-700 to-cyan-400 ring-2 ring-cyan-300/70 ring-offset-1 ring-offset-white'
                                          : 'bg-gradient-to-t from-slate-600 to-slate-400 group-hover:from-slate-700 group-hover:to-slate-500'
                                      } print:ring-0 print:ring-offset-0`}
                                      style={{
                                        bottom: `${zeroLinePctHistorico}%`,
                                        height: `${hPct}%`,
                                        minHeight: v > 0 ? 4 : 0,
                                      }}
                                      title={`${mesLbl}/${h.AnoLeitura}: ${formatM3Tick(v)} m³`}
                                    />
                                  ) : (
                                    <div
                                      className={`absolute left-1/2 -translate-x-1/2 w-full max-w-[40px] rounded-b-md bg-gradient-to-b transition-colors ${
                                        ativo
                                          ? 'from-amber-800 to-amber-600 ring-2 ring-amber-400/60 ring-offset-1 ring-offset-white'
                                          : 'from-amber-700 to-amber-500 group-hover:from-amber-800 group-hover:to-amber-600'
                                      } print:ring-0 print:ring-offset-0`}
                                      style={{
                                        bottom: `${zeroLinePctHistorico - hPct}%`,
                                        height: `${hPct}%`,
                                        minHeight: 4,
                                      }}
                                      title={`${mesLbl}/${h.AnoLeitura}: ${formatM3Tick(v)} m³`}
                                    />
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div className="flex justify-around gap-1 sm:gap-1.5 px-0.5 pt-1 border-t border-slate-100 mt-0.5 print:gap-0.5 print:pt-0.5">
                        {historicoOrdenado.map((h) => {
                          const ativo = h.AnoLeitura === anoRef && h.MesLeitura === mesRef;
                          const mesLbl =
                            ['', 'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][
                              h.MesLeitura
                            ] ?? '?';
                          return (
                            <div
                              key={`x-${h.AnoLeitura}-${h.MesLeitura}`}
                              className={`flex-1 text-center min-w-0 max-w-[56px] text-[9px] sm:text-[10px] tabular-nums leading-tight print:text-[7px] ${
                                ativo ? 'font-semibold text-cyan-700' : 'text-slate-500'
                              }`}
                            >
                              {mesLbl}
                              <span className="text-slate-400 font-normal">/{String(h.AnoLeitura).slice(-2)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 px-3 pb-2 print:hidden print:pb-0">
                    Escala: {formatM3Tick(chartMin)} a {formatM3Tick(chartMax)} m³ (linha escura = zero).
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {showPrintButton && (
        <button
          type="button"
          onClick={() => window.print()}
          className="print:hidden fixed bottom-6 right-6 z-50 rounded-full bg-slate-900 text-white px-5 py-3 text-sm font-medium shadow-lg hover:bg-slate-800 transition-colors"
        >
          Imprimir
        </button>
      )}
    </div>
  );
}
