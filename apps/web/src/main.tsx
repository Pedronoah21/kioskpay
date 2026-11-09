import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import Account from './pages/Account';
import Checkout from './pages/Checkout';
import Sales from './pages/Sales';
import Classrooms from './pages/Classrooms';
import ImportStudents from './pages/ImportStudents';
import Login from './pages/Login';
import Products from './pages/Products';
import Staff from './pages/Staff';
import StudentDetail from './pages/StudentDetail';
import Students from './pages/Students';
import './styles.css';
import { SlowBanner, Spinner } from './ui';

function Shell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const admin = user?.role === 'ADMIN';
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">K</span>
          <span>KioskPay</span>
        </div>
        <nav>
          <NavLink to="/caixa">Caixa</NavLink>
          <NavLink to="/vendas">Vendas do dia</NavLink>
          <NavLink to="/alunos">Alunos</NavLink>
          {admin && <NavLink to="/importar">Importar planilha</NavLink>}
          {admin && <NavLink to="/turmas">Turmas</NavLink>}
          <NavLink to="/produtos">Produtos</NavLink>
          {admin && <NavLink to="/equipe">Equipe</NavLink>}
          <NavLink to="/conta">Minha conta</NavLink>
        </nav>
        <div className="sidebar-foot">
          <div className="user">
            <strong>{user?.name}</strong>
            <span className="muted">{admin ? 'Administrador' : 'Operador de caixa'}</span>
          </div>
          <button className="btn btn-ghost" onClick={signOut}>
            Sair
          </button>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}

function App() {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="center-screen">
        <Spinner label="Abrindo o painel…" />
      </div>
    );
  if (!user) return <Login />;

  const admin = user.role === 'ADMIN';
  return (
    <Shell>
      <Routes>
        <Route path="/caixa" element={<Checkout />} />
        <Route path="/vendas" element={<Sales />} />
        <Route path="/alunos" element={<Students />} />
        <Route path="/alunos/:id" element={<StudentDetail />} />
        <Route path="/produtos" element={<Products />} />
        <Route path="/conta" element={<Account />} />
        {admin && <Route path="/importar" element={<ImportStudents />} />}
        {admin && <Route path="/turmas" element={<Classrooms />} />}
        {admin && <Route path="/equipe" element={<Staff />} />}
        <Route path="*" element={<Navigate to={admin ? '/alunos' : '/caixa'} replace />} />
      </Routes>
    </Shell>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <AuthProvider>
        <SlowBanner />
        <App />
      </AuthProvider>
    </HashRouter>
  </StrictMode>,
);
