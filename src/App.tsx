import { Routes, Route, Navigate } from 'react-router-dom';
import PrivateRoute from './components/PrivateRoute';
import { useAuth } from './contexts/AuthContext';
import { CONDOMINIO_REPORT_ROLES, getUserRole, isCondominioReportRole, STAFF_ROLES } from './lib/auth';
import AdminLayout from './layouts/AdminLayout';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

import Condominios from './pages/admin/Condominios';
import Usuarios from './pages/admin/Usuarios';
import Agrupamentos from './pages/admin/Agrupamentos';
import Consumos from './pages/admin/Consumos';
import Unidades from './pages/admin/Unidades';
import TabelasImposto from './pages/admin/TabelasImposto';
import ImportarImagensLeituras from './pages/admin/ferramentas/ImportarImagensLeituras';

import LeiturasIndex from './pages/leituras/Index';
import LeiturasCreate from './pages/leituras/Criar';
import LeiturasImport from './pages/leituras/Importar';
import Relatorios from './pages/leituras/Relatorios';

const ADMIN_ROLES = STAFF_ROLES;
const RELATORIO_ROLES = [...STAFF_ROLES, ...CONDOMINIO_REPORT_ROLES];

/** Administração do condomínio e síndico entram direto em Relatórios; a equipe vê o Dashboard. */
function Home() {
  const { user } = useAuth();
  const role = getUserRole(user);
  if (isCondominioReportRole(role)) return <Navigate to="/leituras/relatorios" replace />;
  if (ADMIN_ROLES.includes(role)) return <Dashboard />;
  return (
    <div className="card p-6 text-sm text-gray-600">
      Seu perfil não tem acesso ao painel administrativo.
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/"
        element={
          <PrivateRoute>
            <AdminLayout />
          </PrivateRoute>
        }
      >
        <Route index element={<Home />} />

        {/* Administração */}
        <Route
          path="admin/condominios"
          element={
            <PrivateRoute roles={ADMIN_ROLES}>
              <Condominios />
            </PrivateRoute>
          }
        />
        <Route
          path="admin/usuarios"
          element={
            <PrivateRoute roles={['ADMINISTRADOR']}>
              <Usuarios />
            </PrivateRoute>
          }
        />
        <Route
          path="admin/agrupamentos"
          element={
            <PrivateRoute roles={ADMIN_ROLES}>
              <Agrupamentos />
            </PrivateRoute>
          }
        />
        <Route
          path="admin/consumos"
          element={
            <PrivateRoute roles={ADMIN_ROLES}>
              <Consumos />
            </PrivateRoute>
          }
        />
        <Route
          path="admin/unidades"
          element={
            <PrivateRoute roles={ADMIN_ROLES}>
              <Unidades />
            </PrivateRoute>
          }
        />
        <Route
          path="admin/tabelas-imposto"
          element={
            <PrivateRoute roles={ADMIN_ROLES}>
              <TabelasImposto />
            </PrivateRoute>
          }
        />
        <Route
          path="admin/faixa-impostos"
          element={<Navigate to="/admin/tabelas-imposto" replace />}
        />
        <Route
          path="admin/ferramentas/importar-imagens-leituras"
          element={
            <PrivateRoute roles={ADMIN_ROLES}>
              <ImportarImagensLeituras />
            </PrivateRoute>
          }
        />

        {/* Leituras */}
        <Route
          path="leituras"
          element={
            <PrivateRoute roles={ADMIN_ROLES}>
              <LeiturasIndex />
            </PrivateRoute>
          }
        />
        <Route
          path="leituras/criar"
          element={
            <PrivateRoute roles={ADMIN_ROLES}>
              <LeiturasCreate />
            </PrivateRoute>
          }
        />
        <Route
          path="leituras/importar"
          element={
            <PrivateRoute roles={ADMIN_ROLES}>
              <LeiturasImport />
            </PrivateRoute>
          }
        />
        <Route
          path="leituras/relatorios"
          element={
            <PrivateRoute roles={RELATORIO_ROLES}>
              <Relatorios />
            </PrivateRoute>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
