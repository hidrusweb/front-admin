import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Building2,
  Users,
  Home,
  FileText,
  BarChart2,
  TrendingUp,
  Layers,
  Percent,
  CalendarClock,
  Droplets,
  ClipboardList,
  Upload,
  ArrowUpRight,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getUserDisplayName } from '../lib/auth';
import api from '../lib/api';
import {
  normalizeApiList,
  mapCondominio,
  mapConsumo,
  mapUnidade,
  mapTabelaImposto,
} from '../lib/hidrusApi';

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

function formatDatePt(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : d.toLocaleDateString('pt-BR');
}

type KpiCardProps = {
  label: string;
  value: string | number;
  hint?: string;
  icon: React.ReactNode;
  tone: 'blue' | 'emerald' | 'violet' | 'amber' | 'rose' | 'slate';
};

const toneRing: Record<KpiCardProps['tone'], string> = {
  blue: 'ring-blue-100 bg-gradient-to-br from-white to-blue-50/80',
  emerald: 'ring-emerald-100 bg-gradient-to-br from-white to-emerald-50/80',
  violet: 'ring-violet-100 bg-gradient-to-br from-white to-violet-50/80',
  amber: 'ring-amber-100 bg-gradient-to-br from-white to-amber-50/80',
  rose: 'ring-rose-100 bg-gradient-to-br from-white to-rose-50/80',
  slate: 'ring-slate-100 bg-gradient-to-br from-white to-slate-50/80',
};

const toneIcon: Record<KpiCardProps['tone'], string> = {
  blue: 'bg-blue-100 text-blue-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  violet: 'bg-violet-100 text-violet-700',
  amber: 'bg-amber-100 text-amber-700',
  rose: 'bg-rose-100 text-rose-700',
  slate: 'bg-slate-100 text-slate-700',
};

