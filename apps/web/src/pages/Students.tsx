import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type Classroom } from '../api';
import { useAuth } from '../auth';
import { brl, parseBrl } from '../format';
import { Alert, Empty, Field, Modal, PageHeader, Spinner, useLoad } from '../ui';

const PAGE = 50;

export default function Students() {
  const { user } = useAuth();
  const admin = user?.role === 'ADMIN';
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [classroomId, setClassroomId] = useState('');
  const [page, setPage] = useState(0);
  const [creating, setCreating] = useState(false);

  // Busca 300ms depois de parar de digitar
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const classrooms = useLoad(() => api.classrooms(), []);
  const list = useLoad(
    () => api.students({ search: query, classroomId, skip: page * PAGE, take: PAGE }),
    [query, classroomId, page],
  );
  const total = list.data?.total ?? 0;

  return (
    <>
      <PageHeader
        title="Alunos"
        subtitle={list.data ? `${total} aluno${total === 1 ? '' : 's'}` : undefined}
        actions={
          admin && (
            <>
              <Link className="btn btn-secondary" to="/importar">
                Importar planilha
              </Link>
              <button className="btn btn-primary" onClick={() => setCreating(true)}>
                Novo aluno
              </button>
            </>
          )
        }
      />

      <div className="toolbar">
        <input
          type="search"
          placeholder="Buscar por nome ou matrícula"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Buscar aluno"
        />
        <select
          value={classroomId}
          onChange={(e) => {
            setClassroomId(e.target.value);
            setPage(0);
          }}
          aria-label="Filtrar por turma">
          <option value="">Todas as turmas</option>
          {classrooms.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <Alert>{list.error}</Alert>
      {list.loading && !list.data ? (
        <Spinner />
      ) : list.data && list.data.items.length === 0 ? (
        <Empty>
          {query || classroomId ? (
            'Nenhum aluno encontrado com esse filtro.'
          ) : (
            <>
              <strong>Nenhum aluno cadastrado ainda.</strong>
              {admin && <p>Cadastre um por um em “Novo aluno” ou envie a planilha da secretaria em “Importar planilha”.</p>}
            </>
          )}
        </Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Matrícula</th>
                <th>Turma</th>
                <th className="num">Saldo</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {list.data?.items.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link to={`/alunos/${s.id}`}>{s.name}</Link>
                  </td>
                  <td>{s.enrollment}</td>
                  <td>{s.classroom?.name ?? '—'}</td>
                  <td className={`num ${(s.wallet?.balanceCents ?? 0) < 0 ? 'negative' : ''}`}>
                    {brl(s.wallet?.balanceCents ?? 0)}
                  </td>
                  <td>{s.active ? <span className="tag tag-ok">Ativo</span> : <span className="tag">Inativo</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > PAGE && (
        <div className="pager">
          <button className="btn btn-ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </button>
          <span className="muted">
            {page * PAGE + 1}–{Math.min(total, (page + 1) * PAGE)} de {total}
          </span>
          <button className="btn btn-ghost" disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)}>
            Próxima
          </button>
        </div>
      )}

      {creating && <NewStudent classrooms={classrooms.data ?? []} onClose={() => setCreating(false)} />}
    </>
  );
}

function NewStudent({ classrooms, onClose }: { classrooms: Classroom[]; onClose: () => void }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', enrollment: '', classroomId: '', limit: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const limit = form.limit.trim() ? parseBrl(form.limit) : undefined;
    if (limit === null) return setError('Limite diário inválido. Use o formato 15,00.');
    setBusy(true);
    try {
      const s = await api.createStudent({
        name: form.name.trim(),
        enrollment: form.enrollment.trim(),
        classroomId: form.classroomId || undefined,
        dailyLimitCents: limit,
      });
      navigate(`/alunos/${s.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title="Novo aluno" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field label="Nome completo">
          <input value={form.name} onChange={set('name')} required minLength={2} autoFocus />
        </Field>
        <Field label="Matrícula">
          <input value={form.enrollment} onChange={set('enrollment')} required />
        </Field>
        <Field label="Turma" hint={classrooms.length ? undefined : 'Cadastre turmas no menu Turmas.'}>
          <select value={form.classroomId} onChange={set('classroomId')}>
            <option value="">Sem turma</option>
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Limite de gasto por dia (opcional)" hint="Os pais também podem definir pelo app.">
          <input value={form.limit} onChange={set('limit')} placeholder="Ex.: 15,00" inputMode="decimal" />
        </Field>
        <Alert>{error}</Alert>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Salvando…' : 'Cadastrar aluno'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
