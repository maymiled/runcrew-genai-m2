import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { Profil } from '../types/profil';

type ProfilStore = {
  profil: Profil | null;
  charger: (userId: string) => Promise<void>;
  mettreAJour: (partial: Partial<Profil>) => void;
  reset: () => void;
};

export const useProfilStore = create<ProfilStore>((set) => ({
  profil: null,

  charger: async (userId: string) => {
    const { data } = await supabase.from('profils').select('*').eq('id', userId).single();
    if (data) set({ profil: data as Profil });
  },

  mettreAJour: (partial: Partial<Profil>) =>
    set((state) => ({
      profil: state.profil ? { ...state.profil, ...partial } : null,
    })),

  reset: () => set({ profil: null }),
}));
