import { logoHydrusHorizontalAbsoluteUrl } from '../../lib/branding';
import type { UnitBill } from './DemonstrativoConta';

function nomeExibicaoUnidade(unidade: string): { agrupamento: string; numero: string } {
  const i = unidade.indexOf('-');
  if (i <= 0) return { agrupamento: '', numero: unidade };
  return { agrupamento: unidade.slice(0, i), numero: unidade.slice(i + 1) };
}

type Props = {
  bill: UnitBill;
};

/**
 * Primeira página de cada unidade no relatório demonstrativo (legado): logo, condomínio, unidade e condômino
 * para envelope; na sequência imprime-se o demonstrativo completo.
 */
export default function DemonstrativoEnvelopeVerso({ bill }: Props) {
  const { agrupamento, numero } = nomeExibicaoUnidade((bill.Unidade || '').trim());
  const unitLine =
    agrupamento && numero ? `${agrupamento}-${numero}` : (bill.Unidade || '').trim() || '—';
  const condo = (bill.NomeCondominio ?? '').trim() || '—';
  const condomino = (bill.NomeCondomino ?? '—').replace(/"/g, '').trim() || '—';

  return (
    <div className="demonstrativo-envelope-verso min-h-[85dvh] print:min-h-0 bg-slate-50 print:bg-white">
      <div className="demonstrativo-envelope-verso-inner max-w-3xl mx-auto px-6 py-10 print:max-w-none print:px-10 print:py-12">
        <div className="flex justify-center sm:justify-start mb-10 print:mb-12">
          <img
            src={logoHydrusHorizontalAbsoluteUrl()}
            alt="HIDRUS"
            className="hydrus-print-logo h-14 sm:h-16 w-auto max-w-[min(100%,300px)] object-contain object-left print:h-16"
          />
        </div>

        <div className="space-y-6 text-left">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-slate-200 print:border-slate-300 pb-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Condomínio</p>
              <p className="text-xl sm:text-2xl font-semibold text-slate-900 leading-snug">{condo}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                Unidade
              </p>
              <p className="text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums tracking-tight">
                {unitLine}
              </p>
            </div>
          </div>

          <div className="pt-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Condômino</p>
            <p className="text-lg sm:text-xl font-medium text-slate-800 leading-snug">{condomino}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
