import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COULEURS, ESPACEMENT, RAYONS } from '../../../src/lib/constantes';
import { supabase } from '../../../src/lib/supabase';
import { useAuthStore } from '../../../src/stores/useAuthStore';
import { useChatStore } from '../../../src/stores/useChatStore';

type CrewRow = { crew_id: string; nom: string; photo_url: string | null };

const PALETTE_CREWS = [
  '#7C3AED', '#2563EB', '#059669', '#D97706',
  '#DC2626', '#0891B2', '#4F46E5', '#BE185D',
];

function couleurCrew(crewId: string): string {
  let hash = 0;
  for (let i = 0; i < crewId.length; i++) {
    hash = crewId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PALETTE_CREWS[Math.abs(hash) % PALETTE_CREWS.length];
}

function formaterTemps(iso: string): string {
  const d = new Date(iso);
  const auj = new Date();
  const hier = new Date(auj);
  hier.setDate(auj.getDate() - 1);
  if (d.toDateString() === auj.toDateString())
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === hier.toDateString()) return 'Hier';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export default function ChatHub() {
  const session = useAuthStore((s) => s.session);
  const userId = session?.user?.id ?? '';
  const nonLusParCrew = useChatStore((s) => s.nonLusParCrew);
  const apercus = useChatStore((s) => s.apercus);
  const charger = useChatStore((s) => s.charger);

  const [crews, setCrews] = useState<CrewRow[]>([]);
  const [chargement, setChargement] = useState(true);
  const [rafraichissement, setRafraichissement] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      chargerCrews();
    }, [userId])
  );

  async function chargerCrews() {
    setChargement(true);
    const { data } = await supabase
      .from('membres')
      .select('crew_id, crews(id, nom, photo_url)')
      .eq('utilisateur_id', userId);

    const liste: CrewRow[] = (data ?? []).map((m: any) => ({
      crew_id: m.crew_id,
      nom: m.crews?.nom ?? 'Crew',
      photo_url: m.crews?.photo_url ?? null,
    }));
    setCrews(liste);
    setChargement(false);

    if (liste.length) {
      const storeCrewIds = Object.keys(useChatStore.getState().nonLusParCrew);
      const newIds = liste.map((c) => c.crew_id).sort();
      const oldIds = [...storeCrewIds].sort();
      const different = newIds.length !== oldIds.length || newIds.some((id, i) => id !== oldIds[i]);
      if (different) charger(userId, liste.map((c) => c.crew_id));
    }
  }

  if (!userId) return null;

  if (chargement) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <EnTete count={0} loading />
        <View style={styles.centrage}>
          <ActivityIndicator color={COULEURS.legend[500]} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!crews.length) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <EnTete count={0} />
        <View style={styles.centrage}>
          <View style={styles.iconeVide}>
            <Ionicons name="chatbubbles" size={32} color={COULEURS.legend[400]} />
          </View>
          <Text style={styles.etatVideTitre}>Aucune conversation</Text>
          <Text style={styles.etatVideTexte}>
            Rejoins un crew pour discuter avec tes coéquipiers.
          </Text>
          <TouchableOpacity
            style={styles.boutonCTA}
            onPress={() => router.push('/crew/rejoindre' as any)}
            activeOpacity={0.85}
          >
            <Ionicons name="enter-outline" size={18} color="#fff" />
            <Text style={styles.boutonCTATexte}>Rejoindre un crew</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.boutonCTASecondaire}
            onPress={() => router.push('/crew/creer' as any)}
            activeOpacity={0.85}
          >
            <Ionicons name="add" size={18} color={COULEURS.legend[500]} />
            <Text style={styles.boutonCTASecondaireTexte}>Créer mon crew</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <EnTete count={crews.length} />
      <FlatList
        data={crews}
        keyExtractor={(c) => c.crew_id}
        contentContainerStyle={styles.liste}
        refreshControl={
          <RefreshControl
            refreshing={rafraichissement}
            onRefresh={async () => {
              setRafraichissement(true);
              await chargerCrews();
              setRafraichissement(false);
            }}
            tintColor={COULEURS.legend[500]}
            colors={[COULEURS.legend[500]]}
          />
        }
        renderItem={({ item }) => {
          const nonLus = nonLusParCrew[item.crew_id] ?? 0;
          const apercu = apercus[item.crew_id];
          const couleur = couleurCrew(item.crew_id);

          return (
            <TouchableOpacity
              style={[styles.carte, nonLus > 0 && styles.carteNonLue]}
              onPress={() => router.push(`/chat/${item.crew_id}` as any)}
              activeOpacity={0.7}
            >
              {/* Accent latéral coloré */}
              <View style={[styles.accent, { backgroundColor: nonLus > 0 ? COULEURS.legend[500] : couleur }]} />

              {/* Avatar */}
              <View style={[styles.avatar, { backgroundColor: couleur + '22', borderColor: couleur + '55', borderWidth: 1.5 }]}>
                {item.photo_url ? (
                  <Image
                    source={{ uri: item.photo_url }}
                    style={{ width: 52, height: 52, borderRadius: RAYONS.full, position: 'absolute' }}
                    contentFit="cover"
                  />
                ) : (
                  <Text style={[styles.avatarLettre, { color: couleur }]}>
                    {item.nom[0]?.toUpperCase() ?? '?'}
                  </Text>
                )}
                {nonLus > 0 && (
                  <View style={styles.avatarBadge}>
                    <Text style={styles.avatarBadgeTexte}>
                      {nonLus > 99 ? '99+' : nonLus}
                    </Text>
                  </View>
                )}
              </View>

              {/* Contenu */}
              <View style={styles.carteCorps}>
                <View style={styles.carteHaut}>
                  <Text
                    style={[styles.crewNom, nonLus > 0 && styles.crewNomGras]}
                    numberOfLines={1}
                  >
                    {item.nom}
                  </Text>
                  {apercu && (
                    <Text style={[styles.temps, nonLus > 0 && styles.tempsNonLu]}>
                      {formaterTemps(apercu.cree_le)}
                    </Text>
                  )}
                </View>

                <View style={styles.carteBas}>
                  <Text
                    style={[styles.apercu, nonLus > 0 && styles.apercuGras]}
                    numberOfLines={1}
                  >
                    {apercu
                      ? apercu.nomAuteur
                        ? `${apercu.nomAuteur} : ${apercu.contenu}`
                        : apercu.contenu
                      : "Aucun message pour l'instant"}
                  </Text>
                  {nonLus > 0 && (
                    <View style={styles.nonLuPill}>
                      <Text style={styles.nonLuPillTexte}>{nonLus > 99 ? '99+' : nonLus}</Text>
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

function EnTete({ count, loading }: { count: number; loading?: boolean }) {
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.titre}>Messages</Text>
        {!loading && (
          <Text style={styles.sousTitre}>
            {count > 0 ? `${count} conversation${count > 1 ? 's' : ''}` : 'Rejoins un crew pour commencer'}
          </Text>
        )}
      </View>
      <View style={styles.headerIcone}>
        <Ionicons name="chatbubbles" size={22} color={COULEURS.legend[500]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F4F8' },
  centrage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: ESPACEMENT.sm,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: ESPACEMENT.md,
    paddingTop: ESPACEMENT.sm,
    paddingBottom: ESPACEMENT.md,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: COULEURS.night[100],
  },
  headerIcone: {
    width: 42,
    height: 42,
    borderRadius: RAYONS.full,
    backgroundColor: COULEURS.legend[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  titre: { fontSize: 26, fontWeight: '800', color: COULEURS.legend[600], letterSpacing: -0.5 },
  sousTitre: { fontSize: 12, color: COULEURS.night[400], marginTop: 2 },

  liste: { padding: ESPACEMENT.md, gap: ESPACEMENT.sm },

  carte: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: RAYONS.xl,
    paddingRight: ESPACEMENT.md,
    paddingVertical: 14,
    gap: ESPACEMENT.md,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    overflow: 'hidden',
  },
  carteNonLue: {
    backgroundColor: COULEURS.legend[50],
    shadowOpacity: 0.1,
  },

  accent: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: 2,
    flexShrink: 0,
  },

  avatar: {
    width: 52,
    height: 52,
    borderRadius: RAYONS.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarLettre: {
    fontSize: 21,
    fontWeight: '800',
  },
  avatarBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: RAYONS.full,
    backgroundColor: COULEURS.volt[500],
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  avatarBadgeTexte: { fontSize: 10, fontWeight: '800', color: '#fff' },

  carteCorps: { flex: 1, gap: 4 },

  carteHaut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: ESPACEMENT.sm,
  },
  crewNom: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: COULEURS.night[600],
  },
  crewNomGras: { fontWeight: '800', color: COULEURS.night[700] },
  temps: { fontSize: 11, color: COULEURS.night[300], flexShrink: 0 },
  tempsNonLu: { color: COULEURS.legend[500], fontWeight: '700' },

  carteBas: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  apercu: { flex: 1, fontSize: 13, color: COULEURS.night[400] },
  apercuGras: { color: COULEURS.night[600], fontWeight: '500' },

  nonLuPill: {
    backgroundColor: COULEURS.legend[500],
    borderRadius: RAYONS.full,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    flexShrink: 0,
  },
  nonLuPillTexte: { fontSize: 11, fontWeight: '800', color: '#fff' },

  iconeVide: {
    width: 72,
    height: 72,
    borderRadius: RAYONS.full,
    backgroundColor: COULEURS.legend[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: ESPACEMENT.sm,
  },
  etatVideTitre: {
    fontSize: 18,
    fontWeight: '700',
    color: COULEURS.night[600],
    marginTop: ESPACEMENT.xs,
  },
  etatVideTexte: {
    fontSize: 14,
    color: COULEURS.night[400],
    textAlign: 'center',
    paddingHorizontal: ESPACEMENT.xl,
  },
  boutonCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COULEURS.legend[500],
    borderRadius: RAYONS.full,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: ESPACEMENT.md,
  },
  boutonCTATexte: { color: '#fff', fontSize: 15, fontWeight: '700' },
  boutonCTASecondaire: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: COULEURS.legend[300],
    borderRadius: RAYONS.full,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: ESPACEMENT.sm,
    backgroundColor: COULEURS.legend[50],
  },
  boutonCTASecondaireTexte: { color: COULEURS.legend[600], fontSize: 14, fontWeight: '600' },
});
