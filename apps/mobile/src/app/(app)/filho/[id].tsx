import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { api, type LedgerEntry } from '@/api';
import { useToken } from '@/ctx';
import { brl, ENTRY_LABEL, shortDate } from '@/format';
import { Button, Card, colors, ErrorBox, Loading, Muted } from '@/ui';

export default function ChildDetail() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const token = useToken();
  const [balance, setBalance] = useState<number | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [b, s] = await Promise.all([api.balance(token, id), api.statement(token, id)]);
      setBalance(b.balanceCents);
      setEntries(s);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [token, id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (balance === null && !error) return <Loading />;

  return (
    <>
      <Stack.Screen options={{ title: name ?? 'Aluno' }} />
      <FlatList
        contentContainerStyle={{ padding: 16, gap: 10 }}
        data={entries}
        keyExtractor={(e) => e.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 8 }}>
            <ErrorBox message={error} />
            <Card style={{ alignItems: 'center', paddingVertical: 24 }}>
              <Muted>Saldo disponível</Muted>
              <Text
                style={{
                  fontSize: 36,
                  fontWeight: '800',
                  color: (balance ?? 0) < 0 ? colors.danger : colors.text,
                }}>
                {brl(balance ?? 0)}
              </Text>
            </Card>
            <Button
              title="Recarregar com Pix"
              onPress={() => router.push({ pathname: '/recarga/[id]', params: { id, name } })}
            />
            <Button
              title="Limite diário e bloqueios"
              variant="secondary"
              onPress={() => router.push({ pathname: '/controles/[id]', params: { id } })}
            />
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 8 }}>Extrato</Text>
          </View>
        }
        ListEmptyComponent={<Muted>Nenhuma movimentação ainda.</Muted>}
        renderItem={({ item }) => {
          const positive = item.amountCents > 0;
          return (
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: colors.card,
                borderRadius: 12,
                padding: 14,
              }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>
                  {ENTRY_LABEL[item.type] ?? item.type}
                </Text>
                <Muted style={{ fontSize: 12 }}>
                  {shortDate(item.createdAt)}
                  {item.reason ? ` · ${item.reason}` : ''}
                </Muted>
              </View>
              <Text style={{ fontSize: 16, fontWeight: '700', color: positive ? colors.credit : colors.text }}>
                {positive ? '+' : ''}
                {brl(item.amountCents)}
              </Text>
            </View>
          );
        }}
      />
    </>
  );
}
