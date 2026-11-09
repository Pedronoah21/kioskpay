import { afterFailure, PIN_LOCK_MINUTES, pinProblem } from './pin';

describe('pinProblem', () => {
  it('aceita senhas comuns de 4 dígitos', () => {
    expect(pinProblem('2580')).toBeNull();
    expect(pinProblem('0915')).toBeNull();
    expect(pinProblem('1235')).toBeNull();
  });

  it('recusa formato errado, repetidas e sequências', () => {
    expect(pinProblem('123')).toContain('4 números');
    expect(pinProblem('12a4')).toContain('4 números');
    expect(pinProblem('7777')).toContain('iguais');
    expect(pinProblem('3456')).toContain('sequências');
    expect(pinProblem('9876')).toContain('sequências');
  });
});

describe('afterFailure', () => {
  it('conta tentativas e bloqueia na quinta', () => {
    expect(afterFailure(0)).toMatchObject({ pinFailures: 1, locked: false, remaining: 4 });
    expect(afterFailure(3)).toMatchObject({ pinFailures: 4, locked: false, remaining: 1 });
    const now = new Date('2026-11-09T12:00:00Z');
    const r = afterFailure(4, now);
    expect(r.locked).toBe(true);
    expect(r.pinFailures).toBe(0);
    expect(r.pinLockedUntil!.getTime() - now.getTime()).toBe(PIN_LOCK_MINUTES * 60_000);
  });
});
