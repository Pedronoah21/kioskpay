/** Regras da senha de 4 dígitos do totem. */

export const PIN_MAX_FAILURES = 5;
export const PIN_LOCK_MINUTES = 15;

/** Devolve o motivo se a senha for fraca/ inválida, ou null se estiver ok. */
export function pinProblem(pin: string): string | null {
  if (!/^\d{4}$/.test(pin)) return 'A senha deve ter exatamente 4 números.';
  if (/^(\d)\1{3}$/.test(pin)) return 'Não use 4 números iguais (ex.: 1111).';
  const d = pin.split('').map(Number);
  const up = d.every((n, i) => i === 0 || n === d[i - 1] + 1);
  const down = d.every((n, i) => i === 0 || n === d[i - 1] - 1);
  if (up || down) return 'Não use sequências (ex.: 1234 ou 4321).';
  return null;
}

/** Depois de um erro: quantas falhas e até quando fica bloqueado. */
export function afterFailure(failures: number, now = new Date()) {
  const next = failures + 1;
  if (next >= PIN_MAX_FAILURES) {
    return { pinFailures: 0, pinLockedUntil: new Date(now.getTime() + PIN_LOCK_MINUTES * 60_000), locked: true };
  }
  return { pinFailures: next, pinLockedUntil: null, locked: false, remaining: PIN_MAX_FAILURES - next };
}
