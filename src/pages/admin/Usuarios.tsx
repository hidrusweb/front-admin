import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { mapCondominio } from '../../lib/hidrusApi';

/**
 * CRUD de usuários administrativos ainda não foi portado do .NET (users/paged, create, edit, delete).
 * Esta página mantém apenas o carregamento de condomínios para quando a API for implementada.
 */
export default function Usuarios() {
  const { data: condominios = [], isLoading } = useQuery({
    queryKey: ['condominios'],
    queryFn: () =>
      api.get('/Condominium/condominium').then((r) => (Array.isArray(r.data) ? r.data : []).map(mapCondominio)),
  });

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-gray-800">Usuários</h1>
      <div className="card border-amber-200 bg-amber-50 text-amber-900 text-sm space-y-2">
        <p className="font-semibold">Funcionalidade em migração</p>
        <p>
          O painel antigo (.NET) usava rotas como <code className="text-xs bg-white/60 px-1 rounded">/api/account/users/paged</code>,{' '}
          <code className="text-xs bg-white/60 px-1 rounded">create</code>, <code className="text-xs bg-white/60 px-1 rounded">edit</code> e{' '}
          <code className="text-xs bg-white/60 px-1 rounded">delete</code>. Ainda não há equivalente na API Laravel.
        </p>
        <p>Condomínios carregados para referência: {isLoading ? '…' : condominios.length}</p>
      </div>
    </div>
  );
}
