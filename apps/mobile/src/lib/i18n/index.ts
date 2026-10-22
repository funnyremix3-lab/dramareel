/* eslint-disable import/no-named-as-default-member -- i18next is used through its default instance on purpose */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { ApiError } from '../api/client';
import en from './en.json';
import hi from './hi.json';

export type AppLanguage = 'en' | 'hi';
export const LANGUAGES: { code: AppLanguage; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
];

const STORAGE_KEY = 'app.language';

function deviceLanguage(): AppLanguage {
  const code = getLocales()[0]?.languageCode;
  return code === 'hi' ? 'hi' : 'en';
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, hi: { translation: hi } },
  lng: deviceLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React already escapes
  returnNull: false,
});

/** Applies the language saved by the user (falls back to the device language). */
export async function restoreLanguage() {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'hi') await i18n.changeLanguage(saved);
  } catch {
    // storage unavailable: keep device language
  }
}

export async function setLanguage(lang: AppLanguage) {
  await i18n.changeLanguage(lang);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // non-fatal
  }
}

export const currentLanguage = (): AppLanguage => (i18n.language === 'hi' ? 'hi' : 'en');

/** Human message for any thrown error, using API error codes where we have translations. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const key = `errors.${err.isNetwork ? 'NETWORK' : err.code}`;
    return i18n.exists(key) ? i18n.t(key) : err.message || i18n.t('common.error');
  }
  return i18n.t('common.error');
}

export default i18n;
