import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Alert, Field, PageHeader } from '../ui';

export default function Account() {
  const { user } = useAuth();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);
    if (form.next.length < 8) return setError('A nova senha precisa ter pelo menos 8 caracteres.');
    if (form.next !== form.confirm) return setError('A confirmação não confere com a nova senha.');
    setBusy(true);
    try {
      await api.changePassword(form.current, form.next);
      setForm({ current: '', next: '', confirm: '' });
      setOk('Senha alterada. Use a nova senha no próximo login.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Minha conta" subtitle={`${user?.name} · ${user?.email}`} />
      <section className="card narrow">
        <h2>Trocar senha</h2>
        <form className="form" onSubmit={submit}>
          <Field label="Senha atual">
            <input
              type="password"
              autoComplete="current-password"
              value={form.current}
              onChange={(e) => setForm({ ...form, current: e.target.value })}
              required
            />
          </Field>
          <Field label="Nova senha" hint="Mínimo de 8 caracteres.">
            <input
              type="password"
              autoComplete="new-password"
              value={form.next}
              onChange={(e) => setForm({ ...form, next: e.target.value })}
              required
            />
          </Field>
          <Field label="Confirmar nova senha">
            <input
              type="password"
              autoComplete="new-password"
              value={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.value })}
              required
            />
          </Field>
          <Alert>{error}</Alert>
          <Alert kind="success">{ok}</Alert>
          <div className="form-actions">
            <button className="btn btn-primary" disabled={busy}>
              {busy ? 'Salvando…' : 'Trocar senha'}
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
