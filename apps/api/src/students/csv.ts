/**
 * Leitor de CSV simples para importar alunos.
 * Aceita separador ";" (padrão do Excel em português) ou ",",
 * campos entre aspas e cabeçalho com ou sem acento.
 */

export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, ''); // BOM do Excel
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === sep) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.map((r) => r.map((f) => f.trim())).filter((r) => r.some((f) => f !== ''));
}

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const HEADERS: Record<string, keyof StudentRow> = {
  nome: 'name',
  aluno: 'name',
  matricula: 'enrollment',
  turma: 'classroom',
  serie: 'grade',
  turno: 'shift',
  limitediario: 'dailyLimit',
  limite: 'dailyLimit',
};

export interface StudentRow {
  line: number;
  name: string;
  enrollment: string;
  classroom?: string;
  grade?: string;
  shift?: string;
  dailyLimit?: string;
}

export interface ParsedImport {
  rows: StudentRow[];
  errors: { line: number; message: string }[];
}

/** Converte "15", "15,50" ou "R$ 15,50" em centavos. */
export function parseBrl(value: string): number | null {
  const v = value.replace(/R\$\s*/i, '').replace(/\./g, '').replace(',', '.').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return null;
  return Math.round(Number(v) * 100);
}

export function readStudentCsv(text: string): ParsedImport {
  const table = parseCsv(text);
  const errors: ParsedImport['errors'] = [];
  if (table.length < 2) return { rows: [], errors: [{ line: 1, message: 'Planilha vazia ou sem cabeçalho' }] };

  const columns = table[0].map((h) => HEADERS[normalize(h)]);
  if (!columns.includes('name') || !columns.includes('enrollment')) {
    return { rows: [], errors: [{ line: 1, message: 'Cabeçalho precisa ter as colunas "nome" e "matricula"' }] };
  }

  const rows: StudentRow[] = [];
  const seen = new Set<string>();
  table.slice(1).forEach((cells, idx) => {
    const line = idx + 2;
    const row: StudentRow = { line, name: '', enrollment: '' };
    columns.forEach((key, i) => {
      if (key && cells[i]) (row as any)[key] = cells[i];
    });
    if (!row.name) return errors.push({ line, message: 'Nome vazio' });
    if (!row.enrollment) return errors.push({ line, message: 'Matrícula vazia' });
    if (seen.has(row.enrollment)) return errors.push({ line, message: `Matrícula ${row.enrollment} repetida na planilha` });
    if (row.dailyLimit && parseBrl(row.dailyLimit) === null) {
      return errors.push({ line, message: `Limite diário inválido: ${row.dailyLimit}` });
    }
    seen.add(row.enrollment);
    rows.push(row);
  });
  return { rows, errors };
}
