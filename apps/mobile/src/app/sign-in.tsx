import { Link } from 'expo-router';
import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '@/ctx';
import { Button, colors, ErrorBox, Field, Muted } from '@/ui';

export default function SignIn() {
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!email.trim() || !password) return setError('Informe e-mail e senha.');
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      // o Stack.Protected leva para a tela inicial sozinho
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, gap: 16 }}>
          <View style={{ gap: 4, marginBottom: 16 }}>
            <Image source={require('../../assets/logo.png')} style={{ width: 64, height: 64, marginBottom: 12 }} />
            <Text style={{ fontSize: 32, fontWeight: '800', color: colors.primary }}>KioskPay</Text>
            <Muted>Saldo e consumo da cantina do seu filho.</Muted>
          </View>

          <Field
            label="E-mail"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="voce@email.com"
          />
          <Field
            label="Senha"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            onSubmitEditing={submit}
          />
          <ErrorBox message={error} />
          <Button title="Entrar" onPress={submit} loading={loading} />

          <Link href="/sign-up" style={{ textAlign: 'center', color: colors.primary, fontWeight: '600', padding: 8 }}>
            Ainda não tenho conta
          </Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
