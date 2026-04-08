import { useEffect, useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
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
  Wrench,
  ImagePlus,
  LogOut,
  Menu,
  X,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getUserDisplayName } from '../lib/auth';
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
    label: 'Ferramentas',
    icon: <Wrench size={18} />,
    roles: ['ADMINISTRADOR', 'COLABORADOR', 'ADMINISTRATIVO'],
    children: [
      {
        label: 'Imagens nas leituras',
        to: '/admin/ferramentas/importar-imagens-leituras',
        icon: <ImagePlus size={16} />,
      },
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

function isLgViewport() {
  return typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;
}

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(() => isLgViewport());
  const [openGroups, setOpenGroups] = useState<string[]>(['Administração', 'Leituras', 'Ferramentas']);

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

  const closeSidebarMobile = () => {
    if (!isLgViewport()) setSidebarOpen(false);
  };

  useEffect(() => {
    if (!isLgViewport()) setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const syncBodyScroll = () => {
      const mobile = !isLgViewport();
      document.body.style.overflow = mobile && sidebarOpen ? 'hidden' : '';
    };
    syncBodyScroll();
    const mq = window.matchMedia('(min-width: 1024px)');
    mq.addEventListener('change', syncBodyScroll);
    return () => {
      mq.removeEventListener('change', syncBodyScroll);
      document.body.style.overflow = '';
    };
  }, [sidebarOpen]);

  return (
    <div className="admin-layout-shell flex h-[100dvh] min-h-0 bg-gray-100 overflow-hidden">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Fechar menu"
          className="print:hidden fixed inset-0 z-30 bg-black/45 backdrop-blur-[1px] lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar: drawer no mobile, coluna no desktop */}
      <aside
        id="admin-sidebar"
        className={`admin-layout-sidebar print:hidden flex flex-col shrink-0 bg-gray-900 text-gray-100 transition-[transform,width] duration-300 ease-out
          fixed z-40 inset-y-0 left-0 w-64 max-w-[min(16rem,88vw)]
          lg:static lg:z-auto lg:max-w-none
          ${sidebarOpen ? 'translate-x-0 lg:w-64' : '-translate-x-full lg:translate-x-0 lg:w-0 lg:min-w-0 lg:overflow-hidden'}`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-5 border-b border-gray-700 gap-3">
          <img
            src="/images/logo-hydrus-only-image.png"
            alt=""
            className="h-9 w-9 shrink-0 object-contain"
          />
          <span className="font-bold text-lg tracking-tight">HIDRUS</span>
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
                  onClick={closeSidebarMobile}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 text-sm transition-colors touch-manipulation ${
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
                  type="button"
                  onClick={() => toggleGroup(item.label)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-300 hover:bg-gray-800 transition-colors touch-manipulation"
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
                        onClick={closeSidebarMobile}
                        end={
                          Boolean(
                            child.to &&
                              visibleChildren.some(
                                (c) =>
                                  c.to &&
                                  c.to !== child.to &&
                                  c.to.startsWith(`${child.to}/`)
                              )
                          )
                        }
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors touch-manipulation ${
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
            {getUserDisplayName(user)}
          </div>
          <div className="text-xs text-primary-400 mb-3">{userRole}</div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors touch-manipulation py-1"
          >
            <LogOut size={15} />
            Sair
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="admin-layout-maincol flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="admin-layout-topbar h-14 sm:h-16 bg-white border-b border-gray-200 flex items-center gap-2 sm:gap-4 px-3 sm:px-4 shrink-0 min-w-0 print:hidden">
          <button
            type="button"
            onClick={() => setSidebarOpen((o) => !o)}
            className="p-2.5 rounded-lg hover:bg-gray-100 touch-manipulation shrink-0"
            aria-expanded={sidebarOpen}
            aria-controls="admin-sidebar"
          >
            {sidebarOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
          <h2 className="font-semibold text-gray-700 text-sm sm:text-base truncate min-w-0">Painel Administrativo</h2>
        </header>

        {/* Page content */}
        <main className="admin-layout-main flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 lg:p-6 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
