import QRCode from 'qrcode';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type Classroom, type Student } from '../api';
import { useAuth } from '../auth';
import { brl, centsToInput, dateTime, ENTRY_LABEL, parseBrl } from '../format';
import { Alert, Empty, Field, Modal, PageHeader, Spinner, useLoad } from '../ui';

export default function StudentDetail() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const admin = user?.role === 'ADMIN';
  const student = useLoad(() => api.student(id), [id]);
  const statement = useLoad(() => api.statement(id), [id]);
  const classrooms = useLoad(() => (admin ? api.classrooms() : Promise.resolve([])), [admin]);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const s = student.data;
  const reloadAll = () => {
    student.reload();
    statement.reload();
  };

  if (student.loading && !s) return <Spinner />;
  if (!s) return <Alert>{student.error ?? 'Aluno não encontrado.'}</Alert>;

  async function toggleActive() {
    if (!s) return;
    const verb = s.active ? 'desativar' : 'reativar';
    if (!window.confirm(`Deseja ${verb} ${s.name}?${s.active ? ' O aluno não poderá comprar na cantina.' : ''}`)) return;
    try {
      await api.updateStudent(s.id, { active: !s.active });
      setNotice(s.active ? 'Aluno desativado.' : 'Aluno reativado.');
      student.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function newCode() {
    if (!s) return;
    if (
      !window.confirm(
        'Gerar uma nova carteirinha? O código atual para de funcionar imediatamente. Use quando a carteirinha for perdida.',
      )
    )
      return;
    try {
      await api.regenerateCode(s.id);
      setNotice('Novo código gerado. Imprima a nova carteirinha.');
      student.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const balance = s.wallet?.balanceCents ?? 0;

  return (
    <>
      <p className="breadcrumb">
        <Link to="/alunos">← Alunos</Link>
      </p>
      <PageHeader
        title={s.name}
        subtitle={
          <>
            Matrícula {s.enrollment}
            {s.classroom ? ` · ${s.classroom.name}` : ''}
            {!s.active && <span className="tag" style={{ marginLeft: 8 }}>Inativo</span>}
          </>
        }
        actions={
          admin && (
            <>
              <button className="btn btn-secondary" onClick={() => setEditing(true)}>
                Editar
              </button>
              <button className={`btn ${s.active ? 'btn-danger' : 'btn-secondary'}`} onClick={toggleActive}>
                {s.active ? 'Desativar' : 'Reativar'}
              </button>
            </>
          )
        }
      />
      <Alert kind="success">{notice}</Alert>
      <Alert>{error}</Alert>

      <div className="grid-2">
        <section className="card">
          <h2>Saldo</h2>
          <p className={`balance ${balance < 0 ? 'negative' : ''}`}>{brl(balance)}</p>
          <p className="muted">
            Limite por dia: {s.dailyLimitCents === null ? 'sem limite' : brl(s.dailyLimitCents)}
          </p>
          <ManualRecharge studentId={s.id} onDone={(msg) => (setNotice(msg), reloadAll())} />
        </section>

        <section className="card">
          <h2>Carteirinha</h2>
          <IdCard student={s} />
          <div className="row-actions no-print">
            <button className="btn btn-secondary" onClick={() => window.print()}>
              Imprimir carteirinha
            </button>
            {admin && (
              <button className="btn btn-ghost" onClick={newCode}>
                Perdeu? Gerar novo código
              </button>
            )}
          </div>
        </section>
      </div>

      <section className="card">
        <h2>Responsáveis</h2>
        <Guardians student={s} admin={admin} onChange={student.reload} />
      </section>

      <section className="card">
        <h2>Extrato</h2>
        {statement.loading && !statement.data ? (
          <Spinner />
        ) : statement.data?.length ? (
          <div className="table-wrap flat">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Movimento</th>
                  <th className="hide-sm">Detalhe</th>
                  <th className="num">Valor</th>
                </tr>
              </thead>
              <tbody>
                {statement.data.map((e) => (
                  <tr key={e.id}>
                    <td>{dateTime(e.createdAt)}</td>
                    <td>{ENTRY_LABEL[e.type] ?? e.type}</td>
                    <td className="muted hide-sm">{e.reason ?? ''}</td>
                    <td className={`num ${e.amountCents > 0 ? 'positive' : ''}`}>
                      {e.amountCents > 0 ? '+' : ''}
                      {brl(e.amountCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Nenhuma movimentação ainda.</Empty>
        )}
      </section>

      {editing && (
        <EditStudent
          student={s}
          classrooms={classrooms.data ?? []}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setNotice('Dados salvos.');
            student.reload();
          }}
        />
      )}
    </>
  );
}

function IdCard({ student }: { student: Student }) {
  const [qr, setQr] = useState<string>('');
  useEffect(() => {
    QRCode.toDataURL(student.qrCode, { margin: 1, width: 360, errorCorrectionLevel: 'M' }).then(setQr);
  }, [student.qrCode]);

  return (
    <div className="print-area">
      <div className="idcard">
        <div className="idcard-head">
          <span className="brand-mark small">K</span> KioskPay · Cantina
        </div>
        <div className="idcard-body">
          {qr ? <img src={qr} alt={`QR code ${student.qrCode}`} /> : <div className="qr-placeholder" />}
          <div>
            <strong>{student.name}</strong>
            <span>{student.classroom?.name ?? ''}</span>
            <span>Mat. {student.enrollment}</span>
            <code>{student.qrCode}</code>
          </div>
        </div>
      </div>
    </div>
  );
}

function ManualRecharge({ studentId, onDone }: { studentId: string; onDone: (msg: string) => void }) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'CASH' | 'POS'>('CASH');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const cents = parseBrl(amount);
    if (!cents) return setError('Digite um valor válido, ex.: 20,00');
    const label = method === 'CASH' ? 'em dinheiro' : 'na maquininha';
    if (!window.confirm(`Confirmar recarga de ${brl(cents)} ${label}?`)) return;
    setBusy(true);
    try {
      await api.manualRecharge(studentId, cents, method);
      setAmount('');
      onDone(`Recarga de ${brl(cents)} ${label} lançada.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="recharge" onSubmit={submit}>
      <h3>Recarga no balcão</h3>
      <div className="inline-fields">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Valor (ex.: 20,00)"
          inputMode="decimal"
          aria-label="Valor da recarga"
        />
        <select value={method} onChange={(e) => setMethod(e.target.value as 'CASH' | 'POS')} aria-label="Forma">
          <option value="CASH">Dinheiro</option>
          <option value="POS">Maquininha</option>
        </select>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Lançando…' : 'Lançar'}
        </button>
      </div>
      <Alert>{error}</Alert>
    </form>
  );
}

function Guardians({ student, admin, onChange }: { student: Student; admin: boolean; onChange: () => void }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const list = student.guardians ?? [];

  async function link(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.linkGuardian(student.id, email.trim());
      setEmail('');
      onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function unlink(gid: string, name: string) {
    if (!window.confirm(`Desvincular ${name} deste aluno?`)) return;
    try {
      await api.unlinkGuardian(student.id, gid);
      onChange();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      {list.length === 0 ? (
        <p className="muted">Nenhum responsável vinculado. Sem isso, os pais não veem o aluno no app.</p>
      ) : (
        <ul className="list">
          {list.map((g) => (
            <li key={g.id}>
              <div>
                <strong>{g.name}</strong>
                <span className="muted">
                  {g.email}
                  {g.phone ? ` · ${g.phone}` : ''}
                </span>
              </div>
              {admin && (
                <button className="btn btn-ghost" onClick={() => unlink(g.id, g.name)}>
                  Desvincular
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {admin && (
        <form className="inline-fields" onSubmit={link}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-mail que o responsável usou no app"
            aria-label="E-mail do responsável"
            required
          />
          <button className="btn btn-secondary" disabled={busy}>
            Vincular
          </button>
        </form>
      )}
      <Alert>{error}</Alert>
    </>
  );
}

function EditStudent({
  student,
  classrooms,
  onClose,
  onSaved,
}: {
  student: Student;
  classrooms: Classroom[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: student.name,
    enrollment: student.enrollment,
    classroomId: student.classroomId ?? '',
    limit: centsToInput(student.dailyLimitCents),
    nfcUid: student.nfcUid ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const limit = form.limit.trim() ? parseBrl(form.limit) : null;
    if (form.limit.trim() && limit === null) return setError('Limite diário inválido. Use o formato 15,00.');
    setBusy(true);
    try {
      await api.updateStudent(student.id, {
        name: form.name.trim(),
        enrollment: form.enrollment.trim(),
        ...(form.classroomId && { classroomId: form.classroomId }),
        ...(form.nfcUid.trim() && { nfcUid: form.nfcUid.trim() }),
      });
      if (limit !== student.dailyLimitCents) await api.setDailyLimit(student.id, limit);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title="Editar aluno" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field label="Nome completo">
          <input value={form.name} onChange={set('name')} required minLength={2} />
        </Field>
        <Field label="Matrícula">
          <input value={form.enrollment} onChange={set('enrollment')} required />
        </Field>
        <Field label="Turma">
          <select value={form.classroomId} onChange={set('classroomId')}>
            {!form.classroomId && <option value="">Sem turma</option>}
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Limite de gasto por dia" hint="Deixe vazio para sem limite.">
          <input value={form.limit} onChange={set('limit')} placeholder="Ex.: 15,00" inputMode="decimal" />
        </Field>
        <Field label="Código do cartão/pulseira NFC (opcional)">
          <input value={form.nfcUid} onChange={set('nfcUid')} />
        </Field>
        <Alert>{error}</Alert>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
