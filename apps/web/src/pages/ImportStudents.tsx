import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type ImportResult } from '../api';
import { readCsvFile } from '../format';
import { Alert, PageHeader } from '../ui';

const MODEL = 'Nome;Matrícula;Turma;Série;Turno;Limite diário\nAna Souza;1001;5º A;5º ano;Manhã;15,00\nBruno Lima;1002;6º B;6º ano;Tarde;\n';

function downloadModel() {
  // BOM para o Excel abrir os acentos corretamente
  const blob = new Blob(['﻿' + MODEL], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'modelo-alunos-kioskpay.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function ImportStudents() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const preview = csv
    ?.split(/\r?\n/)
    .filter((l) => l.trim())
    .slice(0, 6);

  async function onFile(file: File | undefined) {
    setResult(null);
    setError(null);
    if (!file) return;
    if (!/\.(csv|txt)$/i.test(file.name)) {
      setError('Envie o arquivo em formato CSV. No Excel: Arquivo › Salvar como › CSV.');
      return;
    }
    setFileName(file.name);
    setCsv(await readCsvFile(file));
  }

  async function send() {
    if (!csv) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await api.importStudents(csv));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Importar alunos" subtitle="Cadastre vários alunos de uma vez a partir da planilha da secretaria." />

      <section className="card steps">
        <ol>
          <li>
            Baixe o modelo ou use a sua planilha. As colunas <strong>Nome</strong> e <strong>Matrícula</strong> são
            obrigatórias; Turma, Série, Turno e Limite diário são opcionais.{' '}
            <button className="link" onClick={downloadModel}>
              Baixar modelo
            </button>
          </li>
          <li>No Excel, salve como CSV (Arquivo › Salvar como › CSV).</li>
          <li>
            Envie o arquivo abaixo. Matrícula que já existe é <strong>atualizada</strong>, não duplicada, e turmas novas
            são criadas automaticamente.
          </li>
        </ol>

        <label className="dropzone">
          <input type="file" accept=".csv,.txt,text/csv" onChange={(e) => onFile(e.target.files?.[0])} />
          <span>{fileName ? `Arquivo: ${fileName}` : 'Clique para escolher o arquivo CSV'}</span>
        </label>

        {preview && preview.length > 0 && (
          <>
            <p className="muted">Primeiras linhas do arquivo:</p>
            <pre className="preview">{preview.join('\n')}</pre>
            <button className="btn btn-primary" onClick={send} disabled={busy}>
              {busy ? 'Importando…' : 'Importar alunos'}
            </button>
          </>
        )}
        <Alert>{error}</Alert>
      </section>

      {result && (
        <section className="card">
          <h2>Resultado</h2>
          <div className="stats">
            <div>
              <strong>{result.created}</strong>
              <span>cadastrados</span>
            </div>
            <div>
              <strong>{result.updated}</strong>
              <span>atualizados</span>
            </div>
            <div className={result.skipped ? 'warn' : ''}>
              <strong>{result.skipped}</strong>
              <span>com problema</span>
            </div>
          </div>
          {result.errors.length > 0 && (
            <>
              <p>Corrija estas linhas na planilha e envie de novo (as que deram certo não serão duplicadas):</p>
              <div className="table-wrap flat">
                <table>
                  <thead>
                    <tr>
                      <th>Linha</th>
                      <th>Problema</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.errors.map((e) => (
                      <tr key={e.line + e.message}>
                        <td>{e.line}</td>
                        <td>{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <Link className="btn btn-secondary" to="/alunos">
            Ver alunos
          </Link>
        </section>
      )}
    </>
  );
}
