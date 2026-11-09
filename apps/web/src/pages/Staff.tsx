import { useState, type FormEvent } from 'react';
import { api, type Staff as StaffUser } from '../api';
import { useAuth } from '../auth';
import { Alert, Field, Modal, PageHeader, Spinner, useLoad } from '../ui';

export default function Staff() {
  const { user } = useAuth();
  const list = useLoad(() => api.staff(), []);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(s: StaffUser) {
    if (!window.confirm(`${s.active ? 'Bloquear' : 'Liberar'} o acesso de ${s.name}?`)) return;
    try {
      await api.setStaffActive(s.id, !s.active);
      list.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        title="Equipe"
        subtitle="Quem pode entrar no painel. Operadores de caixa vendem e lançam recargas; administradores fazem tudo."
        actions={
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            Novo usuário
          </button>
        }
      />
      <Alert>{error ?? list.error}</Alert>
      {list.loading && !list.data ? (
        <Spinner />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Perfil</th>
                <th>Acesso</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.data?.map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.name}</strong>
                    {s.id === user?.id && <span className="muted"> (você)</span>}
                  </td>
                  <td>{s.email}</td>
                  <td>{s.role === 'ADMIN' ? 'Administrador' : 'Operador de caixa'}</td>
                  <td>{s.active ? <span className="tag tag-ok">Liberado</span> : <span className="tag">Bloqueado</span>}</td>
                  <td className="num">
                    {s.id !== user?.id && (
                      <button className={`btn btn-ghost ${s.active ? 'danger' : ''}`} onClick={() => toggle(s)}>
                        {s.active ? 'Bloquear' : 'Liberar'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && (
        <NewStaff
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            list.reload();
          }}
        />
      )}
    </>
  );
}

function NewStaff({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'OPERATOR' as 'ADMIN' | 'OPERATOR' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.createStaff({ ...form, name: form.name.trim(), email: form.email.trim() });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title="Novo usuário da equipe" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field label="Nome">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
        </Field>
        <Field label="E-mail">
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
        </Field>
        <Field label="Senha inicial" hint="Mínimo de 8 caracteres. A pessoa pode trocar em Minha conta.">
          <input
            type="text"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            minLength={8}
            required
            autoComplete="new-password"
          />
        </Field>
        <Field label="Perfil">
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'ADMIN' | 'OPERATOR' })}>
            <option value="OPERATOR">Operador de caixa</option>
            <option value="ADMIN">Administrador</option>
          </select>
        </Field>
        <Alert>{error}</Alert>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={busy}>
            Criar acesso
          </button>
        </div>
      </form>
    </Modal>
  );
}
