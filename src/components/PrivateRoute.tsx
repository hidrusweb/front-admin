import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  children: React.ReactNode;
  roles?: string[];
}

export default function PrivateRoute({ children, roles }: Props) {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;

  if (roles && roles.length > 0) {
    const userRole = Array.isArray(user.role) ? user.role[0] : user.role;
    if (!roles.includes(userRole)) return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
