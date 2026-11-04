import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import {
  CreatePixChargeInput,
  NormalizedStatus,
  PaymentGateway,
  PixCharge,
  WebhookResult,
} from '../payment-gateway';

/**
 * Adaptador PicPay — API Pix (E-commerce PicPay).
 * Docs: https://developers-business.picpay.com/pix/docs/introduction
 *
 * - Token: POST /oauth2/token (client_credentials), válido por 5 minutos
 * - Cobrança: POST /charge/pix  (amount em centavos, expiration em segundos)
 * - Consulta: GET /charge/{merchantChargeId}
 * - Estorno: /charge/{merchantChargeId}/refund
 * - Webhook: POST com header Authorization = token gerado no Painel Lojista
 *
 * Itens a confirmar no sandbox (a documentação pública não detalha):
 *   formato da resposta do /oauth2/token, corpo do /refund.
 */
@Injectable()
export class PicPayGateway implements PaymentGateway {
  readonly name = 'picpay';
  private readonly logger = new Logger(PicPayGateway.name);
  private token?: { value: string; expiresAt: number };

  constructor(private readonly config: ConfigService) {}

  private get baseUrl() {
    return this.config.getOrThrow<string>('PICPAY_BASE_URL').replace(/\/$/, '');
  }

  private async accessToken(): Promise<string> {
    // Renova 30s antes de expirar
    if (this.token && Date.now() < this.token.expiresAt - 30_000) return this.token.value;

    const res = await fetch(`${this.baseUrl}/oauth2/token`, {
      method: 'POST',
      headers: { accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: this.config.getOrThrow('PICPAY_CLIENT_ID'),
        client_secret: this.config.getOrThrow('PICPAY_CLIENT_SECRET'),
      }),
    });
    if (!res.ok) throw new Error(`PicPay auth falhou: HTTP ${res.status}`);
    const json: any = await res.json();
    const value = json.access_token ?? json.accessToken;
    if (!value) throw new Error('PicPay auth: resposta sem access_token');
    const ttlSeconds = Number(json.expires_in ?? json.expiresIn ?? 300);
    this.token = { value, expiresAt: Date.now() + ttlSeconds * 1000 };
    return value;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await this.accessToken()}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) {
      const detail = json?.errors?.map((e: any) => `${e.field}: ${e.message}`).join('; ');
      throw new Error(`PicPay ${method} ${path}: HTTP ${res.status} ${json?.message ?? ''} ${detail ?? ''}`.trim());
    }
    return json as T;
  }

  async createPixCharge(input: CreatePixChargeInput): Promise<PixCharge> {
    const expiration =
      input.expirationSeconds ?? Number(this.config.get('PICPAY_PIX_EXPIRATION') ?? 900);

    const payload: any = {
      paymentSource: 'GATEWAY',
      merchantChargeId: input.chargeId,
      customer: {
        name: input.payer.name,
        email: input.payer.email,
        documentType: 'CPF',
        document: input.payer.document.replace(/\D/g, ''),
        ...(input.payer.phone && {
          phone: {
            countryCode: '55',
            areaCode: input.payer.phone.areaCode,
            number: input.payer.phone.number,
            type: 'MOBILE',
          },
        }),
      },
      transactions: [{ amount: input.amountCents, pix: { expiration } }],
      ...(input.clientIp && { deviceInformation: { ip: input.clientIp } }),
    };

    const res: any = await this.request('POST', '/charge/pix', payload);
    const pix = res.transactions?.[0]?.pix;
    if (!pix?.qrCode) throw new Error('PicPay: resposta sem QR code');

    return {
      gatewayRef: res.id,
      qrCode: pix.qrCode,
      qrCodeBase64: pix.qrCodeBase64,
      expiresAt: new Date(Date.now() + expiration * 1000),
    };
  }

  async getChargeStatus(chargeId: string): Promise<NormalizedStatus> {
    const res: any = await this.request('GET', `/charge/${encodeURIComponent(chargeId)}`);
    return PicPayGateway.normalize(res.chargeStatus ?? res.status, res.transactions);
  }

  async refund(chargeId: string, amountCents?: number): Promise<void> {
    // Corpo a confirmar no sandbox; sem amount = estorno integral
    await this.request(
      'POST',
      `/charge/${encodeURIComponent(chargeId)}/refund`,
      amountCents ? { amount: amountCents } : {},
    );
  }

  verifyWebhook(headers: Record<string, string | string[] | undefined>): boolean {
    const expected = this.config.get<string>('PICPAY_WEBHOOK_TOKEN');
    const received = headers['authorization'];
    if (!expected || typeof received !== 'string') return false;
    const clean = received.replace(/^Bearer\s+/i, '');
    const a = Buffer.from(clean);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  parseWebhook(body: any): WebhookResult {
    const data = body?.data ?? {};
    if (!data.merchantChargeId) throw new Error('Webhook PicPay sem merchantChargeId');
    return {
      eventId: String(body.id ?? `${data.merchantChargeId}:${data.status}`),
      chargeId: data.merchantChargeId,
      status: PicPayGateway.normalize(data.status, data.transactions),
      paidAmountCents: typeof data.amount === 'number' ? data.amount : undefined,
    };
  }

  /** chargeStatus PicPay: CANCELED, DENIED, ERROR, PAID, PARTIAL, PRE_AUTHORIZED, REFUNDED, CHARGEBACK */
  static normalize(status: string | undefined, transactions?: any[]): NormalizedStatus {
    switch (status) {
      case 'PAID':
        return 'PAID';
      case 'REFUNDED':
        return 'REFUNDED';
      case 'CHARGEBACK':
        return 'CHARGEBACK';
      case 'CANCELED':
      case 'DENIED':
      case 'ERROR':
        return 'CANCELED';
      default: {
        const expired = transactions?.some((t) => (t.transactionStatus ?? t.status) === 'EXPIRED');
        return expired ? 'CANCELED' : 'PENDING';
      }
    }
  }
}
