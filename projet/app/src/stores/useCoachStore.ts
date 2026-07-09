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

// ── Mode debug : même contrat d'événements que le backend (agent/loop.py) ────
export type EvenementDebug =
  | { type: 'reasoning'; text: string }
  | { type: 'tool_call'; tool: string; input: Record<string, any> }
  | { type: 'tool_result'; tool: string; output: string; is_error: boolean }
  | { type: 'final'; result: any }
  | { type: 'error'; message: string };

const POLL_INTERVAL_MS = 400;

type CoachStore = {
  brouillon: DraftSession | null;
  dernierBrief: string;
  chargement: boolean;
  erreur: string | null;
  modeDebug: boolean;
  evenementsDebug: EvenementDebug[];
  enCoursDebug: boolean;
  toggleModeDebug: () => void;
  genererPlan: (crewId: string, brief: string) => Promise<void>;
  genererPlanDebug: (crewId: string, brief: string) => Promise<void>;
  publierPlan: (crewId: string, creePar: string) => Promise<string>;
  reinitialiser: () => void;
};

export const useCoachStore = create<CoachStore>((set, get) => ({
  brouillon: null,
  dernierBrief: '',
  chargement: false,
  erreur: null,
  modeDebug: false,
  evenementsDebug: [],
  enCoursDebug: false,

  toggleModeDebug: () => set((s) => ({ modeDebug: !s.modeDebug })),

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

  genererPlanDebug: async (crewId, brief) => {
    set({
      chargement: true,
      enCoursDebug: true,
      erreur: null,
      dernierBrief: brief,
      evenementsDebug: [],
    });
    try {
      const token = await jetonActuel();
      const startRes = await fetch(`${COACH_API_URL}/coach/plan/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ crew_id: crewId, brief }),
      });
      const startBody = await startRes.json();
      if (!startRes.ok) {
        throw new Error(startBody.message || "Kipper n'a pas pu démarrer. Réessaie.");
      }
      const runId = startBody.run_id as string;

      // Polling rapide plutôt que du SSE -- même effet "live" à l'écran (la
      // timeline se remplit étape par étape), fiable sur React Native (fetch
      // n'y supporte pas de façon robuste la lecture d'un flux en continu).
      let since = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        const evRes = await fetch(`${COACH_API_URL}/coach/plan/events/${runId}?since=${since}`);
        const evBody = await evRes.json();
        if (!evRes.ok) {
          throw new Error(evBody.message || 'Le suivi de Kipper a été perdu. Réessaie.');
        }
        if (evBody.events?.length) {
          set((s) => ({ evenementsDebug: [...s.evenementsDebug, ...evBody.events] }));
        }
        since = evBody.next_since;
        if (evBody.done) {
          if (evBody.error) throw new Error(evBody.error);
          set({ brouillon: evBody.result as DraftSession, chargement: false, enCoursDebug: false });
          return;
        }
      }
    } catch (e: any) {
      set({ erreur: e.message ?? 'Erreur inconnue', chargement: false, enCoursDebug: false });
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

  reinitialiser: () =>
    set({
      brouillon: null,
      dernierBrief: '',
      erreur: null,
      chargement: false,
      evenementsDebug: [],
      enCoursDebug: false,
    }),
}));