function KpiCard({ label, value, hint, icon, tone }: KpiCardProps) {
  return (
    <div className={`rounded-xl border border-gray-100 p-4 shadow-sm ring-1 ${toneRing[tone]}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{value}</p>
          {hint ? <p className="mt-1 text-xs text-gray-500 leading-snug">{hint}</p> : null}
        </div>
        <div className={`shrink-0 rounded-lg p-2.5 ${toneIcon[tone]}`}>{icon}</div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const role = Array.isArray(user?.role) ? user!.role[0] : user?.role ?? '';
  const isAdmin = ['ADMINISTRADOR', 'COLABORADOR', 'ADMINISTRATIVO'].includes(role);
  const isAdministrador = role === 'ADMINISTRADOR';

  const now = useMemo(() => new Date(), []);
  const anoAtual = now.getFullYear();
  const mesAtual = now.getMonth() + 1;
  const mesLabel = `${MESES[mesAtual - 1]} de ${anoAtual}`;

  const { data: condominiosRaw = [], isLoading: loadingCond } = useQuery({
    queryKey: ['dashboard-condominios'],
    queryFn: () =>
      api
        .get('/Condominium/condominium', { params: { includeInactive: true } })
        .then((r) => (Array.isArray(r.data) ? r.data : []).map(mapCondominio)),
    enabled: isAdmin,
    staleTime: 60_000,
  });

  const { data: consumos = [], isLoading: loadingCons } = useQuery({
    queryKey: ['dashboard-consumos'],
    queryFn: () =>
      api.get('/consumption/consumption').then((r) => (Array.isArray(r.data) ? r.data : []).map(mapConsumo)),
    enabled: isAdmin,
    staleTime: 60_000,
  });

  const { data: unidades = [], isLoading: loadingUnits } = useQuery({
    queryKey: ['dashboard-unidades'],
    queryFn: () => api.get('/Unit/GetAll').then((r) => (Array.isArray(r.data) ? r.data : []).map(mapUnidade)),
    enabled: isAdmin,
    staleTime: 60_000,
  });

  const { data: tabelas = [], isLoading: loadingTab } = useQuery({
    queryKey: ['dashboard-tabelas'],
    queryFn: () => api.get('/tableTax/tax').then((r) => (Array.isArray(r.data) ? r.data : []).map(mapTabelaImposto)),
    enabled: isAdmin,
    staleTime: 60_000,
  });

  const { data: agrupCount = 0, isLoading: loadingAgr } = useQuery({
    queryKey: ['dashboard-agrupamentos-count'],
    queryFn: () => api.get('/grouping/').then((r) => normalizeApiList(r.data).length),
    enabled: isAdmin,
    staleTime: 60_000,
  });

  const { data: usersCount, isLoading: loadingUsers } = useQuery({
    queryKey: ['dashboard-users-count'],
    queryFn: () => api.get('/account/users').then((r) => normalizeApiList(r.data).length),
    enabled: isAdmin && isAdministrador,
    staleTime: 120_000,
    retry: false,
  });

  const activeCondoIds = useMemo(
    () => condominiosRaw.filter((c) => c.ativo).map((c) => c.id),
    [condominiosRaw]
  );

  const { data: leiturasMesAgg, isLoading: loadingLeiturasMes } = useQuery({
    queryKey: ['dashboard-leituras-mes', anoAtual, mesAtual] as const,
    queryFn: () =>
      api
        .get<{ totalLeituras: number; condominiosComLeitura: number }>('/mensuration/dashboard-mes', {
          params: { ano: anoAtual, mes: mesAtual },
        })
        .then((r) => r.data),
    enabled: isAdmin,
    staleTime: 2 * 60_000,
  });

  const leiturasNoMes = leiturasMesAgg?.totalLeituras ?? 0;
  const condominiosComLeituraNoMes = leiturasMesAgg?.condominiosComLeitura ?? 0;

  const condosAtivos = condominiosRaw.filter((c) => c.ativo).length;
  const condosInativos = condominiosRaw.length - condosAtivos;
  const unidadesAtivas = unidades.filter((u) => u.ativo).length;
  const ciclosAtivos = consumos.filter((c) => c.ativo).length;
  const tabelasAtivas = tabelas.filter((t) => t.ativo).length;

  const proximasLeituras = useMemo(() => {
    const rows = consumos
      .filter((c) => c.ativo && c.dataProximaLeitura)
      .map((c) => ({
        ...c,
        ts: new Date(c.dataProximaLeitura).getTime(),
      }))
      .filter((c) => !Number.isNaN(c.ts))
      .sort((a, b) => a.ts - b.ts)
      .slice(0, 8);
    return rows;
  }, [consumos]);

  const hoje = useMemo(() => new Date().setHours(0, 0, 0, 0), []);
  const atrasadas = useMemo(
    () => proximasLeituras.filter((c) => c.ts < hoje).length,
    [proximasLeituras, hoje]
  );

  const firstName = getUserDisplayName(user);

  const quickLinks = [
    { label: 'Nova leitura', to: '/leituras/criar', icon: <FileText size={20} />, admin: false },
    { label: 'Listar leituras', to: '/leituras', icon: <ClipboardList size={20} />, admin: false },
    { label: 'Importar leituras', to: '/leituras/importar', icon: <Upload size={20} />, admin: false },
    { label: 'Relatórios', to: '/leituras/relatorios', icon: <TrendingUp size={20} />, admin: false },
    { label: 'Condomínios', to: '/admin/condominios', icon: <Building2 size={20} />, admin: true },
    { label: 'Unidades', to: '/admin/unidades', icon: <Home size={20} />, admin: true },
    { label: 'Agrupamentos', to: '/admin/agrupamentos', icon: <Layers size={20} />, admin: true },
    { label: 'Ciclos de consumo', to: '/admin/consumos', icon: <BarChart2 size={20} />, admin: true },
    { label: 'Tarifas / faixas', to: '/admin/faixa-impostos', icon: <Percent size={20} />, admin: true },
    { label: 'Usuários', to: '/admin/usuarios', icon: <Users size={20} />, admin: true, onlyAdmin: true },
  ];

  const visibleLinks = quickLinks.filter(
    (l) => (!l.admin || isAdmin) && (!(l as { onlyAdmin?: boolean }).onlyAdmin || isAdministrador)
  );

  const loadingKpis =
    isAdmin && (loadingCond || loadingCons || loadingUnits || loadingTab || loadingAgr || loadingLeiturasMes);

  return (
    <div className="space-y-8 w-full min-w-0 max-w-none">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Olá, {firstName}</h1>
        <p className="text-gray-600 text-sm sm:text-base mt-2 leading-relaxed">
          Painel do <strong className="text-gray-800">Hidrus</strong> — leituras de água, ciclos de consumo, tarifas e
          condomínios. Perfil: <span className="font-medium text-primary-700">{role || '—'}</span>
        </p>
      </div>

      <section className="card">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Acesso rápido</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visibleLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-primary-300 hover:bg-primary-50/60 transition-colors text-sm font-medium text-gray-800 touch-manipulation min-h-[52px] group"
            >
              <span className="text-primary-600 shrink-0 group-hover:scale-105 transition-transform">{link.icon}</span>
              <span className="truncate">{link.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {!isAdmin && (
        <div className="card border-primary-100 bg-primary-50/40">
          <p className="text-sm text-gray-700">
            Use o menu <strong>Leituras</strong> para registrar, consultar ou importar leituras. Relatórios e demonstrativos
            também ficam nessa área.
          </p>
        </div>
      )}

      {isAdmin && (
        <>
          <section>
            <div className="flex flex-wrap items-end justify-between gap-2 mb-4">
              <h2 className="text-lg font-semibold text-gray-800">Visão geral</h2>
              <p className="text-xs text-gray-500">
                Referência: <strong className="text-gray-700">{mesLabel}</strong>
                {loadingKpis ? <span className="ml-2 text-primary-600">Atualizando…</span> : null}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              <KpiCard
                label="Condomínios ativos"
                value={loadingCond ? '…' : condosAtivos}
                hint={
                  condosInativos > 0
                    ? `${condosInativos} inativo(s) no cadastro`
                    : 'Todos os cadastrados estão ativos'
                }
                icon={<Building2 size={22} />}
                tone="blue"
              />
              <KpiCard
                label="Unidades ativas"
                value={loadingUnits ? '…' : unidadesAtivas}
                hint={
                  unidades.length > unidadesAtivas
                    ? `${unidades.length} no total (inclui inativas)`
                    : `${unidades.length} unidade(s) no total`
                }
                icon={<Home size={22} />}
                tone="emerald"
              />
              <KpiCard
                label="Agrupamentos"
                value={loadingAgr ? '…' : agrupCount}
                hint="Blocos / torres vinculados aos condomínios"
                icon={<Layers size={22} />}
                tone="slate"
              />
              <KpiCard
                label="Ciclos de consumo ativos"
                value={loadingCons ? '…' : ciclosAtivos}
                hint="Períodos de leitura com tarifa e área comum definidos"
                icon={<BarChart2 size={22} />}
                tone="violet"
              />
              <KpiCard
                label="Tabelas de imposto ativas"
                value={loadingTab ? '…' : tabelasAtivas}
                hint="Tarifas CAESB / faixas usadas nos ciclos"
                icon={<Percent size={22} />}
                tone="amber"
              />
              <KpiCard
                label="Leituras no mês"
                value={loadingLeiturasMes ? '…' : leiturasNoMes}
                hint={
                  activeCondoIds.length === 0
                    ? 'Nenhum condomínio ativo para consolidar'
                    : `Registradas em ${condominiosComLeituraNoMes} de ${activeCondoIds.length} condomínio(s) ativo(s)`
                }
                icon={<Droplets size={22} />}
                tone="rose"
              />
            </div>

            {isAdministrador && (
              <div className="mt-4">
                <KpiCard
                  label="Usuários do painel"
                  value={loadingUsers ? '…' : usersCount ?? '—'}
                  hint="Contas com acesso administrativo (só administrador vê o total)"
                  icon={<Users size={22} />}
                  tone="blue"
                />
              </div>
            )}
          </section>

          <section className="card">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <CalendarClock size={20} className="text-primary-600" />
                  Próximas datas de leitura
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Com base nos ciclos de consumo <strong>ativos</strong> (campo próxima leitura).
                </p>
              </div>
              <Link
                to="/admin/consumos"
                className="text-sm font-medium text-primary-600 hover:text-primary-800 inline-flex items-center gap-1"
              >
                Gerenciar ciclos
                <ArrowUpRight size={16} />
              </Link>
            </div>

            {atrasadas > 0 && (
              <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-sm text-amber-900">
                <AlertCircle size={18} className="shrink-0 mt-0.5" />
                <span>
                  <strong>{atrasadas}</strong> ciclo(s) com data de próxima leitura já passada — confira em{' '}
                  <Link to="/admin/consumos" className="underline font-medium">
                    Consumos
                  </Link>
                  .
                </span>
              </div>
            )}

            {loadingCons ? (
              <p className="text-sm text-gray-400">Carregando…</p>
            ) : proximasLeituras.length === 0 ? (
              <p className="text-sm text-gray-500">
                Nenhum ciclo ativo com data de próxima leitura cadastrada. Cadastre ou ative ciclos em{' '}
                <Link to="/admin/consumos" className="text-primary-600 font-medium">
                  Consumos
                </Link>
                .
              </p>
            ) : (
              <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
                {proximasLeituras.map((c) => {
                  const atraso = c.ts < hoje;
                  return (
                    <li
                      key={c.id}
                      className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 px-4 py-3 text-sm ${
                        atraso ? 'bg-amber-50/50' : 'bg-white'
                      }`}
                    >
                      <div>
                        <p className="font-medium text-gray-900">{c.condominioNome || `Condomínio #${c.condominioId}`}</p>
                        <p className="text-xs text-gray-500">
                          Ciclo {formatDatePt(c.inicio)} — {formatDatePt(c.fim)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            atraso ? 'bg-amber-200 text-amber-900' : 'bg-primary-100 text-primary-800'
                          }`}
                        >
                          Próx. leitura {formatDatePt(c.dataProximaLeitura)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
