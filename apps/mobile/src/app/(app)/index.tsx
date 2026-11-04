import { Link, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { api, type Me } from '@/api';
import { useSession, useToken } from '@/ctx';
import { brl } from '@/format';
import { Card, colors, ErrorBox, Loading, Muted } from '@/ui';

export default function Home() {
  const token = useToken();
  const { signOut } = useSession();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setMe(await api.me(token));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [token]);

  // Recarrega ao voltar para esta tela (ex.: depois de uma recarga)
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const header = (
    <Stack.Screen
      options={{
        headerRight: () => (
          <Pressable onPress={signOut} hitSlop={12} style={{ paddingHorizontal: 8 }}>
            <Text style={{ color: colors.primary, fontWeight: '600' }}>Sair</Text>
          </Pressable>
        ),
      }}
    />
  );

  if (!me && !error) return <>{header}<Loading /></>;

  return (
    <>
      {header}
      <FlatList
        contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
        data={me?.children ?? []}
        keyExtractor={(c) => c.id}
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
          <View style={{ gap: 8, marginBottom: 4 }}>
            {me && <Muted>Olá, {me.name.split(' ')[0]}</Muted>}
            <ErrorBox message={error} />
          </View>
        }
        ListEmptyComponent={
          me ? (
            <Card>
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>Nenhum aluno vinculado ainda</Text>
              <Muted>
                Peça à secretaria da escola para vincular seu cadastro ao aluno usando o e-mail {me.email}.
              </Muted>
            </Card>
          ) : undefined
        }
        renderItem={({ item }) => (
          <Link href={{ pathname: '/filho/[id]', params: { id: item.id, name: item.name } }} asChild>
            <Pressable>
              <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ gap: 2, flex: 1 }}>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>{item.name}</Text>
                  {!!item.classroom && <Muted>{item.classroom}</Muted>}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Muted style={{ fontSize: 12 }}>Saldo</Muted>
                  <Text
                    style={{
                      fontSize: 20,
                      fontWeight: '800',
                      color: item.balanceCents < 0 ? colors.danger : colors.text,
                    }}>
                    {brl(item.balanceCents)}
                  </Text>
                </View>
              </Card>
            </Pressable>
          </Link>
        )}
      />
    </>
  );
}
