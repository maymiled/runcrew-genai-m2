import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { TypeEntrainement } from '../types/base';
import { EtapeDeroulement } from '../types/session';

type NouveauGroupe = {
  nom: string;
  allure_basse: number;
  allure_haute: number;
  consignes: string | null;
  ordre: number;
};

type ParamsCreerSession = {
  crew_id: string;
  cree_par: string;
  titre: string;
  description: string | null;
  type_entrainement: TypeEntrainement;
  heure_rdv: string;
  duree_entrainement_min: number | null;
  distance_km: number | null;
  point_rdv: string | null;
  deroulement: EtapeDeroulement[];
  groupes: NouveauGroupe[];
};

type ParamsModifierSession = Omit<ParamsCreerSession, 'crew_id' | 'cree_par'>;

type SessionStore = {
  creerSession: (params: ParamsCreerSession) => Promise<string>;
  modifierSession: (sessionId: string, params: ParamsModifierSession) => Promise<void>;
};

export const useSessionStore = create<SessionStore>(() => ({
  creerSession: async ({ groupes, deroulement, ...sessionData }) => {
    const { data: session, error } = await supabase
      .from('sessions')
      .insert({
        ...sessionData,
        deroulement: Array.isArray(deroulement) && deroulement.length === 0 ? null : deroulement,
      })
      .select()
      .single();

    if (error) throw error;

    if (groupes.length > 0) {
      const { error: errGroupes } = await supabase
        .from('groupes_allure')
        .insert(groupes.map((g) => ({ ...g, session_id: session.id })));
      if (errGroupes) throw errGroupes;
    }

    return session.id as string;
  },

  modifierSession: async (sessionId, { groupes, deroulement, ...sessionData }) => {
    const { error } = await supabase
      .from('sessions')
      .update({
        ...sessionData,
        deroulement: Array.isArray(deroulement) && deroulement.length === 0 ? null : deroulement,
      })
      .eq('id', sessionId);
    if (error) throw error;

    // Supprimer les anciens groupes et réinsérer
    await supabase.from('groupes_allure').delete().eq('session_id', sessionId);
    if (groupes.length > 0) {
      const { error: errGroupes } = await supabase
        .from('groupes_allure')
        .insert(groupes.map((g) => ({ ...g, session_id: sessionId })));
      if (errGroupes) throw errGroupes;
    }
  },
}));
