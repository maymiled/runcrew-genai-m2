import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const SUPABASE_URL = 'https://avvzilnglmosjbfqxoda.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2dnppbG5nbG1vc2piZnF4b2RhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5ODI3MjMsImV4cCI6MjA5MzU1ODcyM30.22Oz0XQrawoL5FQ69CXpD5iyAjkCThztGyfYoGt22s0';

const WebStorageAdapter = {
  getItem: (key: string) => {
    if (typeof window !== 'undefined') {
      return Promise.resolve(window.sessionStorage.getItem(key));
    }
    return Promise.resolve(null);
  },
  setItem: (key: string, value: string) => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(key, value);
    }
    return Promise.resolve();
  },
  removeItem: (key: string) => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(key);
    }
    return Promise.resolve();
  },
};

async function getStorageAdapter() {
  if (Platform.OS === 'web') {
    return WebStorageAdapter;
  }
  const SecureStore = await import('expo-secure-store');
  return {
    getItem: (key: string) => SecureStore.getItemAsync(key),
    setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
    removeItem: (key: string) => SecureStore.deleteItemAsync(key),
  };
}

const storage = Platform.OS === 'web' ? WebStorageAdapter : undefined;

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      ...(storage && { storage }),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);