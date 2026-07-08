import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COULEURS, ESPACEMENT, RAYONS } from '../../../src/lib/constantes';
import { supabase } from '../../../src/lib/supabase';
import { useAuthStore } from '../../../src/stores/useAuthStore';

type CrewExplorer = {
  id: string;
  nom: string;
  ville: string;
  description: string | null;
  photo_url: string | null;
  nombre_membres: number;
  total_sorties: number;
  serie_actuelle: number;
};

const PALETTE = [COULEURS.legend[500], '#F59E0B', COULEURS.info, '#10B981', COULEURS.danger, '#8B5CF6'];
function couleurCrew(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export default function Explorer() {
  const authSession = useAuthStore((s) => s.session);
  const [recherche, setRecherche] = useState('');
  const [crews, setCrews] = useState<CrewExplorer[]>([]);
  const [chargement, setChargement] = useState(true);
  const [crewsRejoints, setCrewsRejoints] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rechercheRef = useRef(recherche);
  rechercheRef.current = recherche;

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Recharger les memberships quand l'onglet reprend le focus
  useFocusEffect(
    useCallback(() => {
      if (!authSession?.user?.id) return;
      chargerMemberships();
      chercher(rechercheRef.current);
    }, [authSession?.user?.id])
  );

  async function chargerMemberships() {
    if (!authSession?.user?.id) return;
    const { data } = await supabase
      .from('membres')
      .select('crew_id')
      .eq('utilisateur_id', authSession.user.id);
    if (data) setCrewsRejoints(new Set(data.map((m: any) => m.crew_id as string)));
  }

  async function chercher(query: string) {
    setChargement(true);
    const q = query.trim();
    let req = supabase
      .from('crews')
      .select('id, nom, ville, description, photo_url, nombre_membres, serie_actuelle')
      .order('nombre_membres', { ascending: false })
      .limit(60);

    if (q.length >= 1) {
      req = req.or(`nom.ilike.%${q}%,ville.ilike.%${q}%`);
    }

    const { data } = await req;
    if (!data) { setChargement(false); return; }

    // Calcul dynamique des sessions validées par crew
    const crewIds = data.map((c: any) => c.id as string);
    const { data: sessValidees } = await supabase
      .from('sessions')
      .select('crew_id')
      .in('crew_id', crewIds)
      .eq('validee', true);

    const countMap: Record<string, number> = {};
    for (const s of (sessValidees ?? [])) {
      countMap[s.crew_id] = (countMap[s.crew_id] ?? 0) + 1;
    }

    setCrews(data.map((c: any) => ({ ...c, total_sorties: countMap[c.id] ?? 0 })) as CrewExplorer[]);
    setChargement(false);
  }

  function handleRecherche(texte: string) {
    setRecherche(texte);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => chercher(texte), 400);
  }

  function viderRecherche() {
    setRecherche('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    chercher('');
  }

  function renderCrew({ item }: { item: CrewExplorer }) {
    const couleur = couleurCrew(item.id);
    const dejaRejoint = crewsRejoints.has(item.id);

    return (
      <View style={styles.crewCard}>
        <View style={[styles.crewAvatar, { backgroundColor: couleur + '18', borderColor: couleur + '30' }]}>
          {item.photo_url ? (
            <Image source={{ uri: item.photo_url }} style={styles.crewAvatarImage} contentFit="cover" />
          ) : (
            <Text style={[styles.crewAvatarTexte, { color: couleur }]}>
              {item.nom.substring(0, 2).toUpperCase()}
            </Text>
          )}
        </View>

        <View style={styles.crewCorps}>
          <View style={styles.crewLigneHaut}>
            <Text style={styles.crewNom} numberOfLines={1}>{item.nom}</Text>
            {item.serie_actuelle > 0 && (
              <View style={styles.streakBadge}>
                <Text style={styles.streakTexte}>🔥 {item.serie_actuelle}</Text>
              </View>
            )}
          </View>
          <View style={styles.crewMeta}>
            <Ionicons name="location-outline" size={12} color={COULEURS.night[400]} />
            <Text style={styles.crewMetaTexte}>{item.ville}</Text>
            <Text style={styles.crewMetaSep}>·</Text>
            <Ionicons name="people-outline" size={12} color={COULEURS.night[400]} />
            <Text style={styles.crewMetaTexte}>
              {item.nombre_membres} membre{item.nombre_membres > 1 ? 's' : ''}
            </Text>
            {item.total_sorties > 0 && (
              <>
                <Text style={styles.crewMetaSep}>·</Text>
                <Text style={styles.crewMetaTexte}>{item.total_sorties} run{item.total_sorties > 1 ? 's' : ''}</Text>
              </>
            )}
          </View>
          {item.description ? (
            <Text style={styles.crewDesc} numberOfLines={2}>{item.description}</Text>
          ) : null}
        </View>

        <TouchableOpacity
          style={[styles.crewBtn, dejaRejoint && styles.crewBtnRejoint]}
          onPress={() =>
            dejaRejoint
              ? router.push(`/crew/${item.id}` as any)
              : router.push('/crew/rejoindre' as any)
          }
          activeOpacity={0.8}
        >
          <Text style={[styles.crewBtnTexte, dejaRejoint && styles.crewBtnTexteRejoint]}>
            {dejaRejoint ? 'Voir' : 'Rejoindre'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const pasDeCrew = !chargement && crews.length === 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.titre}>Explorer</Text>
          <Text style={styles.sousTitre}>Découvre des crews actifs</Text>
        </View>
        <TouchableOpacity
          style={styles.boutonCreerHeader}
          onPress={() => router.push('/crew/creer' as any)}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.boutonCreerHeaderTexte}>Créer</Text>
        </TouchableOpacity>
      </View>

      {/* Barre de recherche */}
      <View style={styles.searchWrapper}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={COULEURS.night[400]} />
          <TextInput
            style={styles.searchInput}
            value={recherche}
            onChangeText={handleRecherche}
            placeholder="Ville, nom du crew..."
            placeholderTextColor={COULEURS.night[300]}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {recherche.length > 0 && (
            <TouchableOpacity onPress={viderRecherche} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color={COULEURS.night[300]} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Contenu */}
      {chargement ? (
        <View style={styles.centrage}>
          <ActivityIndicator color={COULEURS.legend[500]} size="large" />
        </View>
      ) : pasDeCrew ? (
        <View style={styles.vide}>
          <Ionicons name="compass-outline" size={56} color={COULEURS.night[200]} />
          <Text style={styles.videTitre}>
            {recherche.length > 0 ? 'Aucun crew trouvé' : "Aucun crew pour l'instant"}
          </Text>
          <Text style={styles.videTexte}>
            {recherche.length > 0
              ? `Essaie un autre nom ou une autre ville.`
              : 'Sois le premier à créer un crew dans ta ville !'}
          </Text>
          <TouchableOpacity
            style={styles.boutonCreer}
            onPress={() =>
              recherche.length > 0 ? viderRecherche() : router.push('/crew/creer' as any)
            }
            activeOpacity={0.8}
          >
            <Ionicons
              name={recherche.length > 0 ? 'refresh' : 'add'}
              size={18}
              color="#fff"
            />
            <Text style={styles.boutonCreerTexte}>
              {recherche.length > 0 ? 'Effacer la recherche' : 'Créer un crew'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={crews}
          keyExtractor={(item) => item.id}
          renderItem={renderCrew}
          contentContainerStyle={styles.liste}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <Text style={styles.resultatsLabel}>
              {crews.length} crew{crews.length > 1 ? 's' : ''}
              {recherche.trim() ? ` pour "${recherche.trim()}"` : ' dans la communauté'}
            </Text>
          }
          ItemSeparatorComponent={() => <View style={styles.separateur} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centrage: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: ESPACEMENT.md,
    paddingTop: ESPACEMENT.sm,
    paddingBottom: ESPACEMENT.sm,
    borderBottomWidth: 1,
    borderBottomColor: COULEURS.night[100],
  },
  titre: { fontSize: 22, fontWeight: '800', color: COULEURS.night[700], letterSpacing: -0.3 },
  sousTitre: { fontSize: 13, color: COULEURS.night[400], marginTop: 1 },
  boutonCreerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COULEURS.legend[500],
    borderRadius: RAYONS.full,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  boutonCreerHeaderTexte: { fontSize: 14, fontWeight: '700', color: '#fff' },

  searchWrapper: {
    paddingHorizontal: ESPACEMENT.md,
    paddingVertical: ESPACEMENT.sm,
    borderBottomWidth: 1,
    borderBottomColor: COULEURS.night[50],
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COULEURS.night[50],
    borderRadius: RAYONS.xl,
    paddingHorizontal: ESPACEMENT.md,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: COULEURS.night[700],
  },

  liste: {
    paddingHorizontal: ESPACEMENT.md,
    paddingBottom: ESPACEMENT['3xl'],
    paddingTop: ESPACEMENT.xs,
  },
  resultatsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COULEURS.night[400],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginVertical: ESPACEMENT.sm,
  },
  separateur: {
    height: 1,
    backgroundColor: COULEURS.night[50],
  },

  crewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ESPACEMENT.sm,
    paddingVertical: ESPACEMENT.md,
  },
  crewAvatar: {
    width: 52,
    height: 52,
    borderRadius: RAYONS.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    flexShrink: 0,
    overflow: 'hidden',
  },
  crewAvatarImage: { width: 52, height: 52, borderRadius: RAYONS.md },
  crewAvatarTexte: { fontSize: 18, fontWeight: '800' },

  crewCorps: { flex: 1, gap: 3 },
  crewLigneHaut: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  crewNom: { flex: 1, fontSize: 16, fontWeight: '700', color: COULEURS.night[700] },
  streakBadge: {
    backgroundColor: '#FFF7ED',
    borderRadius: RAYONS.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  streakTexte: { fontSize: 11, fontWeight: '700', color: '#92400E' },

  crewMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  crewMetaTexte: { fontSize: 12, color: COULEURS.night[400] },
  crewMetaSep: { fontSize: 12, color: COULEURS.night[300] },
  crewDesc: { fontSize: 13, color: COULEURS.night[400], lineHeight: 18, marginTop: 2 },

  crewBtn: {
    backgroundColor: COULEURS.legend[500],
    borderRadius: RAYONS.full,
    paddingVertical: 8,
    paddingHorizontal: 14,
    flexShrink: 0,
  },
  crewBtnRejoint: {
    backgroundColor: COULEURS.night[50],
    borderWidth: 1,
    borderColor: COULEURS.night[200],
  },
  crewBtnTexte: { fontSize: 13, fontWeight: '700', color: '#fff' },
  crewBtnTexteRejoint: { color: COULEURS.night[500] },

  vide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: ESPACEMENT.xl,
    gap: ESPACEMENT.sm,
  },
  videTitre: { fontSize: 18, fontWeight: '700', color: COULEURS.night[600], textAlign: 'center' },
  videTexte: { fontSize: 14, color: COULEURS.night[400], textAlign: 'center', lineHeight: 20 },
  boutonCreer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COULEURS.legend[500],
    borderRadius: RAYONS.full,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: ESPACEMENT.sm,
  },
  boutonCreerTexte: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
