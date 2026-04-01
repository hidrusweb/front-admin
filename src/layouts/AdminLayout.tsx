import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  Users,
  Layers,
  BarChart2,
  Home,
  FileText,
  PlusCircle,
  Upload,
  TrendingUp,
  Percent,
  LogOut,
  Menu,
  X,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';

interface NavItem {
  label: string;
  to?: string;
  icon: React.ReactNode;
  roles?: string[];
  children?: NavItem[];
}

const navItems: NavItem[] = [
  { label: 'Dashboard', to: '/', icon: <LayoutDashboard size={18} /> },
  {
    label: 'Administração',
    icon: <Building2 size={18} />,
    roles: ['ADMINISTRADOR', 'COLABORADOR', 'ADMINISTRATIVO'],
    children: [
      { label: 'Condomínios', to: '/admin/condominios', icon: <Building2 size={16} /> },
      { label: 'Usuários', to: '/admin/usuarios', icon: <Users size={16} />, roles: ['ADMINISTRADOR'] },
      { label: 'Agrupamentos', to: '/admin/agrupamentos', icon: <Layers size={16} /> },
      { label: 'Consumos', to: '/admin/consumos', icon: <BarChart2 size={16} /> },
      { label: 'Unidades', to: '/admin/unidades', icon: <Home size={16} /> },
      { label: 'Faixa / Impostos', to: '/admin/faixa-impostos', icon: <Percent size={16} /> },
    ],
  },
  {
    label: 'Leituras',
    icon: <FileText size={18} />,
    children: [
      { label: 'Listar Leituras', to: '/leituras', icon: <FileText size={16} /> },
      { label: 'Criar Leitura', to: '/leituras/criar', icon: <PlusCircle size={16} /> },
      { label: 'Importar', to: '/leituras/importar', icon: <Upload size={16} /> },
      { label: 'Relatórios', to: '/leituras/relatorios', icon: <TrendingUp size={16} /> },
    ],
  },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [openGroups, setOpenGroups] = useState<string[]>(['Administração', 'Leituras']);

  const userRole = user
    ? Array.isArray(user.role)
      ? user.role[0]
      : user.role
    : '';

  const handleLogout = async () => {
    try { await api.post('/account/logout'); } catch { /* ignore */ }
    logout();
    navigate('/login');
  };

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) =>
      prev.includes(label) ? prev.filter((g) => g !== label) : [...prev, label]
    );
  };

  const canSeeItem = (item: NavItem) =>
    !item.roles || item.roles.includes(userRole);

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'w-64' : 'w-0 overflow-hidden'
        } transition-all duration-300 bg-gray-900 text-gray-100 flex flex-col shrink-0`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-5 border-b border-gray-700">
          <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center mr-3">
            <span className="font-bold text-white text-sm">H</span>
          </div>
          <span className="font-bold text-lg">Hidrus</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          {navItems.filter(canSeeItem).map((item) => {
            if (item.to) {
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-lg mb-1 text-sm transition-colors ${
                      isActive
                        ? 'bg-primary-600 text-white'
                        : 'text-gray-300 hover:bg-gray-800'
                    }`
                  }
                >
                  {item.icon}
                  {item.label}
                </NavLink>
              );
            }

            // Group with children
            const isOpen = openGroups.includes(item.label);
            const visibleChildren = (item.children ?? []).filter(canSeeItem);
            if (visibleChildren.length === 0) return null;

            return (
              <div key={item.label} className="mb-1">
                <button
                  onClick={() => toggleGroup(item.label)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 transition-colors"
                >
                  {item.icon}
                  <span className="flex-1 text-left">{item.label}</span>
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                {isOpen && (
                  <div className="ml-3 mt-1 space-y-0.5">
                    {visibleChildren.map((child) => (
                      <NavLink
                        key={child.to}
                        to={child.to!}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                            isActive
                              ? 'bg-primary-600 text-white'
                              : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                          }`
                        }
                      >
                        {child.icon}
                        {child.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* User info */}
        <div className="border-t border-gray-700 p-4">
          <div className="text-xs text-gray-400 truncate mb-1">
            {user?.given_name || user?.unique_name}
          </div>
          <div className="text-xs text-primary-400 mb-3">{userRole}</div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            <LogOut size={15} />
            Sair
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center px-4 gap-4 shrink-0">
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            className="p-2 rounded-lg hover:bg-gray-100"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <h2 className="font-semibold text-gray-700">Painel Administrativo</h2>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
