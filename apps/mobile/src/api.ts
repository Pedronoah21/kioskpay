import { API_URL } from './config';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// ---------- Tipos devolvidos pela API ----------
export interface Child {
  id: string;
  name: string;
  classroom?: string;
  photoUrl: string | null;
  balanceCents: number;
  dailyLimitCents: number | null;
}

export interface Me {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'OPERATOR' | 'GUARDIAN' | 'STUDENT';
  children: Child[];
}

export interface LedgerEntry {
  id: string;
  type: 'CREDIT' | 'DEBIT' | 'REFUND' | 'REVERSAL' | 'ADJUSTMENT';
  amountCents: number;
  reason: string | null;
  createdAt: string;
}

export interface Recharge {
  id: string;
  studentId: string;
  amountCents: number;
  status: 'PENDING' | 'PAID' | 'CANCELED' | 'REFUNDED';
  pixQrCode: string | null;
  pixQrCodeBase64: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
}

export interface Product {
  id: string;
  name: string;
  priceCents: number;
  categoryId: string | null;
  category: Category | null;
}

export interface Controls {
  studentId: string;
  name: string;
  dailyLimitCents: number | null;
  hasPin: boolean;
  pinLocked: boolean;
  restrictions: { id: string; type: 'product' | 'category'; targetId: string; name: string }[];
}

// ---------- Cliente ----------
type Options = { method?: string; body?: unknown; token?: string | null };

let onUnauthorized: (() => void) | undefined;
/** Chamado quando o token expira, para a sessão voltar ao login. */
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export async function request<T>(path: string, { method = 'GET', body, token }: Options = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Sem conexão com o servidor. Verifique sua internet.', 0);
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized?.();
    const raw = data?.message;
    const message = Array.isArray(raw) ? raw.join('\n') : raw || 'Algo deu errado. Tente novamente.';
    throw new ApiError(message, res.status);
  }
  return data as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ accessToken: string }>('/auth/login', { method: 'POST', body: { email, password } }),

  register: (body: { name: string; email: string; password: string; document: string; phone?: string }) =>
    request<{ accessToken: string }>('/auth/register', { method: 'POST', body }),

  me: (token: string) => request<Me>('/auth/me', { token }),

  statement: (token: string, studentId: string) =>
    request<LedgerEntry[]>(`/students/${studentId}/wallet/statement`, { token }),

  balance: (token: string, studentId: string) =>
    request<{ balanceCents: number }>(`/students/${studentId}/wallet`, { token }),

  createPix: (token: string, studentId: string, amountCents: number) =>
    request<Recharge>('/recharges/pix', { method: 'POST', token, body: { studentId, amountCents } }),

  myRecharges: (token: string) => request<Recharge[]>('/recharges/mine', { token }),

  controls: (token: string, studentId: string) => request<Controls>(`/students/${studentId}/controls`, { token }),

  setDailyLimit: (token: string, studentId: string, dailyLimitCents: number | null) =>
    request(`/students/${studentId}/controls/daily-limit`, { method: 'PUT', token, body: { dailyLimitCents } }),

  block: (token: string, studentId: string, target: { productId?: string; categoryId?: string }) =>
    request(`/students/${studentId}/controls/restrictions`, { method: 'POST', token, body: target }),

  unblock: (token: string, studentId: string, restrictionId: string) =>
    request(`/students/${studentId}/controls/restrictions/${restrictionId}`, { method: 'DELETE', token }),

  setPin: (token: string, studentId: string, pin: string) =>
    request(`/students/${studentId}/controls/pin`, { method: 'PUT', token, body: { pin } }),

  products: (token: string) => request<Product[]>('/products', { token }),
  categories: (token: string) => request<Category[]>('/categories', { token }),
};
