import { createContext, use, useEffect, type PropsWithChildren } from 'react';
import { api, setUnauthorizedHandler } from './api';
import { useStorageState } from './useStorageState';

type SessionContextValue = {
  /** Token JWT da API, ou null se não estiver logado. */
  token: string | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (data: { name: string; email: string; password: string; document: string; phone?: string }) => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession() {
  const ctx = use(SessionContext);
  if (!ctx) throw new Error('useSession deve ser usado dentro de <SessionProvider />');
  return ctx;
}

/** Atalho para telas protegidas: o token sempre existe ali. */
export function useToken(): string {
  const { token } = useSession();
  if (!token) throw new Error('Tela protegida acessada sem login');
  return token;
}

export function SessionProvider({ children }: PropsWithChildren) {
  const { value: token, isLoading, update } = useStorageState('kioskpay.token');

  // Token vencido em qualquer chamada → volta para o login
  useEffect(() => {
    setUnauthorizedHandler(() => update(null));
  }, [update]);

  const value: SessionContextValue = {
    token,
    isLoading,
    signIn: async (email, password) => {
      const { accessToken } = await api.login(email, password);
      await update(accessToken);
    },
    signUp: async (data) => {
      const { accessToken } = await api.register(data);
      await update(accessToken);
    },
    signOut: () => update(null),
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
