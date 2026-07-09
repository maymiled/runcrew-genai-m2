import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COULEURS, ESPACEMENT, RAYONS } from '../../../src/lib/constantes';
import { supabase } from '../../../src/lib/supabase';
import { useAuthStore } from '../../../src/stores/useAuthStore';
import { Profil } from '../../../src/types/profil';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseNumrange(val: string | null): [number, number] | null {
  if (!val) return null;
  const match = val.match(/[\[\(](\d+(?:\.\d+)?),(\d+(?:\.\d+)?)[\]\)]/);
  if (!match) return null;
  return [parseFloat(match[1]), parseFloat(match[2])];
}

function secondesVersAllure(s: number): string {
  const min = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function initialesNom(nom: string): string {
  return nom.split(' ').slice(0, 2).map((m) => m[0]?.toUpperCase() ?? '').join('');
}

const PALETTE = [COULEURS.legend[500], '#F59E0B', COULEURS.info, '#10B981', COULEURS.danger, '#8B5CF6'];
function couleurProfil(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

// ─── Composant ───────────────────────────────────────────────────────────────

export default function ProfilPublic() {
  const { id, crewId, sessionId } = useLocalSearchParams<{ id: string; crewId?: string; sessionId?: string }>();
  const authSession = useAuthStore((s) => s.session);
  const estMoi = id === authSession?.user?.id;

  const [profil, setProfil] = useState<Profil | null>(null);
  const [chargement, setChargement] = useState(true);
  const [estCapitaineDuCrew, setEstCapitaineDuCrew] = useState(false);
  const [chargementAction, setChargementAction] = useState(false);
  const [totalSorties, setTotalSorties] = useState(0);
  const [totalKm, setTotalKm] = useState(0);

  useEffect(() => {
    if (!id) return;
    charger();
  }, [id]);

  async function charger() {
    setChargement(true);
    const [profilResult, capitaineResult, confirmationsResult] = await Promise.all([
      supabase.from('profils').select('*').eq('id', id).single(),
      crewId && authSession?.user?.id
        ? supabase.from('crews').select('capitaine_id').eq('id', crewId).eq('capitaine_id', authSession.user.id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from('confirmations')
        .select('session_id, sessions!inner(validee, distance_km)')
        .eq('utilisateur_id', id)
        .eq('statut', 'present')
        .eq('sessions.validee', true),
    ]);
    if (profilResult.data) setProfil(profilResult.data as Profil);
    setEstCapitaineDuCrew(!!(capitaineResult as any).data);
    if (confirmationsResult.data) {
      const confs = confirmationsResult.data as any[];
      setTotalSorties(confs.length);
      setTotalKm(confs.reduce((acc, c) => acc + (c.sessions?.distance_km ?? 0), 0));
    }
    setChargement(false);
  }

  async function retirerDeLaSession() {
    if (!sessionId || !id || chargementAction) return;
    Alert.alert(
      'Retirer de la session',
      `Retirer ${profil?.nom_affichage} de cette session ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Retirer',
          style: 'destructive',
          onPress: async () => {
            setChargementAction(true);
            const { error } = await supabase
              .from('confirmations')
              .delete()
              .eq('session_id', sessionId)
              .eq('utilisateur_id', id);
            setChargementAction(false);
            if (error) {
              Alert.alert('Erreur', 'Impossible de retirer ce coureur de la session.');
            } else {
              router.back();
            }
          },
        },
      ]
    );
  }

  async function exclureDuCrew() {
    if (!crewId || !id || chargementAction) return;
    Alert.alert(
      'Exclure du crew',
      `Exclure ${profil?.nom_affichage} du crew ? Cette action est irréversible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Exclure',
          style: 'destructive',
          onPress: async () => {
            setChargementAction(true);
            const { error } = await supabase
              .from('membres')
              .delete()
              .eq('crew_id', crewId)
              .eq('utilisateur_id', id);
            setChargementAction(false);
            if (error) {
              Alert.alert('Erreur', "Impossible d'exclure ce coureur du crew.");
            } else {
              router.back();
            }
          },
        },
      ]
    );
  }

  if (chargement) {
    return <View style={styles.centrage}><ActivityIndicator color={COULEURS.legend[500]} size="large" /></View>;
  }

  if (!profil) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.boutonRetour} onPress={() => router.canDismiss() ? router.back() : router.replace('/(app)/(tabs)/accueil' as any)}>
            <Ionicons name="arrow-back" size={24} color={COULEURS.night[700]} />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
        </View>
        <View style={styles.centrage}>
          <Text style={styles.texteErreur}>Profil introuvable</Text>
        </View>
      </SafeAreaView>
    );
  }

  const allure = parseNumrange(profil.allure_footing);
  const couleur = couleurProfil(id ?? '');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.boutonRetour} onPress={() => router.canDismiss() ? router.back() : router.replace('/(app)/(tabs)/accueil' as any)}>
          <Ionicons name="arrow-back" size={24} color={COULEURS.night[700]} />
        </TouchableOpacity>
        <Text style={styles.headerTitre} numberOfLines={1}>{profil.nom_affichage}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.contenu}>

        {/* Avatar + identité */}
        <View style={styles.identite}>
          <View style={styles.avatarWrapper}>
            <View style={[styles.avatar, { backgroundColor: couleur + '18', borderColor: couleur }]}>
              {profil.photo_url ? (
                <Image source={{ uri: profil.photo_url }} style={styles.avatarImage} contentFit="cover" />
              ) : (
                <Text style={[styles.avatarTexte, { color: couleur }]}>{initialesNom(profil.nom_affichage)}</Text>
              )}
            </View>
            {estMoi && (
              <View style={[styles.badgeMoi, { backgroundColor: couleur }]}>
                <Ionicons name="person" size={10} color="#fff" />
              </View>
            )}
          </View>
          <Text style={styles.nom}>{profil.nom_affichage}</Text>
          {profil.ville ? (
            <Text style={[styles.username, { color: couleur }]}>{profil.ville}</Text>
          ) : null}
          {profil.bio && <Text style={styles.bio}>{profil.bio}</Text>}
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={[styles.statValeur, { color: couleur }]}>{totalSorties}</Text>
            <Text style={styles.statLabel}>{totalSorties <= 1 ? 'Run' : 'Runs'}</Text>
          </View>
          <View style={[styles.statCard, styles.statSep]}>
            <Text style={[styles.statValeur, { color: couleur }]}>{Math.round(totalKm)}</Text>
            <Text style={styles.statLabel}>Total km</Text>
          </View>
        </View>

        {/* Allure footing */}
        {allure && (
          <View style={[styles.allureBloc, { borderColor: couleur + '30', backgroundColor: couleur + '08' }]}>
            <View style={styles.allureTitreRow}>
              <View style={[styles.allureIconeBg, { backgroundColor: couleur + '20' }]}>
                <Ionicons name="speedometer-outline" size={16} color={couleur} />
              </View>
              <Text style={styles.allureTitre}>Allure footing</Text>
            </View>
            <View style={styles.allureAffichage}>
              <View style={[styles.allurePill, { borderColor: couleur + '40' }]}>
                <Text style={[styles.allurePillTexte, { color: couleur }]}>{secondesVersAllure(allure[0])}</Text>
              </View>
              <Text style={styles.allureFleche}>→</Text>
              <View style={[styles.allurePill, { borderColor: couleur + '40' }]}>
                <Text style={[styles.allurePillTexte, { color: couleur }]}>{secondesVersAllure(allure[1])}</Text>
              </View>
              <Text style={styles.allureUnite}>min/km</Text>
            </View>
          </View>
        )}

        {/* Actions capitaine */}
        {estCapitaineDuCrew && !estMoi && (
          <View style={styles.actionsCapitaine}>
            <View style={styles.actionsSeparateur}>
              <View style={styles.actionsSeparateurLigne} />
              <Text style={styles.actionsSeparateurTexte}>Zone de modération</Text>
              <View style={styles.actionsSeparateurLigne} />
            </View>
            {sessionId && (
              <TouchableOpacity
                style={styles.actionBtnDanger}
                onPress={retirerDeLaSession}
                disabled={chargementAction}
                activeOpacity={0.8}
              >
                {chargementAction ? (
                  <ActivityIndicator color={COULEURS.danger} size="small" />
                ) : (
                  <>
                    <Ionicons name="person-remove-outline" size={18} color={COULEURS.danger} />
                    <Text style={styles.actionBtnDangerTexte}>Retirer de la session</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.actionBtnDanger}
              onPress={exclureDuCrew}
              disabled={chargementAction}
              activeOpacity={0.8}
            >
              {chargementAction ? (
                <ActivityIndicator color={COULEURS.danger} size="small" />
              ) : (
                <>
                  <Ionicons name="remove-circle-outline" size={18} color={COULEURS.danger} />
                  <Text style={styles.actionBtnDangerTexte}>Exclure du crew</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centrage: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  texteErreur: { fontSize: 16, color: COULEURS.night[400] },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: ESPACEMENT.md, paddingVertical: ESPACEMENT.sm,
    borderBottomWidth: 1, borderBottomColor: COULEURS.night[100],
  },
  boutonRetour: { width: 40, height: 40, borderRadius: RAYONS.full, alignItems: 'center', justifyContent: 'center' },
  headerTitre: { flex: 1, fontSize: 17, fontWeight: '700', color: COULEURS.night[700], textAlign: 'center' },

  contenu: { paddingBottom: 48 },

  // Identité
  identite: { alignItems: 'center', paddingTop: ESPACEMENT.xl, paddingHorizontal: ESPACEMENT.md, gap: 6 },
  avatarWrapper: { position: 'relative', marginBottom: 4 },
  avatar: {
    width: 88, height: 88, borderRadius: 44,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
  },
  avatarTexte: { fontSize: 28, fontWeight: '800' },
  avatarImage: { width: 88, height: 88, borderRadius: 44 },
  badgeMoi: {
    position: 'absolute', bottom: 2, right: 2,
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  nom: { fontSize: 26, fontWeight: '800', color: COULEURS.night[700], letterSpacing: -0.5 },
  username: { fontSize: 14, fontWeight: '500' },
  bio: { fontSize: 14, color: COULEURS.night[400], textAlign: 'center', lineHeight: 20, marginTop: 2 },

  // Stats
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: ESPACEMENT.md, marginTop: ESPACEMENT.lg,
    backgroundColor: COULEURS.night[50], borderRadius: RAYONS.xl,
  },
  statCard: { flex: 1, alignItems: 'center', paddingVertical: ESPACEMENT.md },
  statSep: { borderLeftWidth: 1, borderLeftColor: COULEURS.night[100] },
  statValeur: { fontSize: 24, fontWeight: '800' },
  statLabel: { fontSize: 11, fontWeight: '600', color: COULEURS.night[400], marginTop: 2 },

  // Actions capitaine
  actionsCapitaine: {
    marginHorizontal: ESPACEMENT.md,
    marginTop: ESPACEMENT.xl,
    marginBottom: ESPACEMENT.xl,
    gap: ESPACEMENT.sm,
  },
  actionsSeparateur: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ESPACEMENT.sm,
    marginBottom: ESPACEMENT.sm,
  },
  actionsSeparateurLigne: {
    flex: 1,
    height: 1,
    backgroundColor: COULEURS.night[100],
  },
  actionsSeparateurTexte: {
    fontSize: 11,
    fontWeight: '600',
    color: COULEURS.night[300],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  actionBtnDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: RAYONS.full,
    borderWidth: 1.5,
    borderColor: COULEURS.danger,
    backgroundColor: '#FFF5F5',
  },
  actionBtnDangerTexte: {
    fontSize: 15,
    fontWeight: '600',
    color: COULEURS.danger,
  },

  // Allure
  allureBloc: {
    marginHorizontal: ESPACEMENT.md, marginTop: ESPACEMENT.lg,
    borderRadius: RAYONS.xl, padding: ESPACEMENT.md,
    borderWidth: 1, gap: ESPACEMENT.sm,
  },
  allureTitreRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  allureIconeBg: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  allureTitre: { fontSize: 15, fontWeight: '700', color: COULEURS.night[700] },
  allureAffichage: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  allurePill: {
    flex: 1, backgroundColor: '#fff', borderRadius: RAYONS.lg,
    paddingVertical: 8, alignItems: 'center', borderWidth: 1.5,
  },
  allurePillTexte: { fontSize: 18, fontWeight: '800' },
  allureFleche: { fontSize: 18, color: COULEURS.night[400], fontWeight: '600' },
  allureUnite: { fontSize: 12, fontWeight: '600', color: COULEURS.night[400] },
});
