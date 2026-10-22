import { Inject, Injectable, Logger } from '@nestjs/common';
import { PaymentTransaction, Prisma, SubscriptionStatus } from '@prisma/client';
import { AppException } from '../common/errors/app-exception';
import { PrismaService } from '../common/prisma/prisma.service';
import { ENV, Env } from '../config/env';
import { ENTITLED_SUBSCRIPTION_STATUSES } from '../entitlements/entitlement';
import { WalletService } from '../wallet/wallet.service';
import { GOOGLE_PLAY_API, GooglePlayApi, PlaySubscriptionPurchase } from './google-play.client';

const isUniqueViolation = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

export function mapPlaySubscriptionState(state: string): SubscriptionStatus | null {
  switch (state) {
    case 'SUBSCRIPTION_STATE_ACTIVE':
      return 'ACTIVE';
    case 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD':
      return 'IN_GRACE_PERIOD';
    case 'SUBSCRIPTION_STATE_ON_HOLD':
    case 'SUBSCRIPTION_STATE_PAUSED':
      return 'ON_HOLD';
    case 'SUBSCRIPTION_STATE_CANCELED':
      return 'CANCELED';
    case 'SUBSCRIPTION_STATE_EXPIRED':
      return 'EXPIRED';
    default:
      return null; // pending states: nothing to grant yet
  }
}

/** RTDN payload (base64-decoded Pub/Sub message data). */
export interface RtdnMessage {
  packageName?: string;
  subscriptionNotification?: { notificationType: number; purchaseToken: string; subscriptionId: string };
  oneTimeProductNotification?: { notificationType: number; purchaseToken: string; sku: string };
  voidedPurchaseNotification?: { purchaseToken: string; orderId: string; productType: number; refundType?: number };
  testNotification?: { version: string };
}

