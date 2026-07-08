import { create } from 'zustand';
import { notifierNouveauMessage } from '../lib/notifications';
import { supabase } from '../lib/supabase';

export type Apercu = {
  contenu: string;
  cree_le: string;
  nomAuteur: string;
};

type ChatStore = {
  totalNonLus: number;
  nonLusParCrew: Record<string, number>;
  apercus: Record<string, Apercu>;
  _userId: string;
  _channels: any[];
  _crewActif: string | null;
  _nomsCrews: Record<string, string>;
  charger: (userId: string, crewIds: string[]) => Promise<void>;
  marquerLu: (crewId: string) => void;
  setCrewActif: (crewId: string | null) => void;
  _incrementer: (crewId: string, contenu: string, cree_le: string, nomAuteur: string) => void;
  cleanup: () => void;
};

const lastReadSession = new Map<string, string>();
const profilesCache = new Map<string, string>();
let _chargementEnCours = false;

function keyLR(userId: string, crewId: string) {
  return `${userId}__${crewId}`;
}

function total(map: Record<string, number>): number {
  return Object.values(map).reduce((a, b) => a + b, 0);
}

export const useChatStore = create<ChatStore>((set, get) => ({
  totalNonLus: 0,
  nonLusParCrew: {},
  apercus: {},
  _userId: '',
  _channels: [],
  _crewActif: null,
  _nomsCrews: {},

  charger: async (userId, crewIds) => {
    if (!crewIds.length) return;
    if (_chargementEnCours) return;
    _chargementEnCours = true;

    const estPremierChargement = get()._userId !== userId;
    get()._channels.forEach(ch => supabase.removeChannel(ch));

    const { data: crewsData } = await supabase
      .from('crews')
      .select('id, nom')
      .in('id', crewIds);

    const nomsCrews: Record<string, string> = {};
    for (const c of (crewsData ?? [])) nomsCrews[c.id] = c.nom;

    const now = new Date().toISOString();
    const nonLusParCrew: Record<string, number> = {};
    const apercus: Record<string, Apercu> = {};

    if (estPremierChargement) {
      // ─── Premier démarrage ────────────────────────────────────────────
      // Badge = 0 sans aucune requête de comptage (évite les faux positifs)
      // On récupère uniquement l'aperçu du dernier message
      for (const crewId of crewIds) {
        lastReadSession.set(keyLR(userId, crewId), now);
        nonLusParCrew[crewId] = 0;
      }

      const apercusResults = await Promise.all(
        crewIds.map(async crewId => {
          const { data } = await supabase
            .from('messages')
            .select('contenu, cree_le, profils(nom_affichage), utilisateur_id')
            .eq('crew_id', crewId)
            .order('cree_le', { ascending: false })
            .limit(1)
            .maybeSingle();
          return { crewId, data };
        })
      ).catch(() => []);

      for (const r of apercusResults) {
        if (!r.data) continue;
        const nom = (r.data as any).profils?.nom_affichage ?? '';
        if (nom && r.data.utilisateur_id) profilesCache.set(r.data.utilisateur_id, nom);
        apercus[r.crewId] = {
          contenu: r.data.contenu,
          cree_le: r.data.cree_le,
          nomAuteur: nom,
        };
      }
    } else {
      // ─── Retour au premier plan ───────────────────────────────────────
      // Conserver les counts en mémoire et compter uniquement les messages
      // reçus pendant que l'app était en arrière-plan
      const currentState = get();
      const currentNonLus = currentState.nonLusParCrew;
      const currentApercus = currentState.apercus;

      const results = await Promise.all(
        crewIds.map(async crewId => {
          const lastRead = lastReadSession.get(keyLR(userId, crewId)) ?? now;

          const [{ data: nonLusData }, { data: dernierMsg }] = await Promise.all([
            supabase
              .from('messages')
              .select('id')
              .eq('crew_id', crewId)
              .neq('utilisateur_id', userId)
              .gt('cree_le', lastRead),
            supabase
              .from('messages')
              .select('contenu, cree_le, profils(nom_affichage), utilisateur_id')
              .eq('crew_id', crewId)
              .order('cree_le', { ascending: false })
              .limit(1)
              .maybeSingle(),
          ]);

          if (dernierMsg) {
            const nom = (dernierMsg as any).profils?.nom_affichage ?? '';
            if (nom && dernierMsg.utilisateur_id) profilesCache.set(dernierMsg.utilisateur_id, nom);
          }

          return {
            crewId,
            count: nonLusData?.length ?? 0,
            apercu: dernierMsg
              ? {
                  contenu: dernierMsg.contenu,
                  cree_le: dernierMsg.cree_le,
                  nomAuteur: (dernierMsg as any).profils?.nom_affichage ?? '',
                }
              : null,
          };
        })
      ).catch(() => null);

      if (!results) {
        _chargementEnCours = false;
        return;
      }

      for (const r of results) {
        // Prendre le max entre ce qu'on avait en mémoire et ce qu'on vient de compter
        nonLusParCrew[r.crewId] = Math.max(currentNonLus[r.crewId] ?? 0, r.count);
        if (r.apercu) apercus[r.crewId] = r.apercu;
        else if (currentApercus[r.crewId]) apercus[r.crewId] = currentApercus[r.crewId];
      }
    }

    const channels = crewIds.map(crewId =>
      supabase
        .channel(`chat_unread_${crewId}_${Date.now()}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `crew_id=eq.${crewId}` },
          async (payload) => {
            const row = payload.new as any;
            if (row.utilisateur_id === userId) return;

            let nomAuteur = profilesCache.get(row.utilisateur_id);
            if (!nomAuteur) {
              const { data: profil } = await supabase
                .from('profils')
                .select('nom_affichage')
                .eq('id', row.utilisateur_id)
                .single();
              nomAuteur = profil?.nom_affichage ?? '';
              if (nomAuteur) profilesCache.set(row.utilisateur_id, nomAuteur);
            }

            get()._incrementer(crewId, row.contenu, row.cree_le, nomAuteur ?? '');
          }
        )
        .subscribe()
    );

    set({
      _userId: userId,
      nonLusParCrew,
      apercus,
      totalNonLus: total(nonLusParCrew),
      _channels: channels,
      _nomsCrews: nomsCrews,
    });
    _chargementEnCours = false;
  },

  setCrewActif: (crewId) => {
    set({ _crewActif: crewId });
  },

  marquerLu: (crewId) => {
    const userId = get()._userId;
    if (userId) {
      lastReadSession.set(keyLR(userId, crewId), new Date().toISOString());
    }
    const newNonLus = { ...get().nonLusParCrew, [crewId]: 0 };
    set({ nonLusParCrew: newNonLus, totalNonLus: total(newNonLus) });
  },

  _incrementer: (crewId, contenu, cree_le, nomAuteur) => {
    const { nonLusParCrew, apercus, _userId, _crewActif, _nomsCrews } = get();
    const newApercus = { ...apercus, [crewId]: { contenu, cree_le, nomAuteur } };

    if (_crewActif === crewId) {
      if (_userId) lastReadSession.set(keyLR(_userId, crewId), new Date().toISOString());
      set({ apercus: newApercus });
      return;
    }

    const lastRead = _userId ? lastReadSession.get(keyLR(_userId, crewId)) : undefined;
    if (lastRead && cree_le <= lastRead) {
      set({ apercus: newApercus });
      return;
    }

    const newNonLus = { ...nonLusParCrew, [crewId]: (nonLusParCrew[crewId] ?? 0) + 1 };
    set({ nonLusParCrew: newNonLus, totalNonLus: total(newNonLus), apercus: newApercus });

    const crewNom = _nomsCrews[crewId] ?? 'Crew';
    notifierNouveauMessage({ crewId, crewNom, nomAuteur, contenu }).catch(() => {});
  },

  cleanup: () => {
    get()._channels.forEach(ch => supabase.removeChannel(ch));
    set({ _channels: [], nonLusParCrew: {}, totalNonLus: 0, apercus: {}, _userId: '', _nomsCrews: {} });
    _chargementEnCours = false;
  },
}));
