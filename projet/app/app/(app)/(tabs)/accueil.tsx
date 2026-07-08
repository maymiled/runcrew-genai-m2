import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import * as Haptics from 'expo-haptics';
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
import { COULEURS, ESPACEMENT, RAYONS } from '../../../src/lib/constantes';
import { annulerRappelSession, planifierRappelSession } from '../../../src/lib/notifications';
import { supabase } from '../../../src/lib/supabase';
import { useAuthStore } from '../../../src/stores/useAuthStore';
import { useProfilStore } from '../../../src/stores/useProfilStore';
import { TypeEntrainement, StatutConfirmation } from '../../../src/types/base';
import { Crew } from '../../../src/types/crew';
import { Session } from '../../../src/types/session';
import { Profil } from '../../../src/types/profil';

// ─── Types locaux ────────────────────────────────────────────────────────────

type SessionAvecCrew = Session & { crews: { nom: string } };
type MembreAvecCrew = { crew_id: string; crews: Crew };

// ─── Helpers ────────────────────────────────────────────────────────────────

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

function formaterDateCourte(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const demain = new Date(now);
  demain.setDate(now.getDate() + 1);
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  if (d.toDateString() === now.toDateString()) return `Aujourd'hui · ${heure}`;
  if (d.toDateString() === demain.toDateString()) return `Demain · ${heure}`;

  const jour = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });
  return `${jour[0].toUpperCase()}${jour.slice(1)} · ${heure}`;
}

function premierPrenom(nom: string): string {
  return nom.split(' ')[0];
}

