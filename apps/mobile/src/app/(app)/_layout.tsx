import { Stack } from 'expo-router';
import { colors } from '@/ui';

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: colors.bg },
        headerBackTitle: 'Voltar',
      }}>
      <Stack.Screen name="index" options={{ title: 'Meus filhos' }} />
      <Stack.Screen name="filho/[id]" options={{ title: '' }} />
      <Stack.Screen name="recarga/[id]" options={{ title: 'Recarregar' }} />
      <Stack.Screen name="controles/[id]" options={{ title: 'Limite e bloqueios' }} />
    </Stack>
  );
}
