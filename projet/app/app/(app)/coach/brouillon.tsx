import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COULEURS, ESPACEMENT, RAYONS } from '../../../src/lib/constantes';
import { useAuthStore } from '../../../src/stores/useAuthStore';
import { GroupeBrouillon, useCoachStore } from '../../../src/stores/useCoachStore';
import { TypeEntrainement } from '../../../src/types/base';
import { EtapeDeroulement } from '../../../src/types/session';

function decimalVersAllure(val: number): string {
  const str = val.toFixed(2);
  const [min, sec] = str.split('.');
  return `${min}:${sec}`;
}

function formaterDateComplete(iso: string): string {
  const d = new Date(iso);
  const jour = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${jour[0].toUpperCase()}${jour.slice(1)} · ${heure}`;
}

function formaterHeure(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

const COULEURS_TYPE: Record<TypeEntrainement, string> = {
  fractionne: COULEURS.legend[500],
  seuil: COULEURS.danger,
  tempo: '#F59E0B',
  footing: COULEURS.succes,
  sortie_longue: COULEURS.info,
  libre: COULEURS.night[500],
};

const LABELS_TYPE: Record<TypeEntrainement, string> = {
  fractionne: 'Fractionné',
  seuil: 'Seuil',
  tempo: 'Tempo',
  footing: 'Footing',
  sortie_longue: 'Sortie longue',
  libre: 'Libre',
};

const COULEURS_BORD_GROUPE = [
  COULEURS.volt[500],
  COULEURS.legend[500],
  COULEURS.info,
  COULEURS.avertissement,
  COULEURS.danger,
];

export default function PageBrouillonCoach() {
  const { crewId } = useLocalSearchParams<{ crewId: string }>();
  const authSession = useAuthStore((s) => s.session);
  const { brouillon, chargement, erreur, publierPlan, reinitialiser } = useCoachStore();

  if (!brouillon) {
    return (
      <SafeAreaView style={styles.centrage}>
        <Text style={styles.texteVide}>Aucun brouillon à afficher.</Text>
        <TouchableOpacity style={styles.boutonSecondaire} onPress={() => router.back()}>
          <Text style={styles.boutonSecondaireTexte}>Retour</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const couleurType = COULEURS_TYPE[brouillon.type_entrainement];

  async function handlePublier() {
    if (!crewId || !authSession?.user?.id) return;
    try {
      const sessionId = await publierPlan(crewId, authSession.user.id);
      reinitialiser();
      router.replace(`/session/${sessionId}` as any);
    } catch {
      // erreur déjà affichée via le store
    }
  }

  function handleRegenerer() {
    router.back();
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.boutonRetour} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={COULEURS.night[700]} />
        </TouchableOpacity>
        <Text style={styles.headerTitre}>Le plan de Kipper</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.contenu}>
        {/* Hero */}
        <View style={[styles.hero, { backgroundColor: couleurType }]}>
          <View style={styles.heroOverlay} />
          <View style={styles.heroContenu}>
            <View style={styles.heroBadgesLigne}>
              <View style={[styles.typeBadge, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                <Text style={styles.typeBadgeTexte}>{LABELS_TYPE[brouillon.type_entrainement].toUpperCase()}</Text>
              </View>
              <View style={styles.kipperPill}>
                <Ionicons name="flash" size={11} color={COULEURS.night[700]} />
                <Text style={styles.kipperPillTexte}>Kipper</Text>
              </View>
            </View>
            <Text style={styles.heroTitre}>{brouillon.titre}</Text>
            <Text style={styles.heroDate}>{formaterDateComplete(brouillon.heure_rdv)}</Text>
          </View>
        </View>

        {/* Grille info */}
        <View style={styles.grilleInfo}>
          <CarteInfo icone="time-outline" label="HEURE" valeur={formaterHeure(brouillon.heure_rdv)} />
          <CarteInfo icone="hourglass-outline" label="DURÉE" valeur={`${brouillon.duree_entrainement_min} min`} />
          {brouillon.point_rdv && (
            <CarteInfo icone="location-outline" label="LIEU" valeur={brouillon.point_rdv} />
          )}
          {brouillon.distance_km != null && (
            <CarteInfo icone="navigate-outline" label="DISTANCE" valeur={`${brouillon.distance_km} km`} />
          )}
        </View>

        {/* Déroulé */}
        <View style={styles.accordeon}>
          <Text style={styles.accordeonTitre}>Déroulé de la séance</Text>
          <View style={styles.timeline}>
            {brouillon.deroulement.map((etape, index) => (
              <EtapeTimelinePreview
                key={etape.ordre}
                etape={etape}
                estDerniere={index === brouillon.deroulement.length - 1}
                couleur={couleurType}
              />
            ))}
          </View>
        </View>

        {/* Groupes d'allure */}
        {brouillon.groupes.length > 0 && (
          <View style={styles.accordeon}>
            <Text style={styles.accordeonTitre}>Groupes d'allure</Text>
            <Text style={styles.groupesSousTitre}>
              {brouillon.groupes.length} groupe{brouillon.groupes.length > 1 ? 's' : ''} proposé
              {brouillon.groupes.length > 1 ? 's' : ''} par Kipper
            </Text>
            <View style={styles.groupesListe}>
              {brouillon.groupes.map((g, i) => (
                <CarteGroupeAllurePreview
                  key={g.nom + i}
                  groupe={g}
                  couleur={COULEURS_BORD_GROUPE[i % COULEURS_BORD_GROUPE.length]}
                />
              ))}
            </View>
          </View>
        )}

        {erreur && (
          <View style={styles.erreurBloc}>
            <Ionicons name="alert-circle" size={18} color={COULEURS.danger} />
            <Text style={styles.erreurTexte}>{erreur}</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.barreAction}>
        <TouchableOpacity style={styles.boutonRegenerer} onPress={handleRegenerer} disabled={chargement}>
          <Ionicons name="refresh" size={18} color={COULEURS.night[500]} />
          <Text style={styles.boutonRegenererTexte}>Régénérer</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.boutonPublier, chargement && styles.boutonDesactive]}
          onPress={handlePublier}
          disabled={chargement}
          activeOpacity={0.85}
        >
          {chargement ? (
            <ActivityIndicator color={COULEURS.night[700]} />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={18} color={COULEURS.night[700]} />
              <Text style={styles.boutonPublierTexte}>Publier</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function CarteInfo({
  icone,
  label,
  valeur,
}: {
  icone: keyof typeof Ionicons.glyphMap;
  label: string;
  valeur: string;
}) {
  return (
    <View style={styles.carteInfo}>
      <Ionicons name={icone} size={20} color={COULEURS.legend[500]} />
      <View>
        <Text style={styles.carteInfoLabel}>{label}</Text>
        <Text style={styles.carteInfoValeur} numberOfLines={1}>{valeur}</Text>
      </View>
    </View>
  );
}

function EtapeTimelinePreview({
  etape,
  estDerniere,
  couleur,
}: {
  etape: EtapeDeroulement;
  estDerniere: boolean;
  couleur: string;
}) {
  return (
    <View style={styles.etapeContainer}>
      <View style={styles.etapeGauche}>
        <View style={[styles.etapePoint, { backgroundColor: couleur }]}>
          <View style={styles.etapePointInterne} />
        </View>
        {!estDerniere && <View style={[styles.etapeLigne, { backgroundColor: couleur + '40' }]} />}
      </View>
      <View style={styles.etapeCorps}>
        <Text style={styles.etapeTitre}>{etape.titre}</Text>
        <Text style={[styles.etapeMeta, { color: couleur }]}>
          {etape.duree_min} min{etape.description ? ` · ${etape.description}` : ''}
        </Text>
      </View>
    </View>
  );
}

function CarteGroupeAllurePreview({ groupe, couleur }: { groupe: GroupeBrouillon; couleur: string }) {
  return (
    <View style={[styles.carteGroupe, { borderLeftColor: couleur }]}>
      <View style={styles.carteGroupeHeader}>
        <Text style={styles.carteGroupeNom}>{groupe.nom}</Text>
        <View style={[styles.allureBadge, { backgroundColor: couleur + '18' }]}>
          <Text style={[styles.allureTexte, { color: couleur }]}>
            {decimalVersAllure(groupe.allure_basse)} – {decimalVersAllure(groupe.allure_haute)} /km
          </Text>
        </View>
      </View>
      {groupe.consignes && <Text style={styles.carteGroupeConsignes}>{groupe.consignes}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centrage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: ESPACEMENT.md, backgroundColor: '#fff' },
  texteVide: { fontSize: 15, color: COULEURS.night[400] },
  boutonSecondaire: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: COULEURS.night[50], borderRadius: RAYONS.full },
  boutonSecondaireTexte: { fontWeight: '600', color: COULEURS.night[700] },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: ESPACEMENT.md,
    paddingVertical: ESPACEMENT.sm,
    borderBottomWidth: 1,
    borderBottomColor: COULEURS.night[100],
  },
  boutonRetour: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitre: { flex: 1, fontSize: 17, fontWeight: '700', color: COULEURS.night[700], textAlign: 'center' },

  contenu: { paddingBottom: 20 },

  hero: { padding: ESPACEMENT.md, gap: 6, overflow: 'hidden' },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.1)' },
  heroContenu: { gap: 6 },
  heroBadgesLigne: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  typeBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: RAYONS.full },
  typeBadgeTexte: { fontSize: 11, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
  kipperPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COULEURS.volt[400], paddingHorizontal: 10, paddingVertical: 4, borderRadius: RAYONS.full,
  },
  kipperPillTexte: { fontSize: 11, fontWeight: '700', color: COULEURS.night[700] },
  heroTitre: { fontSize: 24, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  heroDate: { fontSize: 13, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },

  grilleInfo: { flexDirection: 'row', flexWrap: 'wrap', gap: ESPACEMENT.sm, padding: ESPACEMENT.md },
  carteInfo: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COULEURS.night[50], borderRadius: RAYONS.lg,
    paddingHorizontal: 12, paddingVertical: 10, flexBasis: '47%', flexGrow: 1,
  },
  carteInfoLabel: { fontSize: 10, fontWeight: '700', color: COULEURS.night[400], letterSpacing: 0.5, textTransform: 'uppercase' },
  carteInfoValeur: { fontSize: 14, fontWeight: '600', color: COULEURS.night[700], marginTop: 1 },

  accordeon: { marginHorizontal: ESPACEMENT.md, marginTop: ESPACEMENT.lg, backgroundColor: COULEURS.night[50], borderRadius: RAYONS.xl, padding: ESPACEMENT.md, overflow: 'hidden' },
  accordeonTitre: { fontSize: 17, fontWeight: '700', color: COULEURS.night[700] },

  timeline: { paddingTop: ESPACEMENT.md, paddingLeft: 4 },
  etapeContainer: { flexDirection: 'row', gap: 12 },
  etapeGauche: { alignItems: 'center', width: 20 },
  etapePoint: { width: 20, height: 20, borderRadius: RAYONS.full, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  etapePointInterne: { width: 8, height: 8, borderRadius: RAYONS.full, backgroundColor: '#fff' },
  etapeLigne: { width: 2, flex: 1, marginVertical: 2, minHeight: 20 },
  etapeCorps: { flex: 1, paddingBottom: ESPACEMENT.md, paddingTop: 1 },
  etapeTitre: { fontSize: 15, fontWeight: '600', color: COULEURS.night[700] },
  etapeMeta: { fontSize: 13, marginTop: 3, lineHeight: 18 },

  groupesSousTitre: { fontSize: 13, color: COULEURS.night[400], marginTop: 4, marginBottom: 4 },
  groupesListe: { gap: ESPACEMENT.sm, marginTop: 8 },
  carteGroupe: {
    backgroundColor: '#fff', borderLeftWidth: 4, borderRadius: 4,
    borderTopRightRadius: RAYONS.lg, borderBottomRightRadius: RAYONS.lg,
    padding: ESPACEMENT.md, gap: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  carteGroupeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  carteGroupeNom: { fontSize: 15, fontWeight: '700', color: COULEURS.night[700], flex: 1 },
  allureBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RAYONS.full },
  allureTexte: { fontSize: 13, fontWeight: '700' },
  carteGroupeConsignes: { fontSize: 13, color: COULEURS.night[400], lineHeight: 18 },

  erreurBloc: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF2F2', borderRadius: RAYONS.md, padding: ESPACEMENT.sm, marginHorizontal: ESPACEMENT.md, marginTop: ESPACEMENT.md },
  erreurTexte: { flex: 1, fontSize: 13, color: COULEURS.danger },

  barreAction: {
    flexDirection: 'row', gap: ESPACEMENT.sm,
    padding: ESPACEMENT.md, borderTopWidth: 1, borderTopColor: COULEURS.night[100], backgroundColor: '#fff',
  },
  boutonRegenerer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: COULEURS.night[50], borderRadius: RAYONS.full, paddingVertical: 14, paddingHorizontal: 16,
  },
  boutonRegenererTexte: { fontSize: 15, fontWeight: '600', color: COULEURS.night[500] },
  boutonPublier: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COULEURS.volt[400], borderRadius: RAYONS.full, paddingVertical: 14,
  },
  boutonPublierTexte: { fontSize: 16, fontWeight: '700', color: COULEURS.night[700] },
  boutonDesactive: { opacity: 0.6 },
});
