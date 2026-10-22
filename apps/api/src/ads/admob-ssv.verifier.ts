import { createPublicKey, KeyObject, verify } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV, Env } from '../config/env';

/** Source of AdMob verifier public keys, keyed by key_id. Swappable in tests. */
export interface SsvKeySource {
  getKey(keyId: string): Promise<KeyObject | undefined>;
}

export const SSV_KEY_SOURCE = Symbol('SSV_KEY_SOURCE');
const KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';
const CACHE_MS = 24 * 60 * 60 * 1000;

/** Fetches Google's published keys, caches them for 24 h and refreshes on an unknown key id. */
@Injectable()
export class GoogleSsvKeySource implements SsvKeySource {
  private readonly logger = new Logger(GoogleSsvKeySource.name);
  private keys = new Map<string, KeyObject>();
  private fetchedAt = 0;
  private inflight?: Promise<void>;

  async getKey(keyId: string): Promise<KeyObject | undefined> {
    if (!this.keys.has(keyId) || Date.now() - this.fetchedAt > CACHE_MS) {
      // Throttle refreshes triggered by unknown ids to at most once a minute.
      if (Date.now() - this.fetchedAt > 60_000 || !this.keys.size) await this.refresh();
    }
    return this.keys.get(keyId);
  }

  private refresh(): Promise<void> {
    this.inflight ??= (async () => {
      try {
        const res = await fetch(KEYS_URL, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { keys: { keyId: number | string; pem: string }[] };
        this.keys = new Map(body.keys.map((k) => [String(k.keyId), createPublicKey(k.pem)]));
        this.fetchedAt = Date.now();
      } catch (err) {
        this.logger.error(`Could not fetch AdMob verifier keys: ${(err as Error).message}`);
      } finally {
        this.inflight = undefined;
      }
    })();
    return this.inflight;
  }
}

export interface SsvParams {
  adNetwork?: string;
  adUnit: string;
  customData: string;
  rewardAmount: number;
  rewardItem?: string;
  timestamp: number;
  transactionId: string;
  userId: string;
  keyId: string;
}

export type SsvResult = { ok: true; params: SsvParams } | { ok: false; reason: string };

/**
 * Verifies an AdMob rewarded-ad server-side verification callback.
 * Per Google: the signed content is the raw query string up to (not including) `&signature=`;
 * `signature` (web-safe base64, DER ECDSA/SHA-256) and `key_id` are always the last two params.
 */
@Injectable()
export class AdmobSsvVerifier {
  constructor(
    @Inject(SSV_KEY_SOURCE) private readonly keys: SsvKeySource,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async verify(rawQuery: string): Promise<SsvResult> {
    const sigIndex = rawQuery.indexOf('&signature=');
    if (sigIndex <= 0) return { ok: false, reason: 'missing signature' };
    const signedContent = rawQuery.slice(0, sigIndex);

    const tail = new URLSearchParams(rawQuery.slice(sigIndex + 1));
    const signature = tail.get('signature');
    const keyId = tail.get('key_id');
    if (!signature || !keyId) return { ok: false, reason: 'missing signature or key_id' };

    const key = await this.keys.getKey(keyId);
    if (!key) return { ok: false, reason: `unknown key_id ${keyId}` };

    let valid = false;
    try {
      valid = verify('sha256', Buffer.from(signedContent, 'utf8'), key, Buffer.from(signature, 'base64url'));
    } catch {
      valid = false;
    }
    if (!valid) return { ok: false, reason: 'bad signature' };

    const q = new URLSearchParams(signedContent);
    const params: SsvParams = {
      adNetwork: q.get('ad_network') ?? undefined,
      adUnit: q.get('ad_unit') ?? '',
      customData: q.get('custom_data') ?? '',
      rewardAmount: Number(q.get('reward_amount') ?? 0),
      rewardItem: q.get('reward_item') ?? undefined,
      timestamp: Number(q.get('timestamp') ?? 0),
      transactionId: q.get('transaction_id') ?? '',
      userId: q.get('user_id') ?? '',
      keyId,
    };
    if (!params.transactionId || !params.customData || !params.userId) {
      return { ok: false, reason: 'missing transaction_id, custom_data or user_id' };
    }
    // Reject stale callbacks (Google retries for a limited time); timestamp is in ms.
    if (!params.timestamp || Math.abs(Date.now() - params.timestamp) > this.env.ADMOB_SSV_MAX_AGE_SECONDS * 1000) {
      return { ok: false, reason: 'stale or missing timestamp' };
    }
    return { ok: true, params };
  }
}