function initialesNom(nom: string): string {
  return nom.split(' ').slice(0, 2).map((m) => m[0]?.toUpperCase() ?? '').join('');
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function Accueil() {
  const authSession = useAuthStore((s) => s.session);
  const profilStore = useProfilStore((s) => s.profil);

  const [profil, setProfil] = useState<Profil | null>(null);
  const [mesCrews, setMesCrews] = useState<MembreAvecCrew[]>([]);
  const [sessions, setSessions] = useState<SessionAvecCrew[]>([]);
  const [confirmations, setConfirmations] = useState<
    Record<string, { id: string; statut: StatutConfirmation }>
  >({});
  const [nbRunsValides, setNbRunsValides] = useState(0);
  const [totalKmValides, setTotalKmValides] = useState(0);
  const [chargement, setChargement] = useState(true);
  const [rafraichissement, setRafraichissement] = useState(false);
  const [chargementBtn, setChargementBtn] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!authSession?.user?.id) return;
      chargerTout();
    }, [authSession?.user?.id])
  );

  async function chargerTout() {
    setChargement(true);
    const userId = authSession!.user.id;

    const [{ data: profilData }, { data: membresData }, { data: runsData }] = await Promise.all([
      supabase.from('profils').select('*').eq('id', userId).single(),
      supabase.from('membres').select('crew_id, crews(*)').eq('utilisateur_id', userId),
      supabase
        .from('confirmations')
        .select('session_id, sessions!inner(validee, distance_km)')
        .eq('utilisateur_id', userId)
        .eq('statut', 'present')
        .eq('sessions.validee', true),
    ]);

    setNbRunsValides(runsData?.length ?? 0);
    const totalKmReel = (runsData ?? []).reduce((acc: number, r: any) => acc + (r.sessions?.distance_km ?? 0), 0);
    setTotalKmValides(Math.round(totalKmReel));

    if (profilData) setProfil(profilData as Profil);
    // Le store est la source de vérité pour le nom — pas besoin de re-fetch si déjà chargé

    const crewIds = membresData?.map((m: any) => m.crew_id) ?? [];
    if (membresData) setMesCrews(membresData as unknown as MembreAvecCrew[]);

    if (crewIds.length === 0) {
      setChargement(false);
      return;
    }

    const [{ data: sessionsData }, { data: confsData }] = await Promise.all([
      supabase
        .from('sessions')
        .select('*, crews(nom)')
        .in('crew_id', crewIds)
        .gte('heure_rdv', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('heure_rdv', { ascending: true })
        .limit(10),
      supabase
        .from('confirmations')
        .select('id, session_id, statut')
        .eq('utilisateur_id', userId),
    ]);

    if (sessionsData) setSessions(sessionsData as SessionAvecCrew[]);

    if (confsData) {
      const map: Record<string, { id: string; statut: StatutConfirmation }> = {};
      for (const c of confsData) {
        map[c.session_id] = { id: c.id, statut: c.statut };
      }
      setConfirmations(map);
    }

    setChargement(false);
  }

  async function togglePresence(session: SessionAvecCrew) {
    if (!authSession?.user?.id || chargementBtn) return;
    setChargementBtn(true);

    const conf = confirmations[session.id];
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (!conf) {
        const { data } = await supabase
          .from('confirmations')
          .insert({ session_id: session.id, utilisateur_id: authSession.user.id, statut: 'present' })
          .select('id, statut')
          .single();
        if (data) {
          setConfirmations((prev) => ({ ...prev, [session.id]: data }));
          setSessions((prev) =>
            prev.map((s) => s.id === session.id ? { ...s, nb_presents: s.nb_presents + 1 } : s)
          );
          planifierRappelSession({
            sessionId: session.id,
            titre: session.titre,
            heureRdv: session.heure_rdv,
            pointRdv: session.point_rdv,
          });
        }
      } else {
        const nouveauStatut: StatutConfirmation = conf.statut === 'present' ? 'absent' : 'present';
        await supabase.from('confirmations').update({ statut: nouveauStatut }).eq('id', conf.id);
        const delta = nouveauStatut === 'present' ? 1 : -1;
        setConfirmations((prev) => ({ ...prev, [session.id]: { ...conf, statut: nouveauStatut } }));
        setSessions((prev) =>
          prev.map((s) => s.id === session.id ? { ...s, nb_presents: Math.max(0, s.nb_presents + delta) } : s)
        );
        if (nouveauStatut === 'present') {
          planifierRappelSession({
            sessionId: session.id,
            titre: session.titre,
            heureRdv: session.heure_rdv,
            pointRdv: session.point_rdv,
          });
        } else {
          annulerRappelSession(session.id);
        }
      }
    } finally {
      setChargementBtn(false);
    }
  }

  if (chargement) {
    return (
      <View style={styles.centrage}>
        <ActivityIndicator color={COULEURS.legend[500]} size="large" />
      </View>
    );
  }

  const maintenant = new Date();
  const sessionsFutures = sessions.filter(s => new Date(s.heure_rdv) >= maintenant);
  const prochaineSession = sessionsFutures[0] ?? null;
  const autresSessions = sessionsFutures.slice(1);
  const pasDeCrew = mesCrews.length === 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>RunCrew</Text>
        {profil && (
          <TouchableOpacity onPress={() => router.push('/(app)/(tabs)/profil')} activeOpacity={0.8}>
            <View style={styles.avatarMini}>
              {(profilStore?.photo_url ?? profil?.photo_url) ? (
                <Image
                  source={{ uri: profilStore?.photo_url ?? profil!.photo_url! }}
                  style={styles.avatarMiniImage}
                  contentFit="cover"
                />
              ) : (
                <Text style={styles.avatarMiniTexte}>
                  {initialesNom(profilStore?.nom_affichage ?? profil?.nom_affichage ?? '')}
                </Text>
              )}
            </View>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contenu}
        refreshControl={
          <RefreshControl
            refreshing={rafraichissement}
            onRefresh={async () => {
              setRafraichissement(true);
              await chargerTout();
              setRafraichissement(false);
            }}
            tintColor={COULEURS.legend[500]}
            colors={[COULEURS.legend[500]]}
          />
        }
      >
        {/* Salutation */}
        <View style={styles.salutation}>
          <Text style={styles.salutationTitre}>
            Salut {premierPrenom(profilStore?.nom_affichage ?? profil?.nom_affichage ?? '')} 👋
          </Text>
          <Text style={styles.salutationSous}>
            {pasDeCrew ? 'Crée ton premier crew pour commencer.' : 'Prêt à courir ?'}
          </Text>
        </View>

        {/* État vide — pas de crew */}
        {pasDeCrew && (
          <View style={styles.etatVideCrews}>
            <Ionicons name="people-outline" size={48} color={COULEURS.night[200]} />
            <Text style={styles.etatVideTitre}>Aucun crew pour l'instant</Text>
            <Text style={styles.etatVideTexte}>
              Crée ton crew ou rejoins-en un pour voir tes sessions ici.
            </Text>
            <TouchableOpacity
              style={styles.boutonCreer}
              onPress={() => router.push('/crew/creer')}
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.boutonCreerTexte}>Créer mon crew</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.boutonRejoindre}
              onPress={() => router.push('/crew/rejoindre')}
            >
              <Ionicons name="enter-outline" size={18} color={COULEURS.legend[500]} />
              <Text style={styles.boutonRejoindreTexte}>Rejoindre avec un code</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Prochaine session — grande carte */}
        {!pasDeCrew && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitre}>Prochaine session</Text>
              {autresSessions.length > 0 && (
                <Text style={styles.lienVoirTout}>
                  {sessions.length} à venir
                </Text>
              )}
            </View>

            {!prochaineSession ? (
              <View style={styles.sessionVide}>
                <Ionicons name="calendar-outline" size={40} color={COULEURS.night[200]} />
                <Text style={styles.sessionVideTexte}>Aucune session planifiée</Text>
                <Text style={styles.sessionVideSous}>
                  Le capitaine n'a pas encore créé de session.
                </Text>
              </View>
            ) : (
              <GrandeCarteSession
                session={prochaineSession}
                confirmation={confirmations[prochaineSession.id] ?? null}
                onToggle={() => togglePresence(prochaineSession)}
                chargementBtn={chargementBtn}
              />
            )}
          </View>
        )}

        {/* Autres sessions à venir */}
        {autresSessions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitre}>Sessions à venir</Text>
            {autresSessions.map((s) => (
              <PetiteCarteSession
                key={s.id}
                session={s}
                estPresent={confirmations[s.id]?.statut === 'present'}
              />
            ))}
          </View>
        )}

        {/* Mes crews — carousel horizontal */}
        {mesCrews.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitre}>Tes crews</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.crewCarousel}
            >
              {mesCrews.map((m, index) => (
                <CarteCrewMini
                  key={m.crew_id}
                  crew={m.crews}
                  estPremier={index === 0}
                  onPress={() => router.push(`/crew/${m.crew_id}`)}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Bento stats */}
        {profil && (nbRunsValides > 0 || totalKmValides > 0) && (
          <View style={styles.bento}>
            <View style={[styles.bentoCard, styles.bentoCardViolet]}>
              <Text style={styles.bentoLabel}>TOTAL KM</Text>
              <Text style={styles.bentoValeurGrande}>{totalKmValides}</Text>
            </View>
            <TouchableOpacity
              style={[styles.bentoCard, styles.bentoCardClair]}
              onPress={() => router.push('/historique' as any)}
              activeOpacity={0.8}
            >
              <Text style={[styles.bentoLabel, { color: COULEURS.night[400] }]}>RUNS TOTAUX</Text>
              <Text style={[styles.bentoValeurGrande, { color: COULEURS.night[700] }]}>
                {nbRunsValides}
              </Text>
              <View style={styles.bentoLienRow}>
                <Text style={styles.bentoCrew}>
                  {mesCrews.length} crew{mesCrews.length > 1 ? 's' : ''}
                </Text>
                <Ionicons name="chevron-forward" size={13} color={COULEURS.night[300]} />
              </View>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Grande carte session (prochaine) ────────────────────────────────────────

function GrandeCarteSession({
  session,
  confirmation,
  onToggle,
  chargementBtn,
}: {
  session: SessionAvecCrew;
  confirmation: { id: string; statut: StatutConfirmation } | null;
  onToggle: () => void;
  chargementBtn: boolean;
}) {
  const couleur = COULEURS_TYPE[session.type_entrainement];
  const estPresent = confirmation?.statut === 'present';

  return (
    <View style={styles.grandeCarteContainer}>
      {/* Zone navigable vers le détail */}
      <TouchableOpacity
        onPress={() => router.push(`/session/${session.id}` as any)}
        activeOpacity={0.92}
      >
        <View style={[styles.grandeCerteBande, { backgroundColor: couleur }]} />
        <View style={styles.grandeCarteCorps}>
          <View style={styles.grandeCarteLigneHaut}>
            <View style={[styles.grandeCerteBadge, { backgroundColor: couleur + '18' }]}>
              <Text style={[styles.grandeCerteBadgeTexte, { color: couleur }]}>
                {LABELS_TYPE[session.type_entrainement]}
              </Text>
            </View>
            <Text style={styles.grandeCarteCrewNom}>{session.crews.nom}</Text>
          </View>
          <Text style={styles.grandeCerteTitre}>{session.titre}</Text>
          <View style={styles.grandeCarteMeta}>
            <View style={styles.grandeCarteMetaLigne}>
              <Ionicons name="calendar-outline" size={15} color={COULEURS.night[400]} />
              <Text style={styles.grandeCarteMetaTexte}>{formaterDateCourte(session.heure_rdv)}</Text>
            </View>
            {session.point_rdv && (
              <View style={styles.grandeCarteMetaLigne}>
                <Ionicons name="location-outline" size={15} color={COULEURS.night[400]} />
                <Text style={styles.grandeCarteMetaTexte} numberOfLines={1}>{session.point_rdv}</Text>
              </View>
            )}
          </View>
          <View style={styles.grandeCartePresents}>
            <View style={styles.grandeCartePresentsRow}>
              <Ionicons name="people-outline" size={16} color={COULEURS.legend[500]} />
              <Text style={styles.grandeCartePresentsTexte}>
                {session.nb_presents} coureur{session.nb_presents !== 1 ? 's' : ''} confirmé{session.nb_presents !== 1 ? 's' : ''}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>

      {/* CTA inscription — séparé pour éviter les conflits de touch */}
      <View style={styles.grandeCarteCTAZone}>
        <TouchableOpacity
          style={[styles.ctaBtn, estPresent && styles.ctaBtnPresent]}
          onPress={onToggle}
          disabled={chargementBtn}
          activeOpacity={0.85}
        >
          {chargementBtn ? (
            <ActivityIndicator color={estPresent ? COULEURS.legend[500] : COULEURS.night[700]} size="small" />
          ) : (
            <>
              <Ionicons
                name={estPresent ? 'checkmark-circle' : 'checkmark-circle-outline'}
                size={20}
                color={estPresent ? COULEURS.legend[500] : COULEURS.night[700]}
              />
              <Text style={[styles.ctaBtnTexte, estPresent && styles.ctaBtnTextePresent]}>
                {estPresent ? 'Inscrit ✓' : 'Je serai là !'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Petite carte session (liste) ─────────────────────────────────────────────

function PetiteCarteSession({
  session,
  estPresent,
}: {
  session: SessionAvecCrew;
  estPresent: boolean;
}) {
  const couleur = COULEURS_TYPE[session.type_entrainement];
  return (
    <TouchableOpacity
      style={styles.petiteCarte}
      onPress={() => router.push(`/session/${session.id}`)}
      activeOpacity={0.8}
    >
      <View style={[styles.petiteCarteAccent, { backgroundColor: couleur }]} />
      <View style={styles.petiteCarteCorps}>
        <Text style={styles.petiteCerteTitre} numberOfLines={1}>{session.titre}</Text>
        <Text style={styles.petiteCarteMeta}>
          {session.crews.nom} · {formaterDateCourte(session.heure_rdv)}
        </Text>
      </View>
      {estPresent && (
        <Ionicons name="checkmark-circle" size={20} color={COULEURS.legend[400]} />
      )}
      <Ionicons name="chevron-forward" size={18} color={COULEURS.night[300]} />
    </TouchableOpacity>
  );
}

// ─── Carte crew mini (carousel) ───────────────────────────────────────────────

function CarteCrewMini({
  crew,
  estPremier,
  onPress,
}: {
  crew: Crew;
  estPremier: boolean;
  onPress: () => void;
}) {
  const avecPhoto = !!crew.photo_url;
  return (
    <TouchableOpacity
      style={[
        styles.crewCard,
        !avecPhoto && estPremier && styles.crewCardPrimaire,
        avecPhoto && styles.crewCardAvecPhoto,
      ]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {avecPhoto && (
        <Image source={{ uri: crew.photo_url! }} style={StyleSheet.absoluteFill} contentFit="cover" />
      )}
      {avecPhoto && <View style={styles.crewCardPhotoOverlay} />}

      {!avecPhoto && (
        <View style={[styles.crewCardIcone, estPremier && styles.crewCardIconePrimaire]}>
          <Text style={[styles.crewCardInitiales, estPremier && { color: COULEURS.legend[500] }]}>
            {crew.nom.substring(0, 2).toUpperCase()}
          </Text>
        </View>
      )}
      <Text
        style={[
          styles.crewCardNom,
          !avecPhoto && estPremier && styles.crewCardNomPrimaire,
          avecPhoto && styles.crewCardNomPhoto,
        ]}
        numberOfLines={2}
      >
        {crew.nom}
      </Text>
      <Text
        style={[
          styles.crewCardVille,
          !avecPhoto && estPremier && styles.crewCardVillePrimaire,
          avecPhoto && styles.crewCardVillePhoto,
        ]}
      >
        {crew.ville}
      </Text>
      {crew.serie_actuelle > 0 && (
        <View style={styles.crewCardStreak}>
          <Text style={styles.crewCardStreakEmoji}>🔥</Text>
          <Text style={[styles.crewCardStreakTexte, (estPremier || avecPhoto) && { color: 'rgba(255,255,255,0.85)' }]}>
            {crew.serie_actuelle} streak
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

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
  logo: { fontSize: 26, fontWeight: '800', color: COULEURS.legend[500] },
  avatarMini: {
    width: 36,
    height: 36,
    borderRadius: RAYONS.full,
    backgroundColor: COULEURS.legend[100],
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarMiniImage: { width: 36, height: 36, borderRadius: RAYONS.full },
  avatarMiniTexte: { fontSize: 13, fontWeight: '700', color: COULEURS.legend[500] },

  contenu: { paddingBottom: ESPACEMENT['3xl'] },

  salutation: {
    paddingHorizontal: ESPACEMENT.md,
    paddingTop: ESPACEMENT.lg,
    paddingBottom: ESPACEMENT.sm,
  },
  salutationTitre: { fontSize: 28, fontWeight: '800', color: COULEURS.night[700], letterSpacing: -0.5 },
  salutationSous: { fontSize: 15, color: COULEURS.night[400], marginTop: 2 },

  // État vide
  etatVideCrews: {
    alignItems: 'center',
    padding: ESPACEMENT.xl,
    gap: ESPACEMENT.sm,
    marginHorizontal: ESPACEMENT.md,
    marginTop: ESPACEMENT.md,
    backgroundColor: COULEURS.night[50],
    borderRadius: RAYONS.xl,
  },
  etatVideTitre: { fontSize: 18, fontWeight: '700', color: COULEURS.night[600] },
  etatVideTexte: { fontSize: 14, color: COULEURS.night[400], textAlign: 'center', lineHeight: 20 },
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
  boutonRejoindre: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: COULEURS.legend[500],
    borderRadius: RAYONS.full,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: ESPACEMENT.sm,
  },
  boutonRejoindreTexte: { color: COULEURS.legend[500], fontSize: 15, fontWeight: '600' },

  // Section
  section: { paddingHorizontal: ESPACEMENT.md, marginTop: ESPACEMENT.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: ESPACEMENT.sm },
  sectionTitre: { fontSize: 18, fontWeight: '700', color: COULEURS.night[700], marginBottom: ESPACEMENT.sm },
  lienVoirTout: { fontSize: 13, fontWeight: '600', color: COULEURS.legend[500] },

  // Session vide
  sessionVide: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: ESPACEMENT.xl,
    backgroundColor: COULEURS.night[50],
    borderRadius: RAYONS.xl,
  },
  sessionVideTexte: { fontSize: 16, fontWeight: '600', color: COULEURS.night[500] },
  sessionVideSous: { fontSize: 13, color: COULEURS.night[300], textAlign: 'center' },

  // Grande carte session
  grandeCarteContainer: {
    backgroundColor: '#fff',
    borderRadius: RAYONS.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COULEURS.night[100],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
  },
  grandeCerteBande: { height: 5 },
  grandeCarteCorps: { padding: ESPACEMENT.md, gap: ESPACEMENT.sm },
  grandeCarteLigneHaut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  grandeCerteBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RAYONS.full,
  },
  grandeCerteBadgeTexte: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  grandeCarteCrewNom: { fontSize: 12, fontWeight: '600', color: COULEURS.night[400] },
  grandeCerteTitre: { fontSize: 20, fontWeight: '800', color: COULEURS.night[700], letterSpacing: -0.3 },
  grandeCarteMeta: { gap: 4 },
  grandeCarteMetaLigne: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  grandeCarteMetaTexte: { fontSize: 14, color: COULEURS.night[500] },
  grandeCartePresents: { marginTop: 2 },
  grandeCartePresentsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  grandeCartePresentsTexte: { fontSize: 13, fontWeight: '600', color: COULEURS.legend[500] },

  grandeCarteCTAZone: {
    paddingHorizontal: ESPACEMENT.md,
    paddingBottom: ESPACEMENT.md,
  },
  // CTA bouton dans grande carte
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COULEURS.volt[400],
    borderRadius: RAYONS.full,
    paddingVertical: 14,
    marginTop: ESPACEMENT.xs,
  },
  ctaBtnPresent: {
    backgroundColor: COULEURS.legend[50],
    borderWidth: 1.5,
    borderColor: COULEURS.legend[200],
  },
  ctaBtnTexte: { fontSize: 16, fontWeight: '800', color: COULEURS.night[700] },
  ctaBtnTextePresent: { color: COULEURS.legend[500] },

  // Petite carte session
  petiteCarte: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ESPACEMENT.sm,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COULEURS.night[50],
  },
  petiteCarteAccent: { width: 4, height: 40, borderRadius: RAYONS.full },
  petiteCarteCorps: { flex: 1 },
  petiteCerteTitre: { fontSize: 15, fontWeight: '600', color: COULEURS.night[700] },
  petiteCarteMeta: { fontSize: 13, color: COULEURS.night[400], marginTop: 2 },

  // Crew carousel
  crewCarousel: { gap: ESPACEMENT.sm, paddingBottom: ESPACEMENT.xs },
  crewCard: {
    width: 160,
    backgroundColor: COULEURS.night[50],
    borderRadius: RAYONS.xl,
    padding: ESPACEMENT.md,
    gap: ESPACEMENT.xs,
    overflow: 'hidden',
  },
  crewCardPrimaire: { backgroundColor: COULEURS.night[700] },
  crewCardAvecPhoto: { backgroundColor: COULEURS.night[700] },
  crewCardPhotoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  crewCardIcone: {
    width: 44,
    height: 44,
    borderRadius: RAYONS.md,
    backgroundColor: COULEURS.legend[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: ESPACEMENT.xs,
  },
  crewCardIconePrimaire: { backgroundColor: 'rgba(255,255,255,0.15)' },
  crewCardInitiales: { fontSize: 16, fontWeight: '800', color: COULEURS.night[500] },
  crewCardNom: { fontSize: 15, fontWeight: '700', color: COULEURS.night[700] },
  crewCardNomPrimaire: { color: '#fff' },
  crewCardNomPhoto: { color: '#fff' },
  crewCardVille: { fontSize: 12, color: COULEURS.night[400] },
  crewCardVillePrimaire: { color: 'rgba(255,255,255,0.6)' },
  crewCardVillePhoto: { color: 'rgba(255,255,255,0.7)' },
  crewCardStreak: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  crewCardStreakEmoji: { fontSize: 12 },
  crewCardStreakTexte: { fontSize: 11, fontWeight: '600', color: COULEURS.night[400] },

  // Bento stats
  bento: {
    flexDirection: 'row',
    gap: ESPACEMENT.sm,
    marginHorizontal: ESPACEMENT.md,
    marginTop: ESPACEMENT.lg,
  },
  bentoCard: {
    flex: 1,
    borderRadius: RAYONS.xl,
    padding: ESPACEMENT.md,
    gap: 4,
  },
  bentoCardViolet: { backgroundColor: COULEURS.legend[500] },
  bentoCardClair: { backgroundColor: COULEURS.night[50] },
  bentoLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 0.5 },
  bentoValeurGrande: { fontSize: 32, fontWeight: '800', color: '#fff', letterSpacing: -1 },
  bentoCrew: { fontSize: 12, color: COULEURS.night[400] },
  bentoLienRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
});
