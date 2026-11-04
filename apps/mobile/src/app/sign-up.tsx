import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useSession } from '@/ctx';
import { maskCpf } from '@/format';
import { Button, ErrorBox, Field, Muted } from '@/ui';

export default function SignUp() {
  const { signUp } = useSession();
  const [form, setForm] = useState({ name: '', email: '', document: '', phone: '', password: '', confirm: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setError(null);
    if (form.name.trim().length < 3) return setError('Informe seu nome completo.');
    if (!form.email.includes('@')) return setError('Informe um e-mail válido.');
    if (form.document.replace(/\D/g, '').length !== 11) return setError('Informe o CPF completo.');
    if (form.password.length < 8) return setError('A senha precisa ter pelo menos 8 caracteres.');
    if (form.password !== form.confirm) return setError('As senhas não conferem.');

    setLoading(true);
    try {
      await signUp({
        name: form.name.trim(),
        email: form.email.trim(),
        document: form.document,
        phone: form.phone.trim() || undefined,
        password: form.password,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 14 }} keyboardShouldPersistTaps="handled">
        <Muted>
          Crie sua conta de responsável. Depois, a escola vincula seu cadastro ao aluno pelo seu e-mail.
        </Muted>
        <Field label="Nome completo" value={form.name} onChangeText={set('name')} autoComplete="name" />
        <Field
          label="E-mail"
          value={form.email}
          onChangeText={set('email')}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <Field
          label="CPF"
          value={form.document}
          onChangeText={(v) => set('document')(maskCpf(v))}
          keyboardType="number-pad"
          placeholder="000.000.000-00"
        />
        <Field
          label="Celular (opcional)"
          value={form.phone}
          onChangeText={set('phone')}
          keyboardType="phone-pad"
          autoComplete="tel"
        />
        <Field label="Senha" value={form.password} onChangeText={set('password')} secureTextEntry />
        <Field label="Confirmar senha" value={form.confirm} onChangeText={set('confirm')} secureTextEntry />
        <ErrorBox message={error} />
        <Button title="Criar conta" onPress={submit} loading={loading} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
