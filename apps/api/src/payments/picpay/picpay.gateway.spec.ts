import { ConfigService } from '@nestjs/config';
import { PicPayGateway } from './picpay.gateway';

const gateway = new PicPayGateway(
  new ConfigService({ PICPAY_BASE_URL: 'https://ecommerce-api.svcp.ppay.me', PICPAY_WEBHOOK_TOKEN: 'segredo-123' }),
);

describe('PicPayGateway', () => {
  it('normaliza os status de cobrança', () => {
    expect(PicPayGateway.normalize('PAID')).toBe('PAID');
    expect(PicPayGateway.normalize('DENIED')).toBe('CANCELED');
    expect(PicPayGateway.normalize('REFUNDED')).toBe('REFUNDED');
    expect(PicPayGateway.normalize('CHARGEBACK')).toBe('CHARGEBACK');
    expect(PicPayGateway.normalize('PRE_AUTHORIZED')).toBe('PENDING');
    expect(PicPayGateway.normalize('PRE_AUTHORIZED', [{ transactionStatus: 'EXPIRED' }])).toBe('CANCELED');
  });

  it('valida o token do webhook', () => {
    expect(gateway.verifyWebhook({ authorization: 'segredo-123' })).toBe(true);
    expect(gateway.verifyWebhook({ authorization: 'Bearer segredo-123' })).toBe(true);
    expect(gateway.verifyWebhook({ authorization: 'errado' })).toBe(false);
    expect(gateway.verifyWebhook({})).toBe(false);
  });

  it('lê o payload do webhook de pagamento Pix', () => {
    const result = gateway.parseWebhook({
      type: 'PAYMENT',
      id: 'evt-1',
      data: { status: 'PAID', amount: 10000, merchantChargeId: 'rc-abc123', transactions: [] },
    });
    expect(result).toEqual({ eventId: 'evt-1', chargeId: 'rc-abc123', status: 'PAID', paidAmountCents: 10000 });
  });
});
