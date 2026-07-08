import { create } from 'zustand';
import { COACH_API_URL } from '../lib/coach';
import { supabase } from '../lib/supabase';
import { TypeEntrainement } from '../types/base';
import { EtapeDeroulement } from '../types/session';

export type GroupeBrouillon = {
  nom: string;
  allure_basse: number;
  allure_haute: number;
  consignes: string | null;
  ordre: number;
};

export type DraftSession = {
  titre: string;
  type_entrainement: TypeEntrainement;
  heure_rdv: string;
  duree_entrainement_min: number;
  distance_km: number | null;
  point_rdv: string | null;
  deroulement: EtapeDeroulement[];
  groupes: GroupeBrouillon[];
};

async function jetonActuel(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Tu dois être connecté pour demander à Kipper.");
  return token;
}

type CoachStore = {
  brouillon: DraftSession | null;
  dernierBrief: string;
  chargement: boolean;
  erreur: string | null;
  genererPlan: (crewId: string, brief: string) => Promise<void>;
  publierPlan: (crewId: string, creePar: string) => Promise<string>;
  reinitialiser: () => void;
};

export const useCoachStore = create<CoachStore>((set, get) => ({
  brouillon: null,
  dernierBrief: '',
  chargement: false,
  erreur: null,

  genererPlan: async (crewId, brief) => {
    set({ chargement: true, erreur: null, dernierBrief: brief });
    try {
      const token = await jetonActuel();
      const res = await fetch(`${COACH_API_URL}/coach/plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ crew_id: crewId, brief }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.message || "Kipper n'a pas pu générer de plan. Réessaie.");
      }
      set({ brouillon: body.draft as DraftSession, chargement: false });
    } catch (e: any) {
      set({ erreur: e.message ?? 'Erreur inconnue', chargement: false });
      throw e;
    }
  },

  publierPlan: async (crewId, creePar) => {
    const { brouillon } = get();
    if (!brouillon) throw new Error('Aucun brouillon à publier.');
    set({ chargement: true, erreur: null });
    try {
      const token = await jetonActuel();
      const res = await fetch(`${COACH_API_URL}/coach/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ crew_id: crewId, cree_par: creePar, draft: brouillon }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.detail || body.message || 'La publication a échoué. Réessaie.');
      }
      set({ chargement: false });
      return body.session_id as string;
    } catch (e: any) {
      set({ erreur: e.message ?? 'Erreur inconnue', chargement: false });
      throw e;
    }
  },

  reinitialiser: () => set({ brouillon: null, dernierBrief: '', erreur: null, chargement: false }),
}));
