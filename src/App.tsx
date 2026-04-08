import { Routes, Route, Navigate } from 'react-router-dom';
import PrivateRoute from './components/PrivateRoute';
import AdminLayout from './layouts/AdminLayout';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

import Condominios from './pages/admin/Condominios';
import Usuarios from './pages/admin/Usuarios';
import Agrupamentos from './pages/admin/Agrupamentos';
import Consumos from './pages/admin/Consumos';
import Unidades from './pages/admin/Unidades';
import FaixaImpostos from './pages/admin/FaixaImpostos';
import ImportarImagensLeituras from './pages/admin/ferramentas/ImportarImagensLeituras';

import LeiturasIndex from './pages/leituras/Index';
import LeiturasCreate from './pages/leituras/Criar';
import LeiturasImport from './pages/leituras/Importar';
import Relatorios from './pages/leituras/Relatorios';

const ADMIN_ROLES = ['ADMINISTRADOR', 'COLABORADOR', 'ADMINISTRATIVO'];

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
        <Route index element={<Dashboard />} />

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
          path="admin/faixa-impostos"
          element={
            <PrivateRoute roles={ADMIN_ROLES}>
              <FaixaImpostos />
            </PrivateRoute>
          }
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
        <Route path="leituras" element={<LeiturasIndex />} />
        <Route path="leituras/criar" element={<LeiturasCreate />} />
        <Route path="leituras/importar" element={<LeiturasImport />} />
        <Route path="leituras/relatorios" element={<Relatorios />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
