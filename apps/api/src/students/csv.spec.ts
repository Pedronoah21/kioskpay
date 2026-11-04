import { parseBrl, parseCsv, readStudentCsv } from './csv';

describe('parseCsv', () => {
  it('detecta ponto e vírgula, aspas e BOM', () => {
    expect(parseCsv('﻿nome;turma\r\n"Silva; Ana";5º A\r\n')).toEqual([
      ['nome', 'turma'],
      ['Silva; Ana', '5º A'],
    ]);
  });

  it('aceita vírgula e aspas escapadas', () => {
    expect(parseCsv('a,b\n"diz ""oi""",2')).toEqual([
      ['a', 'b'],
      ['diz "oi"', '2'],
    ]);
  });
});

describe('parseBrl', () => {
  it('converte valores em reais para centavos', () => {
    expect(parseBrl('15')).toBe(1500);
    expect(parseBrl('15,5')).toBe(1550);
    expect(parseBrl('R$ 1.234,56')).toBe(123456);
    expect(parseBrl('abc')).toBeNull();
  });
});

describe('readStudentCsv', () => {
  it('lê cabeçalho com acento e aponta erros por linha', () => {
    const csv = [
      'Nome;Matrícula;Turma;Série;Limite diário',
      'Ana Souza;1001;5º A;5º ano;15,00',
      ';1002;5º A;;',
      'Bruno;1001;5º B;;',
      'Carla;1003;;;muito',
      'Davi;1004;6º A;;',
    ].join('\n');
    const r = readStudentCsv(csv);
    expect(r.rows.map((x) => x.enrollment)).toEqual(['1001', '1004']);
    expect(r.rows[0]).toMatchObject({ name: 'Ana Souza', classroom: '5º A', grade: '5º ano', dailyLimit: '15,00' });
    expect(r.errors).toEqual([
      { line: 3, message: 'Nome vazio' },
      { line: 4, message: 'Matrícula 1001 repetida na planilha' },
      { line: 5, message: 'Limite diário inválido: muito' },
    ]);
  });

  it('exige colunas nome e matricula', () => {
    expect(readStudentCsv('turma\n5A').errors[0].message).toContain('nome');
  });
});
