import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  Users,
  Home,
  FileText,
  BarChart2,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';

export default function Dashboard() {
  const { user } = useAuth();
  const role = Array.isArray(user?.role) ? user!.role[0] : user?.role ?? '';
  const isAdmin = ['ADMINISTRADOR', 'COLABORADOR', 'ADMINISTRATIVO'].includes(role);

  const { data: condominios } = useQuery({
    queryKey: ['dashboard-condominios'],
    queryFn: () => api.get('/Condominium/condominium').then((r) => r.data),
    enabled: isAdmin,
  });

  const { data: unidades } = useQuery({
    queryKey: ['dashboard-unidades'],
    queryFn: () => api.get('/Unit/GetAll').then((r) => r.data),
    enabled: isAdmin,
  });

  const { data: leituras } = useQuery({
    queryKey: ['dashboard-leituras'],
    queryFn: () => api.get('/mensuration/mensuration').then((r) => r.data),
    enabled: isAdmin,
  });

  const firstName = user?.given_name || user?.unique_name || 'Usuário';

  const stats = isAdmin
    ? [
        {
          label: 'Condomínios',
          value: Array.isArray(condominios) ? condominios.length : '--',
          icon: <Building2 size={24} className="text-blue-600" />,
          bg: 'bg-blue-50',
        },
        {
          label: 'Unidades',
          value: Array.isArray(unidades) ? unidades.length : '--',
          icon: <Home size={24} className="text-green-600" />,
          bg: 'bg-green-50',
        },
        {
          label: 'Leituras',
          value: Array.isArray(leituras) ? leituras.length : '--',
          icon: <FileText size={24} className="text-purple-600" />,
          bg: 'bg-purple-50',
        },
      ]
    : [];

  const quickLinks = [
    { label: 'Nova Leitura', href: '/leituras/criar', icon: <FileText size={20} /> },
    { label: 'Importar Leituras', href: '/leituras/importar', icon: <BarChart2 size={20} /> },
    { label: 'Relatórios', href: '/leituras/relatorios', icon: <TrendingUp size={20} /> },
    ...(isAdmin
      ? [
          { label: 'Condomínios', href: '/admin/condominios', icon: <Building2 size={20} /> },
          { label: 'Unidades', href: '/admin/unidades', icon: <Home size={20} /> },
          { label: 'Usuários', href: '/admin/usuarios', icon: <Users size={20} /> },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Olá, {firstName}!</h1>
        <p className="text-gray-500 text-sm mt-1">
          Bem-vindo ao painel de controle Hidrus. Perfil: <strong>{role}</strong>
        </p>
      </div>

      {/* Stats */}
      {stats.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {stats.map((s) => (
            <div key={s.label} className="card flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl ${s.bg} flex items-center justify-center`}>
                {s.icon}
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-800">{s.value}</p>
                <p className="text-sm text-gray-500">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quick links */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-700 mb-4">Acesso Rápido</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {quickLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-primary-400 hover:bg-primary-50 transition-colors text-sm font-medium text-gray-700"
            >
              <span className="text-primary-600">{link.icon}</span>
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
