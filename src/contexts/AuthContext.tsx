import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { JwtPayload, getUser, logout as doLogout } from '../lib/auth';

interface AuthContextValue {
  user: JwtPayload | null;
  setToken: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<JwtPayload | null>(getUser);

  const setToken = useCallback((token: string) => {
    localStorage.setItem('user_token', token);
    setUser(getUser());
  }, []);

  const logout = useCallback(() => {
    doLogout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, setToken, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
