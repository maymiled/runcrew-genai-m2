import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COULEURS, ESPACEMENT, RAYONS } from '../../src/lib/constantes';
import { supabase } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { TypeEntrainement } from '../../src/types/base';

type RunHistorique = {
  id: string;
  titre: string;
  type_entrainement: TypeEntrainement;
  heure_rdv: string;
  distance_km: number | null;
  crew_nom: string;
};

const LABELS_TYPE: Record<TypeEntrainement, string> = {
  fractionne: 'Fractionné',
  seuil: 'Seuil',
  tempo: 'Tempo',
  footing: 'Footing',
  sortie_longue: 'Sortie longue',
  libre: 'Libre',
};

const COULEURS_TYPE: Record<TypeEntrainement, string> = {
  fractionne: COULEURS.legend[500],
  seuil: COULEURS.danger,
  tempo: '#F59E0B',
  footing: COULEURS.succes,
  sortie_longue: COULEURS.info,
  libre: COULEURS.night[500],
};

const ICONES_TYPE: Record<TypeEntrainement, keyof typeof Ionicons.glyphMap> = {
  fractionne: 'flash',
  seuil: 'speedometer',
  tempo: 'pulse',
  footing: 'walk',
  sortie_longue: 'map',
  libre: 'star',
};

function formaterDateComplete(iso: string): string {
  const d = new Date(iso);
  const s = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return s[0].toUpperCase() + s.slice(1);
}

function moisAnnee(iso: string): string {
  const d = new Date(iso);
  const s = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return s[0].toUpperCase() + s.slice(1);
}

export default function Historique() {
  const authSession = useAuthStore((s) => s.session);
  const userId = authSession?.user?.id;

  const [runs, setRuns] = useState<RunHistorique[]>([]);
  const [chargement, setChargement] = useState(true);
  const [rafraichissement, setRafraichissement] = useState(false);

  useEffect(() => {
    if (!userId) return;
    charger();
  }, [userId]);

  async function charger() {
    setChargement(true);

    const { data: confs } = await supabase
      .from('confirmations')
      .select('session_id')
      .eq('utilisateur_id', userId)
      .eq('statut', 'present');

    const sessionIds = (confs ?? []).map((c: any) => c.session_id);

    if (sessionIds.length === 0) {
      setChargement(false);
      return;
    }

    const { data: sessionsData } = await supabase
      .from('sessions')
      .select('id, titre, type_entrainement, heure_rdv, distance_km, crews(nom)')
      .in('id', sessionIds)
      .eq('validee', true)
      .order('heure_rdv', { ascending: false });

    if (sessionsData) {
      setRuns(
        (sessionsData as any[]).map((s) => ({
          id: s.id,
          titre: s.titre,
          type_entrainement: s.type_entrainement,
          heure_rdv: s.heure_rdv,
          distance_km: s.distance_km ?? null,
          crew_nom: s.crews?.nom ?? 'Crew',
        }))
      );
    }

    setChargement(false);
  }

  const totalKm = runs.reduce((acc, r) => acc + (r.distance_km ?? 0), 0);

  if (chargement) {
    return (
      <View style={styles.centrage}>
        <ActivityIndicator color={COULEURS.legend[500]} size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.boutonRetour}
          onPress={() => router.canDismiss() ? router.back() : router.replace('/(app)/(tabs)/accueil' as any)}
        >
          <Ionicons name="arrow-back" size={24} color={COULEURS.night[700]} />
        </TouchableOpacity>
        <Text style={styles.headerTitre}>Historique des runs</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Résumé */}
      <View style={styles.resumeRow}>
        <View style={styles.resumeCard}>
          <Text style={styles.resumeValeur}>{runs.length}</Text>
          <Text style={styles.resumeLabel}>{runs.length <= 1 ? 'RUN VALIDÉ' : 'RUNS VALIDÉS'}</Text>
        </View>
        <View style={[styles.resumeCard, styles.resumeSep]}>
          <Text style={styles.resumeValeur}>{Math.round(totalKm)}</Text>
          <Text style={styles.resumeLabel}>KM TOTAUX</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contenu}
        refreshControl={
          <RefreshControl
            refreshing={rafraichissement}
            onRefresh={async () => {
              setRafraichissement(true);
              await charger();
              setRafraichissement(false);
            }}
            tintColor={COULEURS.legend[500]}
            colors={[COULEURS.legend[500]]}
          />
        }
      >
        {runs.length === 0 ? (
          <View style={styles.etatVide}>
            <Ionicons name="analytics-outline" size={48} color={COULEURS.night[200]} />
            <Text style={styles.etatVideTitre}>Aucun run validé</Text>
            <Text style={styles.etatVideTexte}>
              Tes runs apparaîtront ici une fois validés par le capitaine.
            </Text>
          </View>
        ) : (
          runs.map((run, index) => {
            const couleur = COULEURS_TYPE[run.type_entrainement];
            const icone = ICONES_TYPE[run.type_entrainement];
            const ma = moisAnnee(run.heure_rdv);
            const maPrev = index > 0 ? moisAnnee(runs[index - 1].heure_rdv) : null;
            const montrerSeparateur = ma !== maPrev;

            return (
              <View key={run.id}>
                {montrerSeparateur && (
                  <Text style={styles.separateurMois}>{ma}</Text>
                )}
                <TouchableOpacity
                  style={styles.ligneRun}
                  onPress={() => router.push(`/session/${run.id}` as any)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.runIcone, { backgroundColor: couleur + '18' }]}>
                    <Ionicons name={icone} size={22} color={couleur} />
                  </View>
                  <View style={styles.runCorps}>
                    <Text style={styles.runTitre} numberOfLines={1}>{run.titre}</Text>
                    <Text style={styles.runMeta}>
                      {run.crew_nom} · {formaterDateComplete(run.heure_rdv)}
                    </Text>
                    <View style={styles.runBadgeLigne}>
                      <View style={[styles.runTypeBadge, { backgroundColor: couleur + '18' }]}>
                        <Text style={[styles.runTypeBadgeTexte, { color: couleur }]}>
                          {LABELS_TYPE[run.type_entrainement]}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.runDroite}>
                    {run.distance_km ? (
                      <Text style={[styles.runKm, { color: couleur }]}>
                        {run.distance_km} km
                      </Text>
                    ) : null}
                    <Ionicons name="checkmark-circle" size={18} color={COULEURS.succes} />
                  </View>
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centrage: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: ESPACEMENT.md,
    paddingVertical: ESPACEMENT.sm,
    borderBottomWidth: 1,
    borderBottomColor: COULEURS.night[100],
  },
  boutonRetour: {
    width: 40, height: 40, borderRadius: RAYONS.full,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitre: { fontSize: 18, fontWeight: '700', color: COULEURS.night[700] },

  resumeRow: {
    flexDirection: 'row',
    marginHorizontal: ESPACEMENT.md,
    marginTop: ESPACEMENT.md,
    backgroundColor: COULEURS.legend[50],
    borderRadius: RAYONS.xl,
  },
  resumeCard: { flex: 1, alignItems: 'center', paddingVertical: ESPACEMENT.md },
  resumeSep: { borderLeftWidth: 1, borderLeftColor: COULEURS.legend[100] },
  resumeValeur: { fontSize: 28, fontWeight: '800', color: COULEURS.legend[500] },
  resumeLabel: {
    fontSize: 10, fontWeight: '700', color: COULEURS.legend[400],
    letterSpacing: 0.5, marginTop: 2,
  },

  contenu: {
    paddingHorizontal: ESPACEMENT.md,
    paddingTop: ESPACEMENT.sm,
    paddingBottom: ESPACEMENT['2xl'],
  },

  etatVide: {
    alignItems: 'center', gap: ESPACEMENT.sm,
    paddingTop: ESPACEMENT['2xl'],
  },
  etatVideTitre: { fontSize: 18, fontWeight: '700', color: COULEURS.night[600] },
  etatVideTexte: {
    fontSize: 14, color: COULEURS.night[400], textAlign: 'center',
    lineHeight: 20, maxWidth: 260,
  },

  separateurMois: {
    fontSize: 13, fontWeight: '700', color: COULEURS.night[400],
    marginTop: ESPACEMENT.lg, marginBottom: ESPACEMENT.xs,
  },

  ligneRun: {
    flexDirection: 'row', alignItems: 'center', gap: ESPACEMENT.sm,
    paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COULEURS.night[50],
  },
  runIcone: {
    width: 48, height: 48, borderRadius: RAYONS.lg,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  runCorps: { flex: 1, gap: 3 },
  runTitre: { fontSize: 15, fontWeight: '600', color: COULEURS.night[700] },
  runMeta: { fontSize: 12, color: COULEURS.night[400] },
  runBadgeLigne: { flexDirection: 'row' },
  runTypeBadge: {
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: RAYONS.full,
  },
  runTypeBadgeTexte: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  runDroite: { alignItems: 'flex-end', gap: 4, flexShrink: 0 },
  runKm: { fontSize: 14, fontWeight: '700' },
});
