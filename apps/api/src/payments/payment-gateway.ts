/**
 * Contrato que todo provedor de pagamento implementa (PicPay, Stone/Pagar.me...).
 * O resto do sistema só conhece esta interface.
 */

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export interface PayerInfo {
  name: string;
  email: string;
  document: string; // CPF só com dígitos
  phone?: { areaCode: string; number: string };
}

export interface CreatePixChargeInput {
  chargeId: string; // nosso identificador único (6-36, [a-zA-Z0-9-])
  amountCents: number;
  payer: PayerInfo;
  expirationSeconds?: number;
  clientIp?: string;
}

export interface PixCharge {
  gatewayRef: string;
  qrCode: string; // Pix copia e cola
  qrCodeBase64?: string;
  expiresAt: Date;
}

export type NormalizedStatus = 'PENDING' | 'PAID' | 'CANCELED' | 'REFUNDED' | 'CHARGEBACK';

export interface WebhookResult {
  eventId: string;
  chargeId: string;
  status: NormalizedStatus;
  paidAmountCents?: number;
}

export interface PaymentGateway {
  readonly name: string;
  createPixCharge(input: CreatePixChargeInput): Promise<PixCharge>;
  getChargeStatus(chargeId: string): Promise<NormalizedStatus>;
  refund(chargeId: string, amountCents?: number): Promise<void>;
  /** Valida a autenticidade da notificação. */
  verifyWebhook(headers: Record<string, string | string[] | undefined>, body: unknown): boolean;
  /** Converte o corpo da notificação para o formato interno. */
  parseWebhook(body: unknown): WebhookResult;
}
