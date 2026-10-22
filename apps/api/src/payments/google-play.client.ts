import { readFileSync } from 'node:fs';
import { Inject, Injectable } from '@nestjs/common';
import { importPKCS8, SignJWT } from 'jose';
import { AppException } from '../common/errors/app-exception';
import { ENV, Env } from '../config/env';

/** Subset of androidpublisher v3 `ProductPurchase`. */
export interface PlayProductPurchase {
  orderId?: string;
  /** 0 purchased, 1 canceled, 2 pending */
  purchaseState: number;
  /** 0 yet to be consumed, 1 consumed */
  consumptionState?: number;
  /** 0 yet to be acknowledged, 1 acknowledged */
  acknowledgementState?: number;
  purchaseTimeMillis?: string;
  obfuscatedExternalAccountId?: string;
  regionCode?: string;
}

/** Subset of androidpublisher v3 `SubscriptionPurchaseV2`. */
export interface PlaySubscriptionPurchase {
  subscriptionState:
    | 'SUBSCRIPTION_STATE_ACTIVE'
    | 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'
    | 'SUBSCRIPTION_STATE_ON_HOLD'
    | 'SUBSCRIPTION_STATE_PAUSED'
    | 'SUBSCRIPTION_STATE_CANCELED'
    | 'SUBSCRIPTION_STATE_EXPIRED'
    | 'SUBSCRIPTION_STATE_PENDING'
    | 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED'
    | string;
  latestOrderId?: string;
  linkedPurchaseToken?: string;
  startTime?: string;
  acknowledgementState?: 'ACKNOWLEDGEMENT_STATE_PENDING' | 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' | string;
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
  lineItems?: { productId: string; expiryTime?: string; autoRenewingPlan?: { autoRenewEnabled?: boolean } }[];
}

/** The Google Play calls the payments flow needs; swapped for a fake in tests. */
export interface GooglePlayApi {
  getProductPurchase(sku: string, token: string): Promise<PlayProductPurchase>;
  consumeProduct(sku: string, token: string): Promise<void>;
  getSubscription(token: string): Promise<PlaySubscriptionPurchase>;
  acknowledgeSubscription(sku: string, token: string): Promise<void>;
}

export const GOOGLE_PLAY_API = Symbol('GOOGLE_PLAY_API');

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

/** Minimal androidpublisher v3 client authenticated with a service account (JWT bearer grant). */
@Injectable()
export class GooglePlayHttpClient implements GooglePlayApi {
  private readonly base: string;
  private account?: ServiceAccount;
  private token?: { value: string; expiresAt: number };

  constructor(@Inject(ENV) private readonly env: Env) {
    this.base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(env.GOOGLE_PLAY_PACKAGE_NAME)}`;
  }

  private loadAccount(): ServiceAccount {
    if (this.account) return this.account;
    if (!this.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH) {
      throw new AppException('PAYMENTS_DISABLED', 'Google Play verification is not configured');
    }
    this.account = JSON.parse(readFileSync(this.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH, 'utf8')) as ServiceAccount;
    return this.account;
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const account = this.loadAccount();
    const tokenUri = account.token_uri ?? 'https://oauth2.googleapis.com/token';
    const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/androidpublisher' })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(account.client_email)
      .setAudience(tokenUri)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(await importPKCS8(account.private_key, 'RS256'));
    const res = await fetch(tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Google OAuth failed: ${res.status}`);
    const body = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return body.access_token;
  }

  private async call<T>(method: 'GET' | 'POST', path: string): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${await this.accessToken()}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404 || res.status === 400 || res.status === 410) {
      throw new AppException('PAYMENT_VERIFICATION_FAILED', 'Purchase not found or invalid');
    }
    if (!res.ok) throw new Error(`Google Play API ${method} ${path.split('/tokens/')[0]} failed: ${res.status}`);
    const text = await res.text();
    return (text ? JSON.parse(text) : {}) as T;
  }

  getProductPurchase(sku: string, token: string) {
    return this.call<PlayProductPurchase>('GET', `/purchases/products/${encodeURIComponent(sku)}/tokens/${encodeURIComponent(token)}`);
  }

  async consumeProduct(sku: string, token: string) {
    await this.call('POST', `/purchases/products/${encodeURIComponent(sku)}/tokens/${encodeURIComponent(token)}:consume`);
  }

  getSubscription(token: string) {
    return this.call<PlaySubscriptionPurchase>('GET', `/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`);
  }

  async acknowledgeSubscription(sku: string, token: string) {
    await this.call('POST', `/purchases/subscriptions/${encodeURIComponent(sku)}/tokens/${encodeURIComponent(token)}:acknowledge`);
  }
}