/**
 * Server-side purchase verification (docs/architecture.md §3.4). Nothing is granted from client
 * claims: every purchase token is re-fetched from Google, bound to the buyer's account id, and
 * fulfilled exactly once (unique order id + ledger idempotency key).
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    @Inject(GOOGLE_PLAY_API) private readonly play: GooglePlayApi,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async products() {
    const rows = await this.prisma.product.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
    return {
      paymentsEnabled: this.env.PAYMENTS_ENABLED,
      items: rows.map((p) => ({
        sku: p.sku,
        kind: p.kind,
        title: p.title,
        coins: p.coins,
        bonusCoins: p.bonusCoins,
        periodDays: p.periodDays,
        adFree: p.adFree,
      })),
    };
  }

  private assertEnabled() {
    if (!this.env.PAYMENTS_ENABLED) throw new AppException('PAYMENTS_DISABLED', 'Purchases are not available yet');
  }

  async verifyGooglePlay(userId: string, sku: string, purchaseToken: string) {
    this.assertEnabled();
    const product = await this.prisma.product.findUnique({ where: { sku } });
    if (!product || !product.isActive) throw new AppException('NOT_FOUND', 'Product not found');

    const prior = await this.prisma.paymentTransaction.findFirst({ where: { provider: 'GOOGLE_PLAY', purchaseToken } });
    if (prior && prior.userId !== userId) {
      throw new AppException('CONFLICT', 'This purchase belongs to another account');
    }

    return product.kind === 'COIN_PACK'
      ? this.fulfilCoinPack(userId, product, purchaseToken)
      : this.syncSubscription(userId, product, purchaseToken);
  }

  private async fulfilCoinPack(userId: string, product: { id: string; sku: string; coins: number | null; bonusCoins: number }, token: string) {
    const purchase = await this.play.getProductPurchase(product.sku, token);
    if (purchase.purchaseState === 2) return { status: 'PENDING' as const, balance: await this.wallet.balance(userId) };
    if (purchase.purchaseState !== 0 || !purchase.orderId) {
      throw new AppException('PAYMENT_VERIFICATION_FAILED', 'Purchase is not in a purchased state');
    }
    // The app sets obfuscatedAccountIdAndroid = our user id when launching the billing flow.
    if (purchase.obfuscatedExternalAccountId && purchase.obfuscatedExternalAccountId !== userId) {
      throw new AppException('PAYMENT_VERIFICATION_FAILED', 'Purchase was made for a different account');
    }
    const coins = (product.coins ?? 0) + product.bonusCoins;
    if (coins <= 0) throw new AppException('INTERNAL', 'Coin pack has no coins configured');

    let payment: PaymentTransaction;
    try {
      payment = await this.prisma.$transaction(async (tx) => {
        const row = await tx.paymentTransaction.upsert({
          where: { provider_providerTransactionId: { provider: 'GOOGLE_PLAY', providerTransactionId: purchase.orderId! } },
          create: {
            userId,
            productId: product.id,
            provider: 'GOOGLE_PLAY',
            providerTransactionId: purchase.orderId!,
            purchaseToken: token,
            status: 'VERIFIED',
            verifiedAt: new Date(),
            verificationPayload: { purchaseState: purchase.purchaseState, regionCode: purchase.regionCode ?? null },
          },
          update: {},
        });
        if (row.userId !== userId) throw new AppException('CONFLICT', 'This purchase belongs to another account');
        if (row.status === 'FULFILLED' || row.status === 'REFUNDED' || row.status === 'REVOKED') return row;

        await this.wallet.post(tx, {
          userId,
          amount: coins,
          type: 'PURCHASE',
          idempotencyKey: `purchase:${row.id}`,
          referenceType: 'payment',
          referenceId: row.id,
        });
        return tx.paymentTransaction.update({ where: { id: row.id }, data: { status: 'FULFILLED', fulfilledAt: new Date() } });
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppException('CONFLICT', 'Purchase is being processed, retry shortly');
      throw err;
    }

    // Consume so the pack can be bought again. Safe to retry; Google treats repeats as no-ops.
    if (payment.status === 'FULFILLED' && purchase.consumptionState !== 1) {
      await this.play.consumeProduct(product.sku, token).catch((err: Error) => this.logger.error(`consume failed: ${err.message}`));
    }
    return { status: payment.status, paymentId: payment.id, balance: await this.wallet.balance(userId) };
  }

  /** Verifies a subscription token and upserts our entitlement row. Used by verify and by RTDN. */
  async syncSubscription(userId: string, product: { id: string; sku: string }, token: string, known?: PlaySubscriptionPurchase) {
    const sub = known ?? (await this.play.getSubscription(token));
    const line = sub.lineItems?.find((l) => l.productId === product.sku);
    if (!line?.expiryTime) throw new AppException('PAYMENT_VERIFICATION_FAILED', 'Subscription does not match this product');
    const owner = sub.externalAccountIdentifiers?.obfuscatedExternalAccountId;
    if (owner && owner !== userId) throw new AppException('PAYMENT_VERIFICATION_FAILED', 'Subscription belongs to a different account');

    const status = mapPlaySubscriptionState(sub.subscriptionState);
    if (!status) return { status: 'PENDING' as const, subscription: null };
    const periodEnd = new Date(line.expiryTime);

    const subscription = await this.prisma.$transaction(async (tx) => {
      // Upgrades/re-subscribes chain tokens: retire the row for the previous token.
      if (sub.linkedPurchaseToken) {
        await tx.subscription.updateMany({
          where: { provider: 'GOOGLE_PLAY', providerSubscriptionId: sub.linkedPurchaseToken, userId },
          data: { status: 'EXPIRED', autoRenew: false },
        });
      }
      const row = await tx.subscription.upsert({
        where: { provider_providerSubscriptionId: { provider: 'GOOGLE_PLAY', providerSubscriptionId: token } },
        create: {
          userId,
          productId: product.id,
          provider: 'GOOGLE_PLAY',
          providerSubscriptionId: token,
          status,
          currentPeriodStart: sub.startTime ? new Date(sub.startTime) : new Date(),
          currentPeriodEnd: periodEnd,
          autoRenew: line.autoRenewingPlan?.autoRenewEnabled ?? false,
          canceledAt: status === 'CANCELED' ? new Date() : null,
        },
        update: {
          status,
          currentPeriodEnd: periodEnd,
          autoRenew: line.autoRenewingPlan?.autoRenewEnabled ?? false,
          ...(status === 'CANCELED' ? { canceledAt: new Date() } : {}),
        },
      });
      if (row.userId !== userId) throw new AppException('CONFLICT', 'This subscription belongs to another account');

      if (sub.latestOrderId) {
        await tx.paymentTransaction.upsert({
          where: { provider_providerTransactionId: { provider: 'GOOGLE_PLAY', providerTransactionId: sub.latestOrderId } },
          create: {
            userId,
            productId: product.id,
            provider: 'GOOGLE_PLAY',
            providerTransactionId: sub.latestOrderId,
            purchaseToken: token,
            status: 'FULFILLED',
            verifiedAt: new Date(),
            fulfilledAt: new Date(),
            verificationPayload: { subscriptionState: sub.subscriptionState },
          },
          update: {},
        });
      }
      return row;
    });

    if (sub.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING' && (status === 'ACTIVE' || status === 'IN_GRACE_PERIOD')) {
      await this.play.acknowledgeSubscription(product.sku, token).catch((err: Error) => this.logger.error(`acknowledge failed: ${err.message}`));
    }
    return {
      status: subscription.status,
      subscription: { sku: product.sku, status: subscription.status, currentPeriodEnd: subscription.currentPeriodEnd, autoRenew: subscription.autoRenew },
    };
  }

  /** Real-time developer notification (already authenticated by the controller). */
  async handleRtdn(message: RtdnMessage): Promise<string> {
    if (message.testNotification) return 'test';
    if (message.packageName && message.packageName !== this.env.GOOGLE_PLAY_PACKAGE_NAME) return 'ignored: package';

    if (message.subscriptionNotification) {
      const { purchaseToken, subscriptionId } = message.subscriptionNotification;
      const product = await this.prisma.product.findUnique({ where: { sku: subscriptionId } });
      if (!product) return 'ignored: unknown product';
      const sub = await this.play.getSubscription(purchaseToken);
      const userId =
        (await this.prisma.subscription.findUnique({
          where: { provider_providerSubscriptionId: { provider: 'GOOGLE_PLAY', providerSubscriptionId: purchaseToken } },
        }))?.userId ?? sub.externalAccountIdentifiers?.obfuscatedExternalAccountId;
      if (!userId || !(await this.prisma.user.findUnique({ where: { id: userId } }))) return 'ignored: unknown user';
      await this.syncSubscription(userId, product, purchaseToken, sub);
      return 'subscription synced';
    }

    if (message.voidedPurchaseNotification) {
      return this.handleVoided(message.voidedPurchaseNotification.orderId);
    }

    if (message.oneTimeProductNotification?.notificationType === 1) {
      // Purchased: fulfil if the app never reached our verify endpoint (crash, network loss).
      const { purchaseToken, sku } = message.oneTimeProductNotification;
      const product = await this.prisma.product.findUnique({ where: { sku } });
      if (!product || product.kind !== 'COIN_PACK') return 'ignored: unknown product';
      const purchase = await this.play.getProductPurchase(sku, purchaseToken);
      const userId = purchase.obfuscatedExternalAccountId;
      if (!userId || !(await this.prisma.user.findUnique({ where: { id: userId } }))) return 'ignored: unknown user';
      await this.fulfilCoinPack(userId, product, purchaseToken);
      return 'coin pack fulfilled';
    }
    return 'ignored';
  }

  /** Refund/chargeback: take the coins back (never below zero) or revoke the subscription. */
  async handleVoided(orderId: string): Promise<string> {
    const payment = await this.prisma.paymentTransaction.findUnique({
      where: { provider_providerTransactionId: { provider: 'GOOGLE_PLAY', providerTransactionId: orderId } },
      include: { product: true },
    });
    if (!payment) return 'ignored: unknown order';
    if (payment.status === 'REFUNDED' || payment.status === 'REVOKED') return 'already voided';

    if (payment.product.kind === 'COIN_PACK') {
      const coins = (payment.product.coins ?? 0) + payment.product.bonusCoins;
      const result = await this.prisma.$transaction(async (tx) => {
        const r = await this.wallet.post(tx, {
          userId: payment.userId,
          amount: -coins,
          type: 'REVERSAL',
          idempotencyKey: `refund:${payment.id}`,
          referenceType: 'payment',
          referenceId: payment.id,
          note: `Refund of order ${orderId}`,
          clampToBalance: true,
        });
        await tx.paymentTransaction.update({ where: { id: payment.id }, data: { status: 'REFUNDED', refundedAt: new Date() } });
        await tx.auditLog.create({
          data: {
            action: 'payment.refunded',
            entityType: 'payment',
            entityId: payment.id,
            after: { coinsReversed: r.transaction ? -r.transaction.amount : 0, shortfall: r.shortfall },
          },
        });
        return r;
      });
      if (result.shortfall > 0) this.logger.warn({ userId: payment.userId, orderId, shortfall: result.shortfall }, 'refund shortfall — coins already spent');
      return 'coin pack refunded';
    }

    await this.prisma.$transaction([
      this.prisma.paymentTransaction.update({ where: { id: payment.id }, data: { status: 'REVOKED', refundedAt: new Date() } }),
      this.prisma.subscription.updateMany({
        where: { provider: 'GOOGLE_PLAY', providerSubscriptionId: payment.purchaseToken ?? '' },
        data: { status: 'REVOKED', autoRenew: false },
      }),
    ]);
    return 'subscription revoked';
  }

  async mySubscription(userId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { userId, status: { in: [...ENTITLED_SUBSCRIPTION_STATUSES] }, currentPeriodEnd: { gt: new Date() } },
      include: { product: true },
      orderBy: { currentPeriodEnd: 'desc' },
    });
    return sub
      ? { sku: sub.product.sku, status: sub.status, currentPeriodEnd: sub.currentPeriodEnd, autoRenew: sub.autoRenew, adFree: sub.product.adFree }
      : null;
  }
}
