/** 1550 → "R$ 15,50" */
export function brl(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const reais = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}R$ ${reais},${String(abs % 100).padStart(2, '0')}`;
}

/** "15", "15,5", "R$ 15,50" → 1550. Retorna null se inválido. */
export function parseBrl(text: string): number | null {
  const v = text.replace(/R\$\s*/i, '').replace(/\./g, '').replace(',', '.').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return null;
  return Math.round(Number(v) * 100);
}

/** Máscara de CPF enquanto digita: 52998224725 → 529.982.247-25 */
export function maskCpf(text: string): string {
  const d = text.replace(/\D/g, '').slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

/** "2026-11-04T15:30:00Z" → "04/11 11:30" no horário de Manaus */
export function shortDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Manaus',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const ENTRY_LABEL: Record<string, string> = {
  CREDIT: 'Recarga',
  DEBIT: 'Compra na cantina',
  REFUND: 'Estorno de compra',
  REVERSAL: 'Recarga estornada',
  ADJUSTMENT: 'Ajuste',
};
