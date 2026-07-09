import { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { supabase } from '../lib/supabase';

type AuthStore = {
  session: Session | null;
  charge: boolean;
  initialiser: () => void;
  seConnecter: (email: string, mdp: string) => Promise<void>;
  sInscrire: (email: string, mdp: string, nom: string) => Promise<void>;
  seDeconnecter: () => Promise<void>;
};

// Guard contre les souscriptions multiples (hot reload, double-mount StrictMode)
let _subscription: { unsubscribe: () => void } | null = null;

export const useAuthStore = create<AuthStore>((set) => ({
  session: null,
  charge: true,

  initialiser: () => {
    if (_subscription) return;

    supabase.auth.getSession().then(({ data: { session } }) => {
      set({ session, charge: false });
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      set({ session });
    });

    _subscription = subscription;
  },

  seConnecter: async (email, mdp) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: mdp,
    });
    if (error) throw error;
  },

  sInscrire: async (email, mdp, nom) => {
    const { error } = await supabase.auth.signUp({
      email,
      password: mdp,
      options: {
        data: { display_name: nom },
      },
    });
    if (error) throw error;
  },

  seDeconnecter: async () => {
    await supabase.auth.signOut();
    set({ session: null });
  },
}));