import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { ColumnDef } from '@tanstack/react-table';
import { PlusCircle, Pencil, ToggleLeft, ToggleRight } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import { useAuth } from '../../contexts/AuthContext';

interface AdminUserRow {
  id: string;
  email: string;
  userName: string;
  nome: string | null;
  sobrenome: string | null;
  status: boolean;
  role: string;
}

interface RoleOption {
  Id: string;
  Name: string;
}

function mapUser(raw: Record<string, unknown>): AdminUserRow {
  return {
    id: String(raw.id ?? raw.Id ?? ''),
    email: String(raw.email ?? raw.Email ?? ''),
    userName: String(raw.userName ?? raw.UserName ?? ''),
    nome: (raw.nome ?? raw.Nome ?? null) as string | null,
    sobrenome: (raw.sobrenome ?? raw.Sobrenome ?? null) as string | null,
    status: Boolean(raw.status ?? raw.Status ?? false),
    role: String(raw.role ?? raw.Role ?? ''),
  };
}

export default function Usuarios() {
  const qc = useQueryClient();
  const { user: authUser } = useAuth();
  const authSub = authUser?.sub ?? '';

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUserRow | null>(null);

  const formSchema = z.object({
    email: z.string().email('E-mail inválido'),
    nome: z.string().optional(),
    sobrenome: z.string().optional(),
    role: z.string().min(1, 'Selecione o perfil'),
    status: z.boolean(),
    senha: z
      .string()
      .optional()
      .refine((s) => !s || s.length >= 6, 'Mínimo 6 caracteres'),
  });

  type UserFormValues = z.infer<typeof formSchema>;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UserFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      nome: '',
      sobrenome: '',
      role: '',
      status: true,
      senha: '',
    },
  });

  const { data: roles = [], isLoading: loadingRoles } = useQuery<RoleOption[]>({
    queryKey: ['admin-users-roles'],
    queryFn: () => api.get('/account/users/roles').then((r) => (Array.isArray(r.data) ? r.data : [])),
  });

  const { data: users = [], isLoading } = useQuery<AdminUserRow[]>({
    queryKey: ['admin-users'],
    queryFn: () =>
      api.get('/account/users').then((r) => (Array.isArray(r.data) ? r.data : []).map((x) => mapUser(x as Record<string, unknown>))),
  });

  const openCreate = () => {
    setEditing(null);
    reset({
      email: '',
      nome: '',
      sobrenome: '',
      role: roles[0]?.Name ?? '',
      status: true,
      senha: '',
    });
    setModalOpen(true);
  };

  const openEdit = (u: AdminUserRow) => {
    setEditing(u);
    reset({
      email: u.email,
      nome: u.nome ?? '',
      sobrenome: u.sobrenome ?? '',
      role: u.role,
      status: u.status,
      senha: '',
    });
    setModalOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async (data: UserFormValues) => {
      const base = {
        email: data.email.trim(),
        nome: data.nome?.trim() || '',
        sobrenome: data.sobrenome?.trim() || '',
        role: data.role,
      };
      if (!editing) {
        await api.post('/account/users', { ...base, senha: data.senha });
        return;
      }
      const body: Record<string, unknown> = {
        ...base,
        status: data.status,
      };
      if (data.senha && data.senha.length >= 6) {
        body.senha = data.senha;
      }
      await api.put(`/account/users/${editing.id}`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success(editing ? 'Usuário atualizado!' : 'Usuário criado!');
      setModalOpen(false);
    },
    onError: (err: unknown) => {
      const ax = err as { response?: { data?: { message?: string } } };
      toast.error(ax.response?.data?.message || 'Erro ao salvar usuário');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (u: AdminUserRow) => {
      const body = {
        email: u.email,
        nome: u.nome ?? '',
        sobrenome: u.sobrenome ?? '',
        role: u.role,
        status: !u.status,
      };
      return api.put(`/account/users/${u.id}`, body);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
    onError: (err: unknown) => {
      const ax = err as { response?: { data?: { message?: string } } };
      toast.error(ax.response?.data?.message || 'Erro ao alterar status');
    },
  });

  const columns: ColumnDef<AdminUserRow>[] = [
    {
      accessorKey: 'email',
      header: 'E-mail',
    },
    {
      id: 'nome',
      header: 'Nome',
      cell: ({ row }) => {
        const n = [row.original.nome, row.original.sobrenome].filter(Boolean).join(' ');
        return <span>{n || '—'}</span>;
      },
    },
    { accessorKey: 'role', header: 'Perfil' },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <span className={row.original.status ? 'badge-active' : 'badge-inactive'}>
          {row.original.status ? 'Ativo' : 'Inativo'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Ações',
      cell: ({ row }) => {
        const self = row.original.id === authSub;
        return (
          <div className="flex gap-2">
            <button type="button" onClick={() => openEdit(row.original)} className="btn-secondary py-1 px-2 text-xs">
              <Pencil size={14} />
            </button>
            <button
              type="button"
              disabled={self}
              title={self ? 'Não é possível desativar a própria conta pelo toggle' : undefined}
              onClick={() => toggleMutation.mutate(row.original)}
              className={`btn py-1 px-2 text-xs ${row.original.status ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-green-100 text-green-700 hover:bg-green-200'} disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {row.original.status ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">Usuários</h1>
        <button type="button" onClick={openCreate} className="btn-primary" disabled={loadingRoles}>
          <PlusCircle size={16} />
          Novo usuário
        </button>
      </div>

      <p className="text-sm text-gray-600">
        Perfis administrativos (administrador, colaborador e administrativo). Condôminos não aparecem nesta lista.
      </p>

      <div className="card">
        {isLoading ? (
          <p className="text-gray-400 text-sm">Carregando...</p>
        ) : (
          <DataTable data={users} columns={columns} searchPlaceholder="Buscar por e-mail ou nome..." />
        )}
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar usuário' : 'Novo usuário'}
        size="md"
      >
        <form
          onSubmit={handleSubmit((d) => {
            if (!editing && (!d.senha || d.senha.length < 6)) {
              toast.error('Senha obrigatória (mín. 6 caracteres)');
              return;
            }
            saveMutation.mutate(d);
          })}
          className="space-y-4"
        >
          <div>
            <label className="label">E-mail *</label>
            <input type="email" autoComplete="off" className="input" {...register('email')} />
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Nome</label>
              <input className="input" {...register('nome')} />
            </div>
            <div>
              <label className="label">Sobrenome</label>
              <input className="input" {...register('sobrenome')} />
            </div>
          </div>
          <div>
            <label className="label">Perfil *</label>
            <select className="input" {...register('role')} disabled={Boolean(editing && editing.id === authSub)}>
              {roles.map((r) => (
                <option key={r.Id} value={r.Name}>
                  {r.Name}
                </option>
              ))}
            </select>
            {errors.role && <p className="text-red-500 text-xs mt-1">{errors.role.message}</p>}
          </div>
          {editing && (
            <div className="flex items-center gap-2">
              <input type="checkbox" id="u-status" {...register('status')} className="w-4 h-4" disabled={editing.id === authSub} />
              <label htmlFor="u-status" className="text-sm text-gray-700">
                Conta ativa
                {editing.id === authSub ? <span className="text-amber-600"> (sua conta permanece ativa)</span> : null}
              </label>
            </div>
          )}
          <div>
            <label className="label">{editing ? 'Nova senha (opcional)' : 'Senha *'}</label>
            <input type="password" autoComplete="new-password" className="input" {...register('senha')} />
            {errors.senha && <p className="text-red-500 text-xs mt-1">{errors.senha.message}</p>}
            {editing && <p className="text-xs text-gray-500 mt-1">Deixe em branco para manter a senha atual.</p>}
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={isSubmitting || saveMutation.isPending} className="btn-primary">
              {isSubmitting || saveMutation.isPending ? 'Salvando...' : 'Salvar'}
            </button>
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">
              Cancelar
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
