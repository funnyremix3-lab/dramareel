import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Quality } from './logic';

interface PlayerPrefs {
  quality: Quality;
  speed: number;
  setQuality: (q: Quality) => void;
  setSpeed: (s: number) => void;
}

/** Remembered across sessions: chosen quality and playback speed. */
export const usePlayerPrefs = create<PlayerPrefs>()(
  persist(
    (set) => ({
      quality: 'auto',
      speed: 1,
      setQuality: (quality) => set({ quality }),
      setSpeed: (speed) => set({ speed }),
    }),
    { name: 'player-prefs', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
