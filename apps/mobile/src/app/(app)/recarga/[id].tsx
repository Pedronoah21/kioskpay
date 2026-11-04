import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { api, type Recharge } from '@/api';
import { useToken } from '@/ctx';
import { brl, parseBrl } from '@/format';
import { Button, Card, colors, ErrorBox, Field, Muted } from '@/ui';

const QUICK = [2000, 5000, 10000];
const MIN_CENTS = 2000;

/** A API pode devolver a imagem com ou sem o prefixo data:. */
function qrImageUri(base64: string) {
  return base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`;
}

export default function RechargeScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const token = useToken();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [charge, setCharge] = useState<Recharge | null>(null);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Enquanto o Pix estiver pendente, consulta a cada 4s se o pagamento caiu
  useEffect(() => {
    if (!charge || charge.status !== 'PENDING') return;
    timer.current = setInterval(async () => {
      try {
        const list = await api.myRecharges(token);
        const updated = list.find((r) => r.id === charge.id);
        if (updated && updated.status !== 'PENDING') setCharge(updated);
      } catch {
        // tenta de novo no próximo ciclo
      }
    }, 4000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [charge, token]);

  async function generate(amountCents: number) {
    setError(null);
    if (amountCents < MIN_CENTS) return setError(`O valor mínimo é ${brl(MIN_CENTS)}.`);
    setLoading(true);
    try {
      setCharge(await api.createPix(token, id, amountCents));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // ---------- Pagamento confirmado ----------
  if (charge?.status === 'PAID') {
    return (
      <View style={{ flex: 1, padding: 24, gap: 16, justifyContent: 'center' }}>
        <Card style={{ alignItems: 'center', paddingVertical: 32 }}>
          <Text style={{ fontSize: 48, color: colors.credit }}>✓</Text>
          <Text style={{ fontSize: 22, fontWeight: '800', color: colors.credit }}>Pagamento confirmado</Text>
          <Muted>
            {brl(charge.amountCents)} já estão no saldo{name ? ` de ${name}` : ''}.
          </Muted>
        </Card>
        <Button title="Voltar" onPress={() => router.back()} />
      </View>
    );
  }

  // ---------- Pix expirado ou cancelado ----------
  if (charge && charge.status !== 'PENDING') {
    return (
      <View style={{ flex: 1, padding: 24, gap: 16, justifyContent: 'center' }}>
        <ErrorBox message="Este Pix expirou ou foi cancelado. Nenhum valor foi cobrado." />
        <Button title="Gerar outro Pix" onPress={() => setCharge(null)} />
      </View>
    );
  }

  // ---------- Pix gerado, aguardando pagamento ----------
  if (charge) {
    return (
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Card style={{ alignItems: 'center', gap: 12 }}>
          <Muted>Pague {brl(charge.amountCents)} pelo app do seu banco</Muted>
          {!!charge.pixQrCodeBase64 && (
            <Image
              source={{ uri: qrImageUri(charge.pixQrCodeBase64) }}
              style={{ width: 240, height: 240 }}
              accessibilityLabel="QR code do Pix"
            />
          )}
          <Muted style={{ textAlign: 'center' }}>
            Aguardando pagamento… esta tela atualiza sozinha quando o Pix for confirmado.
          </Muted>
        </Card>

        {!!charge.pixQrCode && (
          <Card>
            <Text style={{ fontWeight: '700', color: colors.text }}>Pix copia e cola</Text>
            <Text selectable numberOfLines={3} style={{ fontSize: 12, color: colors.muted }}>
              {charge.pixQrCode}
            </Text>
            <Button
              title={copied ? 'Copiado!' : 'Copiar código'}
              variant="secondary"
              onPress={async () => {
                await Clipboard.setStringAsync(charge.pixQrCode!);
                setCopied(true);
                setTimeout(() => setCopied(false), 2500);
              }}
            />
          </Card>
        )}
        <Button title="Cancelar" variant="danger" onPress={() => setCharge(null)} />
      </ScrollView>
    );
  }

  // ---------- Escolha do valor ----------
  const typed = parseBrl(text);
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
      {!!name && <Muted>Recarga para {name}</Muted>}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {QUICK.map((v) => (
          <Pressable
            key={v}
            onPress={() => generate(v)}
            disabled={loading}
            style={({ pressed }) => ({
              flex: 1,
              backgroundColor: colors.card,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              paddingVertical: 18,
              alignItems: 'center',
              opacity: pressed || loading ? 0.6 : 1,
            })}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.primary }}>{brl(v)}</Text>
          </Pressable>
        ))}
      </View>
      <Field
        label="Outro valor"
        value={text}
        onChangeText={setText}
        keyboardType="decimal-pad"
        placeholder="Ex.: 35,00"
      />
      <ErrorBox message={error} />
      <Button
        title={typed ? `Gerar Pix de ${brl(typed)}` : 'Gerar Pix'}
        onPress={() => (typed ? generate(typed) : setError('Digite um valor válido.'))}
        loading={loading}
      />
      <Muted style={{ textAlign: 'center' }}>Valor mínimo: {brl(MIN_CENTS)}</Muted>
    </ScrollView>
  );
}
