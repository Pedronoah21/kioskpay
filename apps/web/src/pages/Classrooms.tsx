import { useState, type FormEvent } from 'react';
import { api, type Classroom } from '../api';
import { Alert, Empty, Field, Modal, PageHeader, Spinner, useLoad } from '../ui';

export default function Classrooms() {
  const list = useLoad(() => api.classrooms(), []);
  const [editing, setEditing] = useState<Classroom | 'new' | null>(null);

  return (
    <>
      <PageHeader
        title="Turmas"
        actions={
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            Nova turma
          </button>
        }
      />
      <Alert>{list.error}</Alert>
      {list.loading && !list.data ? (
        <Spinner />
      ) : list.data?.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Turma</th>
                <th>Série</th>
                <th>Turno</th>
                <th className="num">Alunos</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.data.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.name}</strong>
                  </td>
                  <td>{c.grade}</td>
                  <td>{c.shift ?? '—'}</td>
                  <td className="num">{c._count?.students ?? 0}</td>
                  <td className="num">
                    <button className="btn btn-ghost" onClick={() => setEditing(c)}>
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>Nenhuma turma ainda. Elas também são criadas automaticamente na importação da planilha.</Empty>
      )}

      {editing && (
        <ClassroomForm
          classroom={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            list.reload();
          }}
        />
      )}
    </>
  );
}

function ClassroomForm({
  classroom,
  onClose,
  onSaved,
}: {
  classroom: Classroom | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: classroom?.name ?? '',
    grade: classroom?.grade ?? '',
    shift: classroom?.shift ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = { name: form.name.trim(), grade: form.grade.trim(), shift: form.shift || undefined };
    try {
      if (classroom) await api.updateClassroom(classroom.id, body);
      else await api.createClassroom(body);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title={classroom ? 'Editar turma' : 'Nova turma'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field label="Nome da turma" hint="Como aparece para os pais, ex.: 5º ano A">
          <input value={form.name} onChange={set('name')} required autoFocus />
        </Field>
        <Field label="Série">
          <input value={form.grade} onChange={set('grade')} placeholder="Ex.: 5º ano" required />
        </Field>
        <Field label="Turno">
          <select value={form.shift} onChange={set('shift')}>
            <option value="">—</option>
            <option>Manhã</option>
            <option>Tarde</option>
            <option>Integral</option>
            <option>Noite</option>
          </select>
        </Field>
        <Alert>{error}</Alert>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={busy}>
            Salvar
          </button>
        </div>
      </form>
    </Modal>
  );
}
