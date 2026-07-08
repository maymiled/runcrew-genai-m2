import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { Crew } from '../types/crew';

function genererSlug(nom: string): string {
  const base = nom
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const suffixe = Math.random().toString(36).substring(2, 6);
  return `${base}-${suffixe}`;
}

function genererCodeInvitation(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

type CrewStore = {
  creerCrew: (params: {
    nom: string;
    ville: string;
    description: string;
    capitaineId: string;
  }) => Promise<Crew>;
  rejoindreCrewParCode: (code: string) => Promise<string>;
};

export const useCrewStore = create<CrewStore>(() => ({
  creerCrew: async ({ nom, ville, description, capitaineId }) => {
    const { data: crew, error: erreurCrew } = await supabase
      .from('crews')
      .insert({
        nom: nom.trim(),
        slug: genererSlug(nom),
        description: description.trim() || null,
        ville: ville.trim(),
        capitaine_id: capitaineId,
        code_invitation: genererCodeInvitation(),
        max_membres: 30,
      })
      .select()
      .single();

    if (erreurCrew) throw erreurCrew;

    const { error: erreurMembre } = await supabase
      .from('membres')
      .insert({
        crew_id: crew.id,
        utilisateur_id: capitaineId,
        role: 'capitaine',
      });

    if (erreurMembre) throw erreurMembre;

    return crew as Crew;
  },

  rejoindreCrewParCode: async (code: string) => {
    const { data, error } = await supabase.rpc('rejoindre_crew_par_invitation', {
      code: code.trim().toUpperCase(),
    });

    if (error) {
      if (error.message.includes('invalide')) throw new Error('Code invalide. Vérifie le code et réessaie.');
      throw new Error(error.message || 'Impossible de rejoindre le crew.');
    }

    return data as string;
  },
}));
