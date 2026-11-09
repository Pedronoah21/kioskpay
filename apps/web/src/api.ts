export const API_URL: string = (import.meta.env.VITE_API_URL ?? 'https://kioskpay-api.onrender.com').replace(/\/$/, '');

const TOKEN_KEY = 'kioskpay.admin.token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // navegador sem armazenamento: a sessão dura até fechar a aba
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

let onUnauthorized: (() => void) | undefined;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

/** Avisos de "servidor acordando" (o plano gratuito do Render dorme sem uso). */
type SlowListener = (slow: boolean) => void;
const slowListeners = new Set<SlowListener>();
let pending = 0;
let slowTimer: ReturnType<typeof setTimeout> | undefined;
export function onSlow(fn: SlowListener) {
  slowListeners.add(fn);
  return () => {
    slowListeners.delete(fn);
  };
}
function track(delta: number) {
  pending += delta;
  if (pending > 0 && !slowTimer) {
    slowTimer = setTimeout(() => slowListeners.forEach((l) => l(true)), 4000);
  }
  if (pending === 0) {
    clearTimeout(slowTimer);
    slowTimer = undefined;
    slowListeners.forEach((l) => l(false));
  }
}

export async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const token = getToken();
  track(1);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.body !== undefined && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError('Não foi possível falar com o servidor. Verifique a internet e tente de novo.', 0);
  } finally {
    track(-1);
  }

  const text = await res.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = undefined;
  }
  if (!res.ok) {
    // Login com senha errada também responde 401, mas não é sessão expirada
    if (res.status === 401 && token && path !== '/auth/login') onUnauthorized?.();
    if (res.status === 502 || res.status === 503) {
      throw new ApiError('O servidor está iniciando. Aguarde alguns segundos e tente de novo.', res.status);
    }
    const raw = data?.message;
    const message = Array.isArray(raw) ? raw.join('\n') : raw || 'Algo deu errado. Tente novamente.';
    throw new ApiError(message, res.status);
  }
  return data as T;
}

// ---------- Tipos ----------
export type Role = 'ADMIN' | 'OPERATOR' | 'GUARDIAN' | 'STUDENT' | 'KIOSK';

export interface Me {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface Classroom {
  id: string;
  name: string;
  grade: string;
  shift: string | null;
  _count?: { students: number };
}

export interface Student {
  id: string;
  name: string;
  enrollment: string;
  classroomId: string | null;
  classroom: Classroom | null;
  photoUrl: string | null;
  qrCode: string;
  nfcUid: string | null;
  dailyLimitCents: number | null;
  active: boolean;
  hasPin: boolean;
  pinLocked: boolean;
  wallet: { balanceCents: number } | null;
  guardians?: { id: string; name: string; email: string; phone: string | null }[];
}

export interface Category {
  id: string;
  name: string;
}

export interface Product {
  id: string;
  name: string;
  categoryId: string | null;
  category: Category | null;
  priceCents: number;
  stock: number;
  minStock: number;
  active: boolean;
}

export interface Staff {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
}

export interface LedgerEntry {
  id: string;
  type: 'CREDIT' | 'DEBIT' | 'REFUND' | 'REVERSAL' | 'ADJUSTMENT';
  amountCents: number;
  reason: string | null;
  createdAt: string;
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: { line: number; message: string }[];
}

export interface CheckoutStudent {
  id: string;
  name: string;
  enrollment: string;
  photoUrl: string | null;
  classroom: string | null;
  balanceCents: number;
  active: boolean;
  dailyLimitCents: number | null;
  spentTodayCents: number;
  blockedProductIds: string[];
  blockedCategoryIds: string[];
}

export interface SaleResult {
  id: string;
  totalCents: number;
  balanceAfterCents: number;
}

export interface DaySales {
  date: string;
  count: number;
  totalCents: number;
  sales: {
    id: string;
    createdAt: string;
    status: 'COMPLETED' | 'REFUNDED';
    totalCents: number;
    channel: 'COUNTER' | 'KIOSK';
    orderNumber: number | null;
    orderStatus: 'PENDING' | 'READY' | 'DELIVERED' | null;
    student: { id: string; name: string };
    operator: string;
    items: { name: string; quantity: number; unitPriceCents: number }[];
  }[];
}

export interface QueueOrder {
  id: string;
  orderNumber: number;
  orderStatus: 'PENDING' | 'READY';
  createdAt: string;
  readyAt: string | null;
  totalCents: number;
  student: string;
  classroom: string | null;
  items: { name: string; quantity: number }[];
}

// ---------- Chamadas ----------
const q = (params: Record<string, string | number | undefined>) => {
  const s = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v !== undefined && v !== '' && s.set(k, String(v)));
  const str = s.toString();
  return str ? `?${str}` : '';
};

