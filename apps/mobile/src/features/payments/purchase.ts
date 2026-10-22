import { Platform } from 'react-native';
import {
  ErrorCode,
  fetchProducts,
  finishTransaction,
  initConnection,
  Purchase,
  PurchaseError,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
} from 'react-native-iap';
import { Api } from '@/lib/api/endpoints';

export type PurchaseResult = { status: 'fulfilled' | 'pending' } | { status: 'cancelled' } | { status: 'failed'; message: string };

let connected: Promise<boolean> | null = null;
const ensureConnection = () => (connected ??= initConnection().catch(() => ((connected = null), false)));

/** Localised store prices for our SKUs (shown next to server-defined products). */
export async function storePrices(skus: { inApp: string[]; subs: string[] }): Promise<Record<string, string>> {
  if (Platform.OS !== 'android' || !(await ensureConnection())) return {};
  const prices: Record<string, string> = {};
  const [inApp, subs] = await Promise.all([
    skus.inApp.length ? fetchProducts({ skus: skus.inApp, type: 'in-app' }).catch(() => []) : [],
    skus.subs.length ? fetchProducts({ skus: skus.subs, type: 'subs' }).catch(() => []) : [],
  ]);
  for (const p of [...(inApp ?? []), ...(subs ?? [])]) prices[p.id] = p.displayPrice;
  return prices;
}

/**
 * Google Play purchase → our server verifies and fulfils → transaction finished.
 * Coins/VIP are granted ONLY by the server response, never by the store callback alone.
 */
export async function purchase(sku: string, kind: 'COIN_PACK' | 'SUBSCRIPTION', userId: string): Promise<PurchaseResult> {
  if (Platform.OS !== 'android') return { status: 'failed', message: 'Purchases are available on Android first' };
  if (!(await ensureConnection())) return { status: 'failed', message: 'Google Play is not available' };

  let offerToken: string | null | undefined;
  if (kind === 'SUBSCRIPTION') {
    const [product] = (await fetchProducts({ skus: [sku], type: 'subs' })) ?? [];
    const offers = (product as { subscriptionOffers?: { offerTokenAndroid?: string | null }[] } | undefined)?.subscriptionOffers;
    offerToken = offers?.[0]?.offerTokenAndroid;
    if (!offerToken) return { status: 'failed', message: 'Subscription is not available' };
  }

  return new Promise<PurchaseResult>((resolve) => {
    let settled = false;
    const done = (r: PurchaseResult) => {
      if (settled) return;
      settled = true;
      updated.remove();
      failed.remove();
      resolve(r);
    };

    const updated = purchaseUpdatedListener(async (p: Purchase) => {
      if (p.productId !== sku || !p.purchaseToken) return;
      try {
        const result = await Api.verifyGooglePlay(sku, p.purchaseToken);
        if (result.status === 'PENDING') return done({ status: 'pending' });
        // Server already consumed/acknowledged; finishing locally clears the client queue.
        await finishTransaction({ purchase: p, isConsumable: kind === 'COIN_PACK' }).catch(() => undefined);
        done({ status: 'fulfilled' });
      } catch (err) {
        done({ status: 'failed', message: (err as Error).message });
      }
    });
    const failed = purchaseErrorListener((e: PurchaseError) => {
      done(e.code === ErrorCode.UserCancelled ? { status: 'cancelled' } : { status: 'failed', message: e.message });
    });

    const google = { skus: [sku], obfuscatedAccountId: userId };
    const request =
      kind === 'SUBSCRIPTION'
        ? requestPurchase({ type: 'subs', request: { google: { ...google, subscriptionOffers: [{ sku, offerToken: offerToken! }] } } })
        : requestPurchase({ type: 'in-app', request: { google } });
    request.catch((err: Error) => done({ status: 'failed', message: err.message }));
  });
}
