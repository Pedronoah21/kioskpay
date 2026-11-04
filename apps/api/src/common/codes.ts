import { randomInt } from 'crypto';

// Sem 0/O, 1/I/L: evita confusão se alguém digitar o código da carteirinha
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** Código impresso no QR da carteirinha, ex.: KP-7HQ4M2XR9C */
export function newStudentCode(length = 10): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return `KP-${out}`;
}