export const api = {
  login: (email: string, password: string) =>
    request<{ accessToken: string; user: Me }>('/auth/login', { method: 'POST', body: { email, password } }),
  me: () => request<Me>('/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    request('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } }),

  students: (p: { search?: string; classroomId?: string; skip?: number; take?: number }) =>
    request<{ total: number; items: Student[] }>(`/students${q(p)}`),
  student: (id: string) => request<Student>(`/students/${id}`),
  createStudent: (body: object) => request<Student>('/students', { method: 'POST', body }),
  updateStudent: (id: string, body: object) => request<Student>(`/students/${id}`, { method: 'PATCH', body }),
  regenerateCode: (id: string) =>
    request<{ qrCode: string }>(`/students/${id}/regenerate-code`, { method: 'POST' }),
  importStudents: (csv: string) => request<ImportResult>('/students/import', { method: 'POST', body: { csv } }),
  linkGuardian: (id: string, email: string) =>
    request(`/students/${id}/guardians`, { method: 'POST', body: { email } }),
  unlinkGuardian: (id: string, guardianId: string) =>
    request(`/students/${id}/guardians/${guardianId}`, { method: 'DELETE' }),
  setDailyLimit: (id: string, dailyLimitCents: number | null) =>
    request(`/students/${id}/controls/daily-limit`, { method: 'PUT', body: { dailyLimitCents } }),
  statement: (id: string) => request<LedgerEntry[]>(`/students/${id}/wallet/statement`),
  manualRecharge: (studentId: string, amountCents: number, method: 'CASH' | 'POS') =>
    request('/recharges/manual', { method: 'POST', body: { studentId, amountCents, method } }),

  classrooms: () => request<Classroom[]>('/classrooms'),
  createClassroom: (body: { name: string; grade: string; shift?: string }) =>
    request<Classroom>('/classrooms', { method: 'POST', body }),
  updateClassroom: (id: string, body: { name: string; grade: string; shift?: string }) =>
    request<Classroom>(`/classrooms/${id}`, { method: 'PATCH', body }),

  categories: () => request<Category[]>('/categories'),
  createCategory: (name: string) => request<Category>('/categories', { method: 'POST', body: { name } }),
  products: () => request<Product[]>('/products'),
  createProduct: (body: object) => request<Product>('/products', { method: 'POST', body }),
  updateProduct: (id: string, body: object) => request<Product>(`/products/${id}`, { method: 'PATCH', body }),
  adjustStock: (id: string, delta: number) =>
    request<{ stock: number }>(`/products/${id}/stock`, { method: 'POST', body: { delta } }),
  deactivateProduct: (id: string) => request(`/products/${id}`, { method: 'DELETE' }),

  identify: (code: string) => request<CheckoutStudent>(`/sales/identify/${encodeURIComponent(code)}`),
  checkout: (studentId: string) => request<CheckoutStudent>(`/sales/checkout/${studentId}`),
  sell: (body: { studentId: string; items: { productId: string; quantity: number }[]; offlineUuid: string }) =>
    request<SaleResult>('/sales', { method: 'POST', body }),
  salesOfDay: (date?: string) => request<DaySales>(`/sales${q({ date })}`),
  refundSale: (id: string, reason: string) => request(`/sales/${id}/refund`, { method: 'POST', body: { reason } }),

  setPin: (id: string, pin: string) => request(`/students/${id}/controls/pin`, { method: 'PUT', body: { pin } }),
  removePin: (id: string) => request(`/students/${id}/controls/pin`, { method: 'DELETE' }),

  kioskCard: (code: string) =>
    request<{ firstName: string; hasPin: boolean; lockedMinutes: number }>('/kiosk/card', {
      method: 'POST',
      body: { code },
    }),
  kioskLogin: (code: string, pin: string) =>
    request<{ session: string; student: CheckoutStudent }>('/kiosk/login', { method: 'POST', body: { code, pin } }),
  kioskOrder: (session: string, items: { productId: string; quantity: number }[], key: string) =>
    request<{ orderNumber: number; totalCents: number; balanceAfterCents: number }>('/kiosk/order', {
      method: 'POST',
      body: { items, key },
      headers: { 'X-Kiosk-Session': session },
    }),
  orders: () => request<QueueOrder[]>('/orders'),
  setOrderStatus: (id: string, status: 'READY' | 'DELIVERED') =>
    request(`/orders/${id}`, { method: 'PATCH', body: { status } }),

  staff: () => request<Staff[]>('/auth/staff'),
  createStaff: (body: { name: string; email: string; password: string; role: 'ADMIN' | 'OPERATOR' | 'KIOSK' }) =>
    request<Staff>('/auth/staff', { method: 'POST', body }),
  setStaffActive: (id: string, active: boolean) =>
    request(`/auth/staff/${id}`, { method: 'PATCH', body: { active } }),
};
