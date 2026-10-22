import * as SecureStore from 'expo-secure-store';

/**
 * Keychain/Keystore-backed storage for auth sessions. SecureStore values are size-limited
 * (~2 KB), and Supabase sessions can exceed that, so values are split into chunks.
 */
const CHUNK = 1800;
const safeKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const k = safeKey(key);
    const count = await SecureStore.getItemAsync(`${k}.n`);
    if (count === null) return SecureStore.getItemAsync(k);
    const parts: string[] = [];
    for (let i = 0; i < Number(count); i++) {
      const part = await SecureStore.getItemAsync(`${k}.${i}`);
      if (part === null) return null;
      parts.push(part);
    }
    return parts.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    const k = safeKey(key);
    await this.removeItem(key);
    if (value.length <= CHUNK) return SecureStore.setItemAsync(k, value);
    const chunks = Math.ceil(value.length / CHUNK);
    for (let i = 0; i < chunks; i++) await SecureStore.setItemAsync(`${k}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
    await SecureStore.setItemAsync(`${k}.n`, String(chunks));
  },

  async removeItem(key: string): Promise<void> {
    const k = safeKey(key);
    const count = await SecureStore.getItemAsync(`${k}.n`);
    if (count !== null) {
      for (let i = 0; i < Number(count); i++) await SecureStore.deleteItemAsync(`${k}.${i}`);
      await SecureStore.deleteItemAsync(`${k}.n`);
    }
    await SecureStore.deleteItemAsync(k);
  },
};
