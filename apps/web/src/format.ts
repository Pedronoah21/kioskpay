/** 1550 → "R$ 15,50" */
export function brl(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const reais = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}R$ ${reais},${String(abs % 100).padStart(2, '0')}`;
}

/** "15", "15,5", "R$ 1.234,56" → centavos. null se inválido. */
export function parseBrl(text: string): number | null {
  const v = text.replace(/R\$\s*/i, '').replace(/\./g, '').replace(',', '.').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return null;
  return Math.round(Number(v) * 100);
}

/** 1550 → "15,50" (para preencher campos) */
export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '';
  return brl(cents).replace('R$ ', '');
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Manaus',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const ENTRY_LABEL: Record<string, string> = {
  CREDIT: 'Recarga',
  DEBIT: 'Compra',
  REFUND: 'Estorno de compra',
  REVERSAL: 'Recarga estornada',
  ADJUSTMENT: 'Ajuste',
};

/**
 * Lê um CSV vindo do Excel. "CSV UTF-8" chega em UTF-8;
 * "CSV (separado por vírgulas)" no Windows em português chega em Windows-1252.
 */
export async function readCsvFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}
