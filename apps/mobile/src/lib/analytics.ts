import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';
import { api } from './api/client';
import type { Me } from './api/types';
import { qk, queryClient } from './query';

/** Must match the API allow-list (apps/api/src/analytics/analytics.controller.ts). */
export type AnalyticsEvent =
  | 'app_open'
  | 'episode_start'
  | 'episode_complete'
  | 'paywall_view'
  | 'unlock_success'
  | 'rewarded_ad_shown'
  | 'search'
  | 'drama_view'
  | 'favorite_add';

type Props = Record<string, string | number | boolean>;

const GUEST_CONSENT_KEY = 'analytics.guestConsent';
const FLUSH_AT = 20;
const FLUSH_EVERY_MS = 30_000;

let queue: { name: AnalyticsEvent; properties: Props; occurredAt: string }[] = [];
let guestConsent = false;
let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Consent: signed-in users follow their server-side `consents.analytics`; guests must opt in on
 * the device (Settings). Without consent, `track` does nothing — events are not even queued.
 */
function consented(): boolean {
  const me = queryClient.getQueryData<Me>(qk.me);
  return me ? me.consents.analytics : guestConsent;
}

export function track(name: AnalyticsEvent, properties: Props = {}) {
  if (!consented()) return;
  queue.push({ name, properties, occurredAt: new Date().toISOString() });
  if (queue.length >= FLUSH_AT) void flush();
}

export async function flush() {
  if (queue.length === 0 || !consented()) {
    if (!consented()) queue = [];
    return;
  }
  const batch = queue.splice(0, 50);
  try {
    await api('/events', {
      method: 'POST',
      body: { platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID', appVersion: Constants.expoConfig?.version, events: batch },
    });
  } catch {
    // Analytics is best effort: drop the batch rather than grow without bound.
  }
}

export async function setGuestAnalyticsConsent(value: boolean) {
  guestConsent = value;
  if (!value) queue = [];
  await AsyncStorage.setItem(GUEST_CONSENT_KEY, value ? '1' : '0').catch(() => undefined);
}

export const guestAnalyticsConsent = () => guestConsent;

export async function initAnalytics() {
  guestConsent = (await AsyncStorage.getItem(GUEST_CONSENT_KEY).catch(() => null)) === '1';
  timer ??= setInterval(() => void flush(), FLUSH_EVERY_MS);
  AppState.addEventListener('change', (s) => {
    if (s !== 'active') void flush();
  });
  track('app_open');
}
