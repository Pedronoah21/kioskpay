import { useState, type FormEvent } from 'react';
import { api, type Category, type Product } from '../api';
import { useAuth } from '../auth';
import { brl, centsToInput, parseBrl } from '../format';
import { Alert, Empty, Field, Modal, PageHeader, Spinner, useLoad } from '../ui';

export default function Products() {
  const { user } = useAuth();
  const admin = user?.role === 'ADMIN';
  const products = useLoad(() => api.products(), []);
  const categories = useLoad(() => api.categories(), []);
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [stockFor, setStockFor] = useState<Product | null>(null);
  const [newCategory, setNewCategory] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const low = products.data?.filter((p) => p.stock <= p.minStock) ?? [];

  async function deactivate(p: Product) {
    if (!window.confirm(`Tirar "${p.name}" do cardápio? O histórico de vendas continua.`)) return;
    try {
      await api.deactivateProduct(p.id);
      setNotice(`${p.name} saiu do cardápio.`);
      products.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        title="Produtos"
        subtitle="Cardápio da cantina. Os pais veem estes itens no app para bloquear o que quiserem."
        actions={
          admin && (
            <>
              <button className="btn btn-secondary" onClick={() => setNewCategory(true)}>
                Nova categoria
              </button>
              <button className="btn btn-primary" onClick={() => setEditing('new')}>
                Novo produto
              </button>
            </>
          )
        }
      />
      <Alert kind="success">{notice}</Alert>
      <Alert>{error ?? products.error}</Alert>
      {low.length > 0 && (
        <Alert kind="info">
          Estoque baixo: {low.map((p) => `${p.name} (${p.stock})`).join(', ')}
        </Alert>
      )}

      {categories.data && categories.data.length > 0 && (
        <p className="chips">
          <span className="muted">Categorias:</span>
          {categories.data.map((c) => (
            <span key={c.id} className="tag">
              {c.name}
            </span>
          ))}
        </p>
      )}

      {products.loading && !products.data ? (
        <Spinner />
      ) : products.data?.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Produto</th>
                <th>Categoria</th>
                <th className="num">Preço</th>
                <th className="num">Estoque</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {products.data.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.name}</strong>
                  </td>
                  <td>{p.category?.name ?? '—'}</td>
                  <td className="num">{brl(p.priceCents)}</td>
                  <td className={`num ${p.stock <= p.minStock ? 'negative' : ''}`}>
                    {p.stock}
                    {p.minStock > 0 && <span className="muted"> / mín. {p.minStock}</span>}
                  </td>
                  <td className="num nowrap">
                    <button className="btn btn-ghost" onClick={() => setStockFor(p)}>
                      Estoque
                    </button>
                    {admin && (
                      <>
                        <button className="btn btn-ghost" onClick={() => setEditing(p)}>
                          Editar
                        </button>
                        <button className="btn btn-ghost danger" onClick={() => deactivate(p)}>
                          Remover
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>
          <strong>Nenhum produto cadastrado.</strong>
          {admin && <p>Crie categorias (ex.: Salgados, Bebidas, Doces) e depois os produtos.</p>}
        </Empty>
      )}

      {editing && (
        <ProductForm
          product={editing === 'new' ? null : editing}
          categories={categories.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setEditing(null);
            setNotice(msg);
            products.reload();
          }}
        />
      )}
      {stockFor && (
        <StockForm
          product={stockFor}
          onClose={() => setStockFor(null)}
          onSaved={(msg) => {
            setStockFor(null);
            setNotice(msg);
            products.reload();
          }}
        />
      )}
      {newCategory && (
        <CategoryForm
          onClose={() => setNewCategory(false)}
          onSaved={(c) => {
            setNewCategory(false);
            setNotice(`Categoria ${c.name} criada.`);
            categories.reload();
          }}
        />
      )}
    </>
  );
}

function ProductForm({
  product,
  categories,
  onClose,
  onSaved,
}: {
  product: Product | null;
  categories: Category[];
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    name: product?.name ?? '',
    categoryId: product?.categoryId ?? '',
    price: centsToInput(product?.priceCents),
    stock: '',
    minStock: String(product?.minStock ?? 0),
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const price = parseBrl(form.price);
    if (!price) return setError('Preço inválido. Use o formato 6,50.');
    const minStock = Number(form.minStock || 0);
    const stock = Number(form.stock || 0);
    if (!Number.isInteger(minStock) || minStock < 0 || !Number.isInteger(stock) || stock < 0) {
      return setError('Estoque deve ser um número inteiro.');
    }
    setBusy(true);
    try {
      const base = {
        name: form.name.trim(),
        priceCents: price,
        minStock,
        ...(form.categoryId && { categoryId: form.categoryId }),
      };
      if (product) await api.updateProduct(product.id, base);
      else await api.createProduct({ ...base, stock });
      onSaved(product ? 'Produto atualizado.' : `${base.name} adicionado ao cardápio.`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title={product ? 'Editar produto' : 'Novo produto'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field label="Nome">
          <input value={form.name} onChange={set('name')} required minLength={2} autoFocus />
        </Field>
        <Field label="Categoria" hint="Os pais podem bloquear uma categoria inteira.">
          <select value={form.categoryId} onChange={set('categoryId')}>
            {!form.categoryId && <option value="">Sem categoria</option>}
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Preço (R$)">
          <input value={form.price} onChange={set('price')} placeholder="Ex.: 6,50" inputMode="decimal" required />
        </Field>
        {!product && (
          <Field label="Estoque inicial">
            <input value={form.stock} onChange={set('stock')} inputMode="numeric" placeholder="0" />
          </Field>
        )}
        <Field label="Estoque mínimo" hint="Abaixo disso o painel avisa.">
          <input value={form.minStock} onChange={set('minStock')} inputMode="numeric" />
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

function StockForm({
  product,
  onClose,
  onSaved,
}: {
  product: Product;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [qty, setQty] = useState('');
  const [kind, setKind] = useState<'in' | 'out'>('in');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const n = Number(qty);
    if (!Number.isInteger(n) || n <= 0) return setError('Informe a quantidade (número inteiro).');
    setBusy(true);
    try {
      const r = await api.adjustStock(product.id, kind === 'in' ? n : -n);
      onSaved(`${product.name}: estoque agora é ${r.stock}.`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title={`Estoque · ${product.name}`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p className="muted">Estoque atual: {product.stock}</p>
        <Field label="Movimento">
          <select value={kind} onChange={(e) => setKind(e.target.value as 'in' | 'out')}>
            <option value="in">Entrada (chegou mercadoria)</option>
            <option value="out">Saída (perda, vencido, consumo interno)</option>
          </select>
        </Field>
        <Field label="Quantidade">
          <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" required autoFocus />
        </Field>
        <Alert>{error}</Alert>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={busy}>
            Lançar
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CategoryForm({ onClose, onSaved }: { onClose: () => void; onSaved: (c: Category) => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      onSaved(await api.createCategory(name.trim()));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Modal title="Nova categoria" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field label="Nome" hint="Ex.: Salgados, Bebidas, Refrigerantes, Doces">
          <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} autoFocus />
        </Field>
        <Alert>{error}</Alert>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary">Criar</button>
        </div>
      </form>
    </Modal>
  );
}
