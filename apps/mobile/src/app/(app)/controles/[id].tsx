import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';
import { api, type Category, type Controls, type Product } from '@/api';
import { useToken } from '@/ctx';
import { brl, parseBrl } from '@/format';
import { Button, Card, colors, ErrorBox, Field, Loading, Muted } from '@/ui';

export default function ControlsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const token = useToken();
  const [controls, setControls] = useState<Controls | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [limitText, setLimitText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, p, cat] = await Promise.all([api.controls(token, id), api.products(token), api.categories(token)]);
      setControls(c);
      setProducts(p);
      setCategories(cat);
      setLimitText(c.dailyLimitCents === null ? '' : brl(c.dailyLimitCents).replace('R$ ', ''));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [token, id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // targetId bloqueado → id do bloqueio (para desbloquear)
  const blocked = useMemo(
    () => new Map(controls?.restrictions.map((r) => [r.targetId, r.id]) ?? []),
    [controls],
  );

  async function saveLimit(clear = false) {
    setError(null);
    setSaved(null);
    const cents = clear ? null : parseBrl(limitText);
    if (!clear && cents === null) return setError('Digite um valor válido, ex.: 15,00');
    setBusy('limit');
    try {
      await api.setDailyLimit(token, id, cents);
      if (clear) setLimitText('');
      setSaved(clear ? 'Limite removido.' : `Limite de ${brl(cents!)} por dia salvo.`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function toggle(target: { productId?: string; categoryId?: string }, on: boolean) {
    const targetId = (target.productId ?? target.categoryId)!;
    setError(null);
    setBusy(targetId);
    try {
      if (on) await api.block(token, id, target);
      else await api.unblock(token, id, blocked.get(targetId)!);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!controls && !error) return <Loading />;

  // Produto de categoria bloqueada já está bloqueado: mostra o switch ligado e travado
  const categoryBlocked = (p: Product) => !!p.categoryId && blocked.has(p.categoryId);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
      <ErrorBox message={error} />

      <Card>
        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>Limite de gasto por dia</Text>
        <Muted>
          {controls?.dailyLimitCents === null
            ? 'Sem limite: pode gastar todo o saldo.'
            : `Atual: ${brl(controls!.dailyLimitCents)} por dia.`}
        </Muted>
        <Field label="Novo limite (R$)" value={limitText} onChangeText={setLimitText} keyboardType="decimal-pad" />
        {!!saved && <Text style={{ color: colors.credit }}>{saved}</Text>}
        <Button title="Salvar limite" onPress={() => saveLimit()} loading={busy === 'limit'} />
        {controls?.dailyLimitCents !== null && (
          <Button title="Remover limite" variant="secondary" onPress={() => saveLimit(true)} />
        )}
      </Card>

      {categories.length > 0 && (
        <Card>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>Bloquear categorias</Text>
          <Muted>Tudo o que estiver na categoria fica bloqueado.</Muted>
          {categories.map((c) => (
            <Row
              key={c.id}
              label={c.name}
              value={blocked.has(c.id)}
              disabled={busy === c.id}
              onChange={(on) => toggle({ categoryId: c.id }, on)}
            />
          ))}
        </Card>
      )}

      <Card>
        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>Bloquear produtos</Text>
        {products.length === 0 && <Muted>O cardápio ainda não foi cadastrado.</Muted>}
        {products.map((p) => (
          <Row
            key={p.id}
            label={p.name}
            hint={`${brl(p.priceCents)}${categoryBlocked(p) ? ' · bloqueado pela categoria' : ''}`}
            value={blocked.has(p.id) || categoryBlocked(p)}
            disabled={busy === p.id || categoryBlocked(p)}
            onChange={(on) => toggle({ productId: p.id }, on)}
          />
        ))}
      </Card>
    </ScrollView>
  );
}

function Row({
  label,
  hint,
  value,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={{ fontSize: 15, color: colors.text }}>{label}</Text>
        {!!hint && <Muted style={{ fontSize: 12 }}>{hint}</Muted>}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: colors.danger, false: colors.border }}
        accessibilityLabel={`Bloquear ${label}`}
      />
    </View>
  );
}
