import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler, type Me } from './api';

type AuthValue = {
  user: Me | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
};

const AuthContext = createContext<AuthValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fora do AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(!!getToken());

  const signOut = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(signOut);
    if (!getToken()) return;
    api
      .me()
      .then(setUser)
      .catch(() => signOut())
      .finally(() => setLoading(false));
  }, [signOut]);

  const signIn = async (email: string, password: string) => {
    const { accessToken, user: u } = await api.login(email, password);
    if (u.role !== 'ADMIN' && u.role !== 'OPERATOR') {
      throw new Error('Este painel é para a equipe da escola. Responsáveis usam o app KioskPay no celular.');
    }
    setToken(accessToken);
    setUser(u);
  };

  return <AuthContext.Provider value={{ user, loading, signIn, signOut }}>{children}</AuthContext.Provider>;
}
