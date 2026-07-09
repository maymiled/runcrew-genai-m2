import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COULEURS, ESPACEMENT, RAYONS } from '../../../src/lib/constantes';
import { annulerRappelSession, planifierRappelSession } from '../../../src/lib/notifications';
import { supabase } from '../../../src/lib/supabase';
import { useAuthStore } from '../../../src/stores/useAuthStore';
import { TypeEntrainement, StatutConfirmation } from '../../../src/types/base';
import { Session, GroupeAllure, EtapeDeroulement, BilanSeance } from '../../../src/types/session';
import { analyserSeance, analyserSeanceDebug, AnalyseResultat, EvenementDebug } from '../../../src/lib/coach';
import TraceDebug from '../../../src/components/TraceDebug';

// ─── Helpers ────────────────────────────────────────────────────────────────

function decimalVersAllure(val: number): string {
  const str = val.toFixed(2);
  const [min, sec] = str.split('.');
  return `${min}:${sec}`;
}

// Convertit un float min+sec/60 (ex: 4.5 → "4:30") pour les allures workout
function minutesVersAllure(val: number): string {
  const min = Math.floor(val);
  const sec = Math.round((val - min) * 60);
  return `${min}:${String(sec).padStart(2, '0')}`;
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

function ouvrirMaps(lieu: string) {
  const q = encodeURIComponent(lieu);
  const url = Platform.OS === 'ios'
    ? `maps://?q=${q}`
    : `https://www.google.com/maps/search/?api=1&query=${q}`;
  Linking.openURL(url).catch(() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`));
}

const COULEURS_BORD_GROUPE = [
  COULEURS.volt[500],
  COULEURS.legend[500],
  COULEURS.info,
  COULEURS.avertissement,
  COULEURS.danger,
];

// ─── Helpers avatar ──────────────────────────────────────────────────────────

const PALETTE_AVATAR = [COULEURS.legend[500], '#F59E0B', COULEURS.info, '#10B981', COULEURS.danger, '#8B5CF6'];

function teintAvatar(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  return PALETTE_AVATAR[Math.abs(hash) % PALETTE_AVATAR.length];
}

function initialesAvatar(nom: string): string {
  const parts = nom.trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return nom.slice(0, 2).toUpperCase();
}

// ─── Types locaux ────────────────────────────────────────────────────────────

type ConfirmationLocale = { id: string; statut: StatutConfirmation } | null;

type Participant = {
  id: string;
  utilisateur_id: string;
  profils: { nom_affichage: string; nom_utilisateur: string }[] | null;
};

// ─── Composant principal ─────────────────────────────────────────────────────

export default function PageSession() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const authSession = useAuthStore((s) => s.session);

  const [sessionData, setSessionData] = useState<Session | null>(null);
  const [groupes, setGroupes] = useState<GroupeAllure[]>([]);
  const [confirmation, setConfirmation] = useState<ConfirmationLocale>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [chargement, setChargement] = useState(true);
  const [chargementBtn, setChargementBtn] = useState(false);
  const [chargementValidation, setChargementValidation] = useState(false);
  const [distanceValidation, setDistanceValidation] = useState('');
  const [deroulementOuvert, setDeroulementOuvert] = useState(true);
  const [groupesOuvert, setGroupesOuvert] = useState(true);
  const [participantsOuvert, setParticipantsOuvert] = useState(true);

  // Bilan de séance
  const [bilanExistant, setBilanExistant] = useState<BilanSeance | null>(null);
  // Analyse collective (capitaine)
  const [analyseEnCours, setAnalyseEnCours] = useState(false);
  const [analyseResultat, setAnalyseResultat] = useState<AnalyseResultat | null>(null);
  const [analyseEtape, setAnalyseEtape] = useState(0);
  const [modeDebugAnalyse, setModeDebugAnalyse] = useState(false);
  const [evenementsDebugAnalyse, setEvenementsDebugAnalyse] = useState<EvenementDebug[]>([]);
  const [bilanMin, setBilanMin] = useState(5);
  const [bilanSec, setBilanSec] = useState(30);
  const [bilanRessenti, setBilanRessenti] = useState<number | null>(null);
  const [bilanCommentaire, setBilanCommentaire] = useState('');
  const [soumissionBilan, setSoumissionBilan] = useState(false);

  const userId = authSession?.user?.id;

  useEffect(() => {
    if (!id) return;
    chargerTout();
  }, [id, userId]);

  async function chargerTout() {
    setChargement(true);

    const [{ data: sess }, { data: grp }, { data: conf }, { data: parts }, { data: bilan }] = await Promise.all([
      supabase.from('sessions').select('*').eq('id', id).single(),
      supabase.from('groupes_allure').select('*').eq('session_id', id).order('ordre'),
      userId
        ? supabase
            .from('confirmations')
            .select('id, statut')
            .eq('session_id', id)
            .eq('utilisateur_id', userId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from('confirmations')
        .select('id, utilisateur_id, profils(nom_affichage, nom_utilisateur)')
        .eq('session_id', id)
        .eq('statut', 'present')
        .order('cree_le'),
      userId
        ? supabase
            .from('allures_reelles')
            .select('*')
            .eq('session_id', id)
            .eq('utilisateur_id', userId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    if (sess) setSessionData(sess as Session);
    if (grp) setGroupes(grp as GroupeAllure[]);
    if (conf) setConfirmation(conf as ConfirmationLocale);
    if (parts) setParticipants(parts as Participant[]);
    if (bilan) setBilanExistant(bilan as BilanSeance);

    setChargement(false);
  }

  async function togglePresence() {
    if (!authSession?.user?.id || !id || chargementBtn) return;
    setChargementBtn(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      if (!confirmation) {
        const { data } = await supabase
          .from('confirmations')
          .insert({ session_id: id, utilisateur_id: authSession.user.id, statut: 'present' })
          .select('id, statut')
          .single();
        if (data) {
          setConfirmation(data as ConfirmationLocale);
          if (sessionData) {
            planifierRappelSession({
              sessionId: id,
              titre: sessionData.titre,
              heureRdv: sessionData.heure_rdv,
              pointRdv: sessionData.point_rdv,
            });
          }
        }
      } else {
        const nouveauStatut: StatutConfirmation =
          confirmation.statut === 'present' ? 'absent' : 'present';
        await supabase
          .from('confirmations')
          .update({ statut: nouveauStatut })
          .eq('id', confirmation.id);
        setConfirmation({ ...confirmation, statut: nouveauStatut });
        if (sessionData) {
          if (nouveauStatut === 'present') {
            planifierRappelSession({
              sessionId: id,
              titre: sessionData.titre,
              heureRdv: sessionData.heure_rdv,
              pointRdv: sessionData.point_rdv,
            });
          } else {
            annulerRappelSession(id);
          }
        }
      }
      // Recharger nb_presents et la liste des participants
      const [{ data: updated }, { data: parts }] = await Promise.all([
        supabase.from('sessions').select('nb_presents').eq('id', id).single(),
        supabase
          .from('confirmations')
          .select('id, utilisateur_id, profils(nom_affichage, nom_utilisateur)')
          .eq('session_id', id)
          .eq('statut', 'present')
          .order('cree_le'),
      ]);
      if (updated && sessionData) setSessionData({ ...sessionData, nb_presents: updated.nb_presents });
      if (parts) setParticipants(parts as Participant[]);
    } finally {
      setChargementBtn(false);
    }
  }

  async function soumettreMonBilan() {
    const allureDecimal = parseFloat(`${bilanMin}.${bilanSec.toString().padStart(2, '0')}`);
    setSoumissionBilan(true);
    try {
      const { data, error } = await supabase
        .from('allures_reelles')
        .insert({
          session_id: id,
          utilisateur_id: userId,
          allure_reelle: allureDecimal,
          ressenti: bilanRessenti,
          commentaire: bilanCommentaire.trim() || null,
        })
        .select()
        .single();
      if (error) throw error;
      setBilanExistant(data as BilanSeance);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Erreur', e.message || "Impossible d'enregistrer le bilan.");
    } finally {
      setSoumissionBilan(false);
    }
  }

  async function lancerAnalyse() {
    if (!sessionData || analyseEnCours) return;
    setAnalyseEnCours(true);
    setAnalyseEtape(0);
    setEvenementsDebugAnalyse([]);
    // La rotation de texte factice ne sert que quand le mode debug est off --
    // avec lui, la vraie trace remplace cette simulation.
    const intervalId = modeDebugAnalyse
      ? null
      : setInterval(() => setAnalyseEtape(e => (e + 1) % 3), 2200);
    try {
      const { data: { session: authSess } } = await supabase.auth.getSession();
      const jwt = authSess?.access_token;
      if (!jwt) throw new Error('Session expirée — reconnecte-toi.');
      const result = modeDebugAnalyse
        ? await analyserSeanceDebug(id!, sessionData.crew_id, jwt, (nouveaux) =>
            setEvenementsDebugAnalyse((prev) => [...prev, ...nouveaux]),
          )
        : await analyserSeance(id!, sessionData.crew_id, jwt);
      setAnalyseResultat(result);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Analyse impossible', e.message || "Le serveur Kipper n'est pas joignable.");
    } finally {
      if (intervalId) clearInterval(intervalId);
      setAnalyseEnCours(false);
    }
  }

  async function validerSeance() {
    if (!id || chargementValidation) return;
    setChargementValidation(true);
    try {
      const distKm = distanceValidation ? parseFloat(distanceValidation.replace(',', '.')) : null;
      const params: any = { p_session_id: id };
      // Utiliser la distance saisie, ou celle déjà calculée sur la session
      const dist = (distKm && distKm > 0) ? distKm : (sessionData?.distance_km ?? null);
      if (dist && dist > 0) params.p_distance_km = dist;
      const { error } = await supabase.rpc('valider_session', params);
      if (error) throw error;
      // Recharger la session pour refléter validee = true
      const { data } = await supabase.from('sessions').select('*').eq('id', id).single();
      if (data && sessionData) setSessionData(data as Session);
    } catch (e: any) {
      const msg = e?.message || 'Erreur lors de la validation';
      if (Platform.OS === 'web') {
        window.alert(`Impossible de valider : ${msg}`);
      } else {
        Alert.alert('Erreur validation', msg);
      }
    } finally {
      setChargementValidation(false);
    }
  }

  if (chargement) {
    return (
      <View style={styles.centrage}>
        <ActivityIndicator color={COULEURS.legend[500]} size="large" />
      </View>
    );
  }

  if (!sessionData) {
    return (
      <View style={styles.centrage}>
        <Text style={styles.texteErreur}>Session introuvable</Text>
      </View>
    );
  }

  const couleurType = COULEURS_TYPE[sessionData.type_entrainement];
  const estPresent = confirmation?.statut === 'present';
  const estCreateur = sessionData.cree_par === authSession?.user?.id;
  const estValidee = !!sessionData.validee;
  const estPassee = new Date(sessionData.heure_rdv) < new Date();
  const bilanEnAttente = estValidee && estPresent && !bilanExistant;
  const phaseActive = extrairePhaseActive(sessionData);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.canDismiss() ? router.back() : router.replace(`/crew/${sessionData.crew_id}` as any)} style={styles.boutonRetour}>
          <Ionicons name="arrow-back" size={24} color={COULEURS.night[700]} />
        </TouchableOpacity>
        <Text style={styles.headerTitre} numberOfLines={1}>
          {sessionData.titre}
        </Text>
        {estCreateur && !estPassee && !estValidee ? (
          <TouchableOpacity
            style={styles.boutonModifier}
            onPress={() => router.push(`/session/creer?crewId=${sessionData.crew_id}&sessionId=${id}` as any)}
            activeOpacity={0.7}
          >
            <Ionicons name="create-outline" size={14} color={COULEURS.legend[500]} />
            <Text style={styles.boutonModifierTexte}>Modifier</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.boutonModifier}
            onPress={() =>
              Share.share({
                message: `Rejoins la session "${sessionData.titre}" sur RunCrew ! 🏃\n${formaterDateComplete(sessionData.heure_rdv)}${sessionData.point_rdv ? `\n📍 ${sessionData.point_rdv}` : ''}`,
                title: sessionData.titre,
              })
            }
            activeOpacity={0.7}
          >
            <Ionicons name="share-outline" size={14} color={COULEURS.night[500]} />
            <Text style={styles.boutonModifierTexte}>Partager</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contenu}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero */}
        <View style={[styles.hero, { backgroundColor: couleurType }]}>
          <View style={styles.heroOverlay} />
          <View style={styles.heroContenu}>
            <View style={styles.heroTypeLigne}>
              <View style={[styles.typeBadge, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                <Text style={styles.typeBadgeTexte}>
                  {LABELS_TYPE[sessionData.type_entrainement].toUpperCase()}
                </Text>
              </View>
              {estValidee && (
                <View style={styles.validéeBadge}>
                  <Ionicons name="checkmark-circle" size={13} color="#fff" />
                  <Text style={styles.validéeBadgeTexte}>Validée</Text>
                </View>
              )}
            </View>
            <Text style={styles.heroTitre}>{sessionData.titre}</Text>
            <Text style={styles.heroDate}>{formaterDateComplete(sessionData.heure_rdv)}</Text>
          </View>
        </View>

        {/* Grille info pratique */}
        <View style={styles.grilleInfo}>
          <CarteInfo
            icone="time-outline"
            label="HEURE"
            valeur={formaterHeure(sessionData.heure_rdv)}
          />
          {sessionData.duree_entrainement_min && (
            <CarteInfo
              icone="hourglass-outline"
              label="DURÉE"
              valeur={`${sessionData.duree_entrainement_min} min`}
            />
          )}
          {sessionData.point_rdv && (
            <TouchableOpacity onPress={() => ouvrirMaps(sessionData.point_rdv!)} activeOpacity={0.7}>
              <CarteInfo
                icone="location-outline"
                label="LIEU"
                valeur={sessionData.point_rdv}
              />
            </TouchableOpacity>
          )}
          {sessionData.distance_km && (
            <CarteInfo
              icone="navigate-outline"
              label="DISTANCE"
              valeur={`${sessionData.distance_km} km`}
            />
          )}
        </View>

        {/* Description */}
        {sessionData.description && (
          <View style={styles.section}>
            <Text style={styles.descriptionTexte}>{sessionData.description}</Text>
          </View>
        )}

        {/* Workout v2 */}
        {sessionData.deroulement && !Array.isArray(sessionData.deroulement) && (sessionData.deroulement as any).format === 'workout_v2' && (
          <View style={styles.accordeon}>
            <TouchableOpacity style={styles.accordeonHeader} onPress={() => setDeroulementOuvert(o => !o)} activeOpacity={0.7}>
              <Text style={styles.accordeonTitre}>Workout</Text>
              <Ionicons name={deroulementOuvert ? 'chevron-up' : 'chevron-down'} size={20} color={COULEURS.night[500]} />
            </TouchableOpacity>
            {deroulementOuvert && (
              <View style={{ paddingHorizontal: ESPACEMENT.md, paddingBottom: ESPACEMENT.md }}>
                {((sessionData.deroulement as any).blocs as any[]).map((bloc: any, i: number) => {
                  if (bloc.kind === 'etape') {
                    const coulEtape = bloc.typeEtape === 'echauffement' ? '#F59E0B' : bloc.typeEtape === 'actif' ? COULEURS.danger : bloc.typeEtape === 'recuperation' ? '#10B981' : bloc.typeEtape === 'retour_calme' ? COULEURS.legend[400] : COULEURS.night[400];
                    const labelEtape = bloc.typeEtape === 'echauffement' ? 'Échauffement' : bloc.typeEtape === 'actif' ? 'Actif' : bloc.typeEtape === 'recuperation' ? 'Récupération' : bloc.typeEtape === 'retour_calme' ? 'Retour au calme' : (bloc.labelAutre?.trim() || 'Autre');
                    return (
                      <View key={i} style={[styles.wkBlocEtape, { borderLeftColor: coulEtape }]}>
                        <Text style={[styles.wkEtapeLabel, { color: coulEtape }]}>{labelEtape}</Text>
                        <Text style={styles.wkEtapeMeta}>{bloc.dureeValeur} {bloc.dureeType === 'temps' ? 'min' : 'km'}{bloc.allureBasse && bloc.alureHaute ? ` · ${minutesVersAllure(bloc.allureBasse)}–${minutesVersAllure(bloc.alureHaute)} min/km` : ''}</Text>
                      </View>
                    );
                  }
                  return (
                    <View key={i} style={styles.wkBoucle}>
                      <View style={styles.wkBoucleHeader}>
                        <Ionicons name="repeat" size={14} color={COULEURS.legend[500]} />
                        <Text style={styles.wkBoucleHeaderTexte}>{bloc.repetitions}× répétitions</Text>
                      </View>
                      {(bloc.etapes as any[]).map((e: any, j: number) => {
                        const c2 = e.typeEtape === 'echauffement' ? '#F59E0B' : e.typeEtape === 'actif' ? COULEURS.danger : e.typeEtape === 'recuperation' ? '#10B981' : e.typeEtape === 'retour_calme' ? COULEURS.legend[400] : COULEURS.night[400];
                        const l2 = e.typeEtape === 'echauffement' ? 'Échauffement' : e.typeEtape === 'actif' ? 'Actif' : e.typeEtape === 'recuperation' ? 'Récupération' : e.typeEtape === 'retour_calme' ? 'Retour au calme' : (e.labelAutre?.trim() || 'Autre');
                        return (
                          <View key={j} style={[styles.wkBlocEtape, styles.wkBlocEtapeIndente, { borderLeftColor: c2 }]}>
                            <Text style={[styles.wkEtapeLabel, { color: c2 }]}>{l2}</Text>
                            <Text style={styles.wkEtapeMeta}>{e.dureeValeur} {e.dureeType === 'temps' ? 'min' : 'km'}{e.allureBasse && e.alureHaute ? ` · ${minutesVersAllure(e.allureBasse)}–${minutesVersAllure(e.alureHaute)} min/km` : ''}</Text>
                          </View>
                        );
                      })}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* Déroulé */}
        {sessionData.deroulement && Array.isArray(sessionData.deroulement) && sessionData.deroulement.length > 0 && (
          <View style={styles.accordeon}>
            <TouchableOpacity
              style={styles.accordeonHeader}
              onPress={() => setDeroulementOuvert((o) => !o)}
              activeOpacity={0.7}
            >
              <Text style={styles.accordeonTitre}>Déroulé de la session</Text>
              <Ionicons
                name={deroulementOuvert ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={COULEURS.night[500]}
              />
            </TouchableOpacity>

            {deroulementOuvert && (
              <View style={styles.timeline}>
                {(sessionData.deroulement as EtapeDeroulement[]).map((etape, index) => (
                  <EtapeTimeline
                    key={etape.ordre}
                    etape={etape}
                    estDerniere={index === (sessionData.deroulement as EtapeDeroulement[]).length - 1}
                    couleur={couleurType}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {/* Groupes d'allure */}
        {groupes.length > 0 && (
          <View style={styles.accordeon}>
            <TouchableOpacity
              style={styles.accordeonHeader}
              onPress={() => setGroupesOuvert((o) => !o)}
              activeOpacity={0.7}
            >
              <Text style={styles.accordeonTitre}>Groupes d'allure</Text>
              <Ionicons
                name={groupesOuvert ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={COULEURS.night[500]}
              />
            </TouchableOpacity>

            {groupesOuvert && (
              <View style={styles.groupesListe}>
                <Text style={styles.groupesSousTitre}>
                  {groupes.length} groupe{groupes.length > 1 ? 's' : ''} préparé{groupes.length > 1 ? 's' : ''} par le capitaine
                </Text>
                {groupes.map((g, i) => (
                  <CarteGroupeAllure
                    key={g.id}
                    groupe={g}
                    couleur={COULEURS_BORD_GROUPE[i % COULEURS_BORD_GROUPE.length]}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {/* Participants */}
        <View style={styles.accordeon}>
          <TouchableOpacity
            style={styles.accordeonHeader}
            onPress={() => setParticipantsOuvert(o => !o)}
            activeOpacity={participants.length > 0 ? 0.7 : 1}
            disabled={estPassee && participants.length === 0}
          >
            <View style={styles.accordeonTitreRow}>
              <Text style={styles.accordeonTitre}>Participants</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeTexte}>{participants.length}</Text>
              </View>
            </View>
            {!(estPassee && participants.length === 0) && (
              <Ionicons name={participantsOuvert ? 'chevron-up' : 'chevron-down'} size={20} color={COULEURS.night[500]} />
            )}
          </TouchableOpacity>

          {participantsOuvert && (
            participants.length === 0 ? (
              !estPassee ? (
                <View style={styles.participantsVide}>
                  <Text style={styles.participantsVideTexte}>Sois le premier à t'inscrire !</Text>
                </View>
              ) : null
            ) : (
              <View style={styles.participantsList}>
                {participants.map(p => (
                  <LigneParticipant
                    key={p.id}
                    participant={p}
                    estMoi={p.utilisateur_id === authSession?.user?.id}
                    sessionId={id!}
                    crewId={sessionData.crew_id}
                  />
                ))}
              </View>
            )
          )}
        </View>

        {/* Bilan de séance — formulaire ou récap */}
        {(bilanEnAttente || bilanExistant) && (
          <SectionBilan
            bilanExistant={bilanExistant}
            bilanEnAttente={bilanEnAttente}
            groupes={groupes}
            phaseActive={phaseActive}
            bilanMin={bilanMin}
            bilanSec={bilanSec}
            bilanRessenti={bilanRessenti}
            bilanCommentaire={bilanCommentaire}
            onChangeMin={setBilanMin}
            onChangeSec={setBilanSec}
            onChangeRessenti={setBilanRessenti}
            onChangeCommentaire={setBilanCommentaire}
            onSoumettre={soumettreMonBilan}
            soumission={soumissionBilan}
          />
        )}

        {/* Validation séance (créateur uniquement, session passée non encore validée) */}
        {estCreateur && !estValidee && estPassee && (
          <View style={styles.validationBloc}>
            <View style={styles.validationInfo}>
              <Ionicons name="shield-checkmark-outline" size={18} color={COULEURS.succes} />
              <Text style={styles.validationInfoTexte}>
                Valider met à jour les stats de tous les participants inscrits.
              </Text>
            </View>
            {!sessionData.distance_km && (
              <View style={styles.validationDistanceRow}>
                <Ionicons name="navigate-outline" size={16} color={COULEURS.succes} />
                <TextInput
                  style={styles.validationDistanceInput}
                  value={distanceValidation}
                  onChangeText={setDistanceValidation}
                  placeholder="Distance parcourue (km)"
                  placeholderTextColor={COULEURS.night[300]}
                  keyboardType="decimal-pad"
                />
              </View>
            )}
            <TouchableOpacity
              style={styles.boutonValider}
              onPress={validerSeance}
              disabled={chargementValidation}
              activeOpacity={0.8}
            >
              {chargementValidation ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-done" size={20} color="#fff" />
                  <Text style={styles.boutonValiderTexte}>Valider la séance</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Analyse collective — capitaine, séance validée */}
        {estCreateur && estValidee && (
          analyseResultat ? (
            <SectionAnalyse
              analyse={analyseResultat}
              crewId={sessionData.crew_id}
            />
          ) : (
            <View style={stylesKipper.bloc}>
              <View style={stylesKipper.header}>
                <View style={stylesKipper.iconeWrap}>
                  <Ionicons name="analytics-outline" size={18} color={COULEURS.legend[500]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={stylesKipper.titre}>Analyse collective</Text>
                  <Text style={stylesKipper.sous}>
                    Kipper analyse les bilans, détecte les patterns et poste un récap dans le chat.
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setModeDebugAnalyse((v) => !v)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={[stylesKipper.debugBtn, modeDebugAnalyse && stylesKipper.debugBtnActif]}
                >
                  <Ionicons
                    name="bug"
                    size={16}
                    color={modeDebugAnalyse ? COULEURS.legend[500] : COULEURS.night[300]}
                  />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[stylesKipper.bouton, analyseEnCours && { opacity: 0.75 }]}
                onPress={lancerAnalyse}
                disabled={analyseEnCours}
                activeOpacity={0.85}
              >
                {analyseEnCours ? (
                  <View style={stylesKipper.boutonEnCours}>
                    <ActivityIndicator color="#fff" size="small" />
                    <Text style={stylesKipper.boutonTexte}>
                      {[
                        'Kipper récupère les bilans…',
                        'Kipper analyse les performances…',
                        'Kipper rédige le récap…',
                      ][analyseEtape]}
                    </Text>
                  </View>
                ) : (
                  <>
                    <Ionicons name="sparkles" size={18} color="#fff" />
                    <Text style={stylesKipper.boutonTexte}>Analyser la séance</Text>
                  </>
                )}
              </TouchableOpacity>
              {modeDebugAnalyse && (analyseEnCours || evenementsDebugAnalyse.length > 0) && (
                <TraceDebug evenements={evenementsDebugAnalyse} enCours={analyseEnCours} />
              )}
            </View>
          )
        )}

        {/* Espace pour le bouton fixe */}
        {!estPassee && <View style={{ height: 100 }} />}
      </ScrollView>

      {/* CTA fixe "JE SERAI LÀ !" — masqué pour les sessions passées */}
      {!estPassee && (
        <View style={styles.ctaContainer}>
          <TouchableOpacity
            style={[styles.ctaBouton, estPresent && styles.ctaBoutonPresent]}
            onPress={togglePresence}
            disabled={chargementBtn}
            activeOpacity={0.85}
          >
            {chargementBtn ? (
              <ActivityIndicator color={estPresent ? COULEURS.legend[500] : '#fff'} />
            ) : (
              <>
                <Ionicons
                  name={estPresent ? 'checkmark-circle' : 'checkmark-circle-outline'}
                  size={24}
                  color={estPresent ? COULEURS.legend[500] : '#fff'}
                />
                <Text style={[styles.ctaTexte, estPresent && styles.ctaTextePresent]}>
                  {estPresent
                    ? `Inscrit · ${sessionData.nb_presents} présent${sessionData.nb_presents > 1 ? 's' : ''}`
                    : `JE SERAI LÀ ! · ${sessionData.nb_presents} présent${sessionData.nb_presents > 1 ? 's' : ''}`}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

// ─── Carte info pratique ─────────────────────────────────────────────────────

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
        <Text style={styles.carteInfoValeur} numberOfLines={1}>
          {valeur}
        </Text>
      </View>
    </View>
  );
}

// ─── Étape timeline ──────────────────────────────────────────────────────────

function EtapeTimeline({
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
      {/* Ligne verticale + point */}
      <View style={styles.etapeGauche}>
        <View style={[styles.etapePoint, { backgroundColor: couleur }]}>
          <View style={styles.etapePointInterne} />
        </View>
        {!estDerniere && <View style={[styles.etapeLigne, { backgroundColor: couleur + '40' }]} />}
      </View>

      {/* Contenu */}
      <View style={styles.etapeCorps}>
        <Text style={styles.etapeTitre}>{etape.titre}</Text>
        <Text style={[styles.etapeMeta, { color: couleur }]}>
          {etape.duree_min} min
          {etape.description ? ` · ${etape.description}` : ''}
        </Text>
      </View>
    </View>
  );
}

// ─── Ligne participant ────────────────────────────────────────────────────────

function LigneParticipant({ participant, estMoi, sessionId, crewId }: { participant: Participant; estMoi: boolean; sessionId: string; crewId: string }) {
  const profil = Array.isArray(participant.profils) ? participant.profils[0] : participant.profils;
  const nom = profil?.nom_affichage || profil?.nom_utilisateur || '?';
  const couleur = teintAvatar(participant.utilisateur_id);
  return (
    <TouchableOpacity
      style={styles.ligneParticipant}
      onPress={() => router.push(`/profil/${participant.utilisateur_id}?sessionId=${sessionId}&crewId=${crewId}` as any)}
      activeOpacity={0.7}
    >
      <View style={[styles.avatarParticipant, { backgroundColor: couleur + '20', borderColor: couleur + '40' }]}>
        <Text style={[styles.avatarInitiales, { color: couleur }]}>{initialesAvatar(nom)}</Text>
      </View>
      <Text style={styles.nomParticipant} numberOfLines={1}>{nom}</Text>
      {estMoi && (
        <View style={styles.moiBadge}>
          <Text style={styles.moiBadgeTexte}>toi</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={14} color={COULEURS.night[200]} />
    </TouchableOpacity>
  );
}

// ─── Carte groupe d'allure ────────────────────────────────────────────────────

function CarteGroupeAllure({ groupe, couleur }: { groupe: GroupeAllure; couleur: string }) {
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
      {groupe.consignes && (
        <Text style={styles.carteGroupeConsignes}>{groupe.consignes}</Text>
      )}
    </View>
  );
}

// ─── Picker allure (copie exacte de creer.tsx) ───────────────────────────────

const ITEM_H = 44;
const ALLURE_MIN_ITEMS = Array.from({ length: 10 }, (_, i) => String(i + 1));
const ALLURE_SEC_ITEMS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const SEP_W = 36;

type PickerColDef = {
  items: string[];
  selectedIndex: number;
  onSelect: (i: number) => void;
  separator?: string;
  label?: string;
};

function ScrollPickerCol({ items, selectedIndex, onSelect }: { items: string[]; selectedIndex: number; onSelect: (i: number) => void }) {
  const ref = useRef<ScrollView>(null);
  const isMomentum = useRef(false);
  const [localSel, setLocalSel] = useState(selectedIndex);

  useEffect(() => {
    const t = setTimeout(() => {
      ref.current?.scrollTo({ y: selectedIndex * ITEM_H, animated: false });
    }, 80);
    return () => clearTimeout(t);
  }, []);

  function selectIndex(idx: number) {
    const c = Math.max(0, Math.min(idx, items.length - 1));
    setLocalSel(c);
    onSelect(c);
  }
  function handlePress(index: number) {
    setLocalSel(index);
    ref.current?.scrollTo({ y: index * ITEM_H, animated: true });
    onSelect(index);
  }
  function handleScroll(e: any) {
    setLocalSel(Math.max(0, Math.min(Math.round(e.nativeEvent.contentOffset.y / ITEM_H), items.length - 1)));
  }
  function handleScrollEndDrag(e: any) {
    if (!isMomentum.current) selectIndex(Math.round(e.nativeEvent.contentOffset.y / ITEM_H));
  }
  function handleMomentumScrollBegin() { isMomentum.current = true; }
  function handleMomentumScrollEnd(e: any) {
    isMomentum.current = false;
    selectIndex(Math.round(e.nativeEvent.contentOffset.y / ITEM_H));
  }

  return (
    <View style={{ width: 72, height: ITEM_H * 5 }}>
      <ScrollView
        ref={ref}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingVertical: ITEM_H * 2 }}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onScrollEndDrag={handleScrollEndDrag}
        onMomentumScrollBegin={handleMomentumScrollBegin}
        onMomentumScrollEnd={handleMomentumScrollEnd}
      >
        {items.map((item, index) => (
          <TouchableOpacity
            key={index}
            style={[pickerItemStyles.item, index === localSel && pickerItemStyles.itemSelected]}
            onPress={() => handlePress(index)}
            activeOpacity={0.8}
          >
            <Text style={[pickerItemStyles.itemText, index === localSel && pickerItemStyles.itemTextSelected]}>
              {item}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View pointerEvents="none" style={pickerItemStyles.indicator} />
    </View>
  );
}

const pickerItemStyles = StyleSheet.create({
  item: { height: ITEM_H, width: 72, alignItems: 'center', justifyContent: 'center' },
  itemSelected: { backgroundColor: COULEURS.legend[50], borderRadius: 8 },
  itemText: { fontSize: 22, color: COULEURS.night[300], fontWeight: '500' },
  itemTextSelected: { color: COULEURS.night[700], fontWeight: '700' },
  indicator: {
    position: 'absolute',
    top: ITEM_H * 2, left: 4, right: 4, height: ITEM_H,
    borderTopWidth: 1.5, borderBottomWidth: 1.5,
    borderColor: COULEURS.legend[300], borderRadius: 8,
  },
});

function PickerModal({ visible, titre, colonnes, onFermer }: {
  visible: boolean;
  titre: string;
  colonnes: PickerColDef[];
  onFermer: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onFermer}>
      <TouchableOpacity style={pStyles.overlay} activeOpacity={1} onPress={onFermer}>
        <TouchableOpacity activeOpacity={1} style={pStyles.sheet}>
          <View style={pStyles.handle} />
          <Text style={pStyles.titre}>{titre}</Text>
          <View style={pStyles.pickersRow}>
            {colonnes.map((col, i) => (
              <View key={i} style={pStyles.colSlot}>
                <Text style={pStyles.colLabel}>{col.label ?? ''}</Text>
                {col.separator && <View style={{ width: SEP_W }} />}
              </View>
            ))}
          </View>
          <View style={pStyles.pickersRow}>
            {colonnes.map((col, i) => (
              <View key={i} style={pStyles.colSlot}>
                <ScrollPickerCol items={col.items} selectedIndex={col.selectedIndex} onSelect={col.onSelect} />
                {col.separator && <Text style={pStyles.separator}>{col.separator}</Text>}
              </View>
            ))}
          </View>
          <TouchableOpacity style={pStyles.confirmerBtn} onPress={onFermer}>
            <Text style={pStyles.confirmerTexte}>Confirmer</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const pStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: ESPACEMENT.lg, paddingBottom: 36 },
  handle: { width: 40, height: 4, backgroundColor: COULEURS.night[200], borderRadius: 2, alignSelf: 'center', marginBottom: ESPACEMENT.md },
  titre: { fontSize: 17, fontWeight: '700', color: COULEURS.night[700], textAlign: 'center', marginBottom: ESPACEMENT.lg },
  pickersRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  colSlot: { flexDirection: 'row', alignItems: 'center' },
  colLabel: { width: 72, fontSize: 11, fontWeight: '600', color: COULEURS.night[400], letterSpacing: 0.5, textAlign: 'center' },
  separator: { width: SEP_W, fontSize: 28, fontWeight: '700', color: COULEURS.night[400], textAlign: 'center' },
  confirmerBtn: { marginTop: ESPACEMENT.xl, backgroundColor: COULEURS.legend[500], borderRadius: RAYONS.full, paddingVertical: 14, alignItems: 'center' },
  confirmerTexte: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

// ─── Helpers bilan ───────────────────────────────────────────────────────────

function decimalToSecondes(d: number): number {
  const str = d.toFixed(2);
  const [minStr, secStr] = str.split('.');
  return parseInt(minStr) * 60 + parseInt(secStr.padEnd(2, '0'));
}

// Les allures workout sont en "vraies minutes décimales" (4.5 = 4:30/km).
// Les allures groupes/bilan sont en "pseudo-décimal" (4.30 = 4:30/km).
// Cette fonction convertit workout → pseudo-décimal pour la comparaison.
function minutesDecimalVersPseudo(val: number): number {
  const min = Math.floor(val);
  const sec = Math.round((val - min) * 60);
  return parseFloat(`${min}.${sec.toString().padStart(2, '0')}`);
}

type PhaseActifInfo = {
  label: string;
  cibleBasse: number | null;  // pseudo-décimal (5.30 = 5:30/km)
  cibleHaute: number | null;
  repetitions: number | null;
};

function extrairePhaseActive(session: Session): PhaseActifInfo | null {
  const d = session.deroulement;
  if (!d || Array.isArray(d)) return null;
  if ((d as any).format !== 'workout_v2') return null;

  const blocs: any[] = (d as any).blocs ?? [];
  const typesEffort = ['actif', 'seuil', 'tempo'];

  for (const bloc of blocs) {
    if (bloc.kind === 'etape' && typesEffort.includes(bloc.typeEtape)) {
      const labelMap: Record<string, string> = { actif: 'Actif', seuil: 'Seuil', tempo: 'Tempo' };
      return {
        label: labelMap[bloc.typeEtape] ?? 'Effort',
        cibleBasse: bloc.allureBasse ? minutesDecimalVersPseudo(bloc.allureBasse) : null,
        cibleHaute: bloc.alureHaute  ? minutesDecimalVersPseudo(bloc.alureHaute)  : null,
        repetitions: 1,
      };
    }
    if (bloc.kind === 'boucle') {
      for (const etape of bloc.etapes) {
        if (typesEffort.includes(etape.typeEtape)) {
          const labelMap: Record<string, string> = { actif: 'Actif', seuil: 'Seuil', tempo: 'Tempo' };
          return {
            label: `${labelMap[etape.typeEtape] ?? 'Effort'} · ${bloc.repetitions}×`,
            cibleBasse: etape.allureBasse ? minutesDecimalVersPseudo(etape.allureBasse) : null,
            cibleHaute: etape.alureHaute  ? minutesDecimalVersPseudo(etape.alureHaute)  : null,
            repetitions: bloc.repetitions,
          };
        }
      }
    }
  }
  return null;
}

const RESSENTI_CONFIG = [
  { label: 'Très\nfacile', couleur: COULEURS.succes },
  { label: 'Facile', couleur: COULEURS.info },
  { label: 'Modéré', couleur: COULEURS.legend[400] },
  { label: 'Difficile', couleur: COULEURS.avertissement },
  { label: 'Maximal', couleur: COULEURS.danger },
];

function SectionBilan({
  bilanExistant,
  bilanEnAttente,
  groupes,
  phaseActive,
  bilanMin,
  bilanSec,
  bilanRessenti,
  bilanCommentaire,
  onChangeMin,
  onChangeSec,
  onChangeRessenti,
  onChangeCommentaire,
  onSoumettre,
  soumission,
}: {
  bilanExistant: BilanSeance | null;
  bilanEnAttente: boolean;
  groupes: GroupeAllure[];
  phaseActive: PhaseActifInfo | null;
  bilanMin: number;
  bilanSec: number;
  bilanRessenti: number | null;
  bilanCommentaire: string;
  onChangeMin: (v: number) => void;
  onChangeSec: (v: number) => void;
  onChangeRessenti: (v: number) => void;
  onChangeCommentaire: (v: string) => void;
  onSoumettre: () => void;
  soumission: boolean;
}) {
  const [pickerVisible, setPickerVisible] = useState(false);

  // Priorité : phase active extraite du workout > plage des groupes d'allure
  const cibleBasse = phaseActive?.cibleBasse ?? (groupes.length > 0 ? Math.min(...groupes.map(g => g.allure_basse)) : null);
  const cibleHaute = phaseActive?.cibleHaute ?? (groupes.length > 0 ? Math.max(...groupes.map(g => g.allure_haute)) : null);
  const cibleLabel = phaseActive?.label ?? 'Allure cible';

  if (bilanExistant) {
    // Affichage récap
    const actualSec = decimalToSecondes(bilanExistant.allure_reelle);
    let statutZone: 'dans' | 'avance' | 'retard' | null = null;
    let deltaSec = 0;
    if (cibleBasse !== null && cibleHaute !== null) {
      const basseSec = decimalToSecondes(cibleBasse);
      const hauteSec = decimalToSecondes(cibleHaute);
      if (actualSec < basseSec) { statutZone = 'avance'; deltaSec = basseSec - actualSec; }
      else if (actualSec <= hauteSec) { statutZone = 'dans'; }
      else { statutZone = 'retard'; deltaSec = actualSec - hauteSec; }
    }
    const deltaMin = Math.floor(deltaSec / 60);
    const deltaSecRest = deltaSec % 60;
    const deltaStr = `${deltaMin > 0 ? `${deltaMin}min ` : ''}${deltaSecRest}s`;
    const ressentiConfig = bilanExistant.ressenti ? RESSENTI_CONFIG[bilanExistant.ressenti - 1] : null;

    return (
      <View style={[stylesB.bloc, { borderColor: COULEURS.legend[100] }]}>
        <View style={stylesB.header}>
          <View style={stylesB.headerIcone}>
            <Ionicons name="checkmark-circle" size={16} color={COULEURS.legend[500]} />
          </View>
          <Text style={stylesB.headerTitre}>Mon bilan</Text>
        </View>

        {/* Comparaison allures */}
        <View style={stylesB.comparaisonContainer}>
          <View style={stylesB.comparaisonBlocsRow}>
            {cibleBasse !== null && cibleHaute !== null ? (
              <View style={stylesB.comparaisonBloc}>
                <Text style={stylesB.comparaisonLabel}>{cibleLabel.toUpperCase()}</Text>
                <Text style={stylesB.comparaisonValeur}>
                  {decimalVersAllure(cibleBasse)}–{decimalVersAllure(cibleHaute)}
                </Text>
                <Text style={stylesB.comparaisonSous}>/km</Text>
              </View>
            ) : null}
            {cibleBasse !== null && (
              <View style={stylesB.comparaisonFleche}>
                <Ionicons name="arrow-forward" size={16} color={COULEURS.night[300]} />
              </View>
            )}
            <View style={[stylesB.comparaisonBloc, stylesB.comparaisonBlocActuel]}>
              <Text style={stylesB.comparaisonLabel}>MON ALLURE</Text>
              <Text style={[stylesB.comparaisonValeur, { color: COULEURS.legend[500] }]}>
                {decimalVersAllure(bilanExistant.allure_reelle)}
              </Text>
              <Text style={stylesB.comparaisonSous}>/km</Text>
            </View>
          </View>
          {statutZone !== null && (
            <View style={[
              stylesB.statutBadge,
              { backgroundColor: statutZone === 'dans' ? COULEURS.succes + '18' : statutZone === 'avance' ? COULEURS.legend[100] : COULEURS.avertissement + '18' }
            ]}>
              <Ionicons
                name={statutZone === 'dans' ? 'checkmark-circle' : statutZone === 'avance' ? 'trending-up' : 'trending-down'}
                size={14}
                color={statutZone === 'dans' ? COULEURS.succes : statutZone === 'avance' ? COULEURS.legend[500] : '#D97706'}
              />
              <Text style={[stylesB.statutTexte, {
                color: statutZone === 'dans' ? COULEURS.succes : statutZone === 'avance' ? COULEURS.legend[500] : '#D97706'
              }]}>
                {statutZone === 'dans' ? 'Dans la zone' : statutZone === 'avance' ? `En avance · ${deltaStr}` : `En retrait · ${deltaStr}`}
              </Text>
            </View>
          )}
        </View>

        {/* Ressenti */}
        {ressentiConfig && (
          <View style={stylesB.ressentiRow}>
            <View style={[stylesB.ressentiPuceActive, { backgroundColor: ressentiConfig.couleur + '20' }]}>
              <View style={[stylesB.ressentiDot, { backgroundColor: ressentiConfig.couleur }]} />
              <Text style={[stylesB.ressentiActiveLabel, { color: ressentiConfig.couleur }]}>
                {ressentiConfig.label.replace('\n', ' ')}
              </Text>
            </View>
          </View>
        )}

        {/* Commentaire */}
        {bilanExistant.commentaire ? (
          <Text style={stylesB.commentaireTexte}>"{bilanExistant.commentaire}"</Text>
        ) : null}
      </View>
    );
  }

  // Formulaire
  return (
    <View style={[stylesB.bloc, { borderColor: COULEURS.avertissement + '40' }]}>
      <View style={stylesB.header}>
        <View style={[stylesB.headerIcone, { backgroundColor: COULEURS.avertissement + '18' }]}>
          <Ionicons name="create-outline" size={16} color={COULEURS.avertissement} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={stylesB.headerTitre}>Mon bilan de séance</Text>
          <Text style={stylesB.headerSous}>
            {phaseActive
              ? `Ton allure en phase ${phaseActive.label} uniquement — pas l'échauffement ni la récupération.`
              : 'Ton allure moyenne de séance pour que le coach adapte la suite.'}
          </Text>
        </View>
      </View>

      {/* Allure réelle — picker scroll */}
      <View style={stylesB.champGroupe}>
        <Text style={stylesB.champLabel}>
          {phaseActive ? `Allure en phase ${phaseActive.label}` : 'Allure réelle'}
        </Text>
        <TouchableOpacity style={stylesB.allurePickerBtn} onPress={() => setPickerVisible(true)} activeOpacity={0.8}>
          <Text style={stylesB.allurePickerValeur}>
            {bilanMin}:{String(bilanSec).padStart(2, '0')}
          </Text>
          <Text style={stylesB.allurePickerUnite}>/km</Text>
          <Ionicons name="chevron-down" size={16} color={COULEURS.legend[500]} />
        </TouchableOpacity>
        {cibleBasse !== null && cibleHaute !== null && (
          <Text style={stylesB.cibleHint}>
            Cible {cibleLabel.toLowerCase()} : {decimalVersAllure(cibleBasse)} – {decimalVersAllure(cibleHaute)} /km
          </Text>
        )}
        <PickerModal
          visible={pickerVisible}
          titre={phaseActive ? `Allure — ${phaseActive.label}` : 'Allure réelle'}
          onFermer={() => setPickerVisible(false)}
          colonnes={[
            {
              items: ALLURE_MIN_ITEMS,
              selectedIndex: bilanMin - 1,
              onSelect: v => onChangeMin(v + 1),
              separator: ':',
            },
            {
              items: ALLURE_SEC_ITEMS,
              selectedIndex: bilanSec,
              onSelect: v => onChangeSec(v),
              label: '/km',
            },
          ]}
        />
      </View>

      {/* Ressenti RPE */}
      <View style={stylesB.champGroupe}>
        <Text style={stylesB.champLabel}>Ressenti</Text>
        <View style={stylesB.ressentiPicker}>
          {RESSENTI_CONFIG.map((r, i) => {
            const niveau = i + 1;
            const actif = bilanRessenti === niveau;
            return (
              <TouchableOpacity
                key={niveau}
                style={[
                  stylesB.ressentiBtn,
                  actif && { backgroundColor: r.couleur, borderColor: r.couleur }
                ]}
                onPress={() => onChangeRessenti(niveau)}
                activeOpacity={0.7}
              >
                <Text style={[stylesB.ressentiBtnChiffre, actif && { color: '#fff' }]}>{niveau}</Text>
                <Text style={[stylesB.ressentiBtnLabel, actif && { color: 'rgba(255,255,255,0.85)' }]} numberOfLines={2}>{r.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Commentaire */}
      <View style={stylesB.champGroupe}>
        <Text style={stylesB.champLabel}>Commentaire <Text style={{ color: COULEURS.night[300] }}>(optionnel)</Text></Text>
        <TextInput
          style={stylesB.commentaireInput}
          value={bilanCommentaire}
          onChangeText={onChangeCommentaire}
          placeholder="Super séance, j'ai bien tenu l'allure..."
          placeholderTextColor={COULEURS.night[300]}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
      </View>

      <TouchableOpacity
        style={[stylesB.boutonSoumettre, soumission && { opacity: 0.7 }]}
        onPress={onSoumettre}
        disabled={soumission}
        activeOpacity={0.85}
      >
        {soumission ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="save-outline" size={18} color="#fff" />
            <Text style={stylesB.boutonSoumettreTexte}>Enregistrer mon bilan</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const stylesB = StyleSheet.create({
  bloc: {
    marginHorizontal: ESPACEMENT.md,
    marginTop: ESPACEMENT.lg,
    backgroundColor: '#fff',
    borderRadius: RAYONS.xl,
    borderWidth: 1.5,
    padding: ESPACEMENT.md,
    gap: ESPACEMENT.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  headerIcone: {
    width: 32,
    height: 32,
    borderRadius: RAYONS.full,
    backgroundColor: COULEURS.legend[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitre: { fontSize: 16, fontWeight: '700', color: COULEURS.night[700], marginTop: 2 },
  headerSous: { fontSize: 12, color: COULEURS.night[400], lineHeight: 16, marginTop: 2 },

  // Comparaison
  comparaisonContainer: { gap: ESPACEMENT.sm },
  comparaisonBlocsRow: { flexDirection: 'row', alignItems: 'center', gap: ESPACEMENT.sm },
  comparaisonBloc: { flex: 1, alignItems: 'center', gap: 2 },
  comparaisonBlocActuel: {
    backgroundColor: COULEURS.legend[50],
    borderRadius: RAYONS.lg,
    paddingVertical: ESPACEMENT.sm,
    paddingHorizontal: ESPACEMENT.sm,
  },
  comparaisonLabel: { fontSize: 9, fontWeight: '700', color: COULEURS.night[300], letterSpacing: 0.8, textTransform: 'uppercase' },
  comparaisonValeur: { fontSize: 22, fontWeight: '800', color: COULEURS.night[700], letterSpacing: -0.5 },
  comparaisonSous: { fontSize: 11, color: COULEURS.night[400], fontWeight: '500' },
  comparaisonFleche: { justifyContent: 'center', paddingHorizontal: 4 },
  statutBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: RAYONS.lg,
    paddingVertical: 8,
    paddingHorizontal: ESPACEMENT.sm,
  },
  statutTexte: { fontSize: 13, fontWeight: '600' },

  // Ressenti récap
  ressentiRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  ressentiPuceActive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: RAYONS.full,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  ressentiDot: { width: 8, height: 8, borderRadius: RAYONS.full },
  ressentiActiveLabel: { fontSize: 13, fontWeight: '600' },
  commentaireTexte: { fontSize: 14, color: COULEURS.night[500], fontStyle: 'italic', lineHeight: 20 },

  // Formulaire
  champGroupe: { gap: 8 },
  champLabel: { fontSize: 13, fontWeight: '600', color: COULEURS.night[500] },
  allurePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ESPACEMENT.sm,
    backgroundColor: COULEURS.legend[50],
    borderWidth: 1.5,
    borderColor: COULEURS.legend[200],
    borderRadius: RAYONS.lg,
    paddingHorizontal: ESPACEMENT.md,
    paddingVertical: 12,
  },
  allurePickerValeur: { fontSize: 28, fontWeight: '800', color: COULEURS.night[700], letterSpacing: -0.5 },
  allurePickerUnite: { fontSize: 14, color: COULEURS.night[400], fontWeight: '500', flex: 1 },
  cibleHint: { fontSize: 12, color: COULEURS.night[300], fontStyle: 'italic' },
  ressentiPicker: { flexDirection: 'row', gap: 6 },
  ressentiBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: RAYONS.md,
    borderWidth: 1.5,
    borderColor: COULEURS.night[200],
    backgroundColor: COULEURS.night[50],
    gap: 4,
  },
  ressentiBtnChiffre: { fontSize: 16, fontWeight: '800', color: COULEURS.night[600] },
  ressentiBtnLabel: { fontSize: 9, fontWeight: '600', color: COULEURS.night[400], textAlign: 'center', lineHeight: 11 },
  commentaireInput: {
    borderWidth: 1.5,
    borderColor: COULEURS.night[200],
    borderRadius: RAYONS.md,
    paddingHorizontal: ESPACEMENT.sm,
    paddingVertical: ESPACEMENT.sm,
    fontSize: 14,
    color: COULEURS.night[700],
    backgroundColor: COULEURS.night[50],
    minHeight: 80,
  },
  boutonSoumettre: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COULEURS.legend[500],
    borderRadius: RAYONS.full,
    paddingVertical: 14,
    marginTop: ESPACEMENT.xs,
    shadowColor: COULEURS.legend[500],
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  boutonSoumettreTexte: { fontSize: 15, fontWeight: '700', color: '#fff' },
});

// ─── Analyse collective (Kipper) ─────────────────────────────────────────────

const STATUT_CONFIG: Record<string, { label: string; couleur: string; icone: keyof typeof Ionicons.glyphMap }> = {
  progresse:    { label: 'En progression',  couleur: COULEURS.succes,       icone: 'trending-up' },
  bon:          { label: 'Dans la zone',     couleur: COULEURS.legend[500],  icone: 'checkmark-circle' },
  stagne:       { label: 'Stagnation',       couleur: COULEURS.avertissement,icone: 'alert-circle' },
  surintensité: { label: 'Surintensité',     couleur: COULEURS.danger,       icone: 'flame' },
  sous_intensite:{ label: 'Sous-intensité', couleur: COULEURS.info,          icone: 'trending-down' },
};

function SectionAnalyse({
  analyse,
  crewId,
}: {
  analyse: AnalyseResultat;
  crewId: string;
}) {
  return (
    <View style={stylesA.bloc}>
      {/* Header */}
      <View style={stylesA.header}>
        <View style={stylesA.headerIcone}>
          <Ionicons name="analytics" size={16} color={COULEURS.legend[500]} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={stylesA.headerTitre}>Analyse Kipper</Text>
          <Text style={stylesA.headerSous}>Récap collectif · posté dans le chat</Text>
        </View>
        <View style={stylesA.kipperBadge}>
          <Text style={stylesA.kipperBadgeTexte}>IA</Text>
        </View>
      </View>

      {/* Synthèse */}
      <View style={stylesA.syntheseBloc}>
        <Text style={stylesA.syntheseTexte}>{analyse.synthese}</Text>
      </View>

      {/* Insights runners */}
      {analyse.insights_runners.length > 0 && (
        <View style={stylesA.section}>
          <Text style={stylesA.sectionTitre}>Performances individuelles</Text>
          <View style={stylesA.insightsList}>
            {analyse.insights_runners.map((insight, i) => {
              const cfg = STATUT_CONFIG[insight.statut] ?? STATUT_CONFIG.bon;
              const coulAvatar = teintAvatar(insight.utilisateur_id);
              return (
                <View key={i} style={stylesA.insightCard}>
                  <View style={stylesA.insightHeader}>
                    <View style={[stylesA.insightAvatar, { backgroundColor: coulAvatar + '20' }]}>
                      <Text style={[stylesA.insightInitiales, { color: coulAvatar }]}>
                        {initialesAvatar(insight.nom)}
                      </Text>
                    </View>
                    <Text style={stylesA.insightNom} numberOfLines={1}>{insight.nom}</Text>
                    <View style={[stylesA.statutBadge, { backgroundColor: cfg.couleur + '18' }]}>
                      <Ionicons name={cfg.icone} size={11} color={cfg.couleur} />
                      <Text style={[stylesA.statutLabel, { color: cfg.couleur }]}>{cfg.label}</Text>
                    </View>
                  </View>
                  <Text style={stylesA.insightCommentaire}>{insight.commentaire}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Ajustements groupes */}
      {analyse.ajustements_groupes.length > 0 && (
        <View style={stylesA.section}>
          <Text style={stylesA.sectionTitre}>Suggestions pour la prochaine séance</Text>
          {analyse.ajustements_groupes.map((adj, i) => (
            <View key={i} style={stylesA.ajustCard}>
              <View style={stylesA.ajustHeader}>
                <Ionicons name="git-branch-outline" size={13} color={COULEURS.legend[400]} />
                <Text style={stylesA.ajustNom}>{adj.runner_nom}</Text>
              </View>
              <Text style={stylesA.ajustSuggestion}>{adj.suggestion}</Text>
              <Text style={stylesA.ajustRaison}>{adj.raison}</Text>
            </View>
          ))}
        </View>
      )}

      {/* CTA chat */}
      <TouchableOpacity
        style={stylesA.chatBtn}
        onPress={() => router.push(`/chat/${crewId}` as any)}
        activeOpacity={0.8}
      >
        <Ionicons name="chatbubbles-outline" size={15} color={COULEURS.legend[500]} />
        <Text style={stylesA.chatBtnTexte}>Voir le récap dans le chat</Text>
        <Ionicons name="arrow-forward" size={13} color={COULEURS.legend[400]} />
      </TouchableOpacity>
    </View>
  );
}

const stylesA = StyleSheet.create({
  bloc: {
    marginHorizontal: ESPACEMENT.md,
    marginTop: ESPACEMENT.lg,
    backgroundColor: '#fff',
    borderRadius: RAYONS.xl,
    borderWidth: 1.5,
    borderColor: COULEURS.legend[100],
    padding: ESPACEMENT.md,
    gap: ESPACEMENT.md,
    shadowColor: COULEURS.legend[500],
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  headerIcone: {
    width: 34,
    height: 34,
    borderRadius: RAYONS.full,
    backgroundColor: COULEURS.legend[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitre: { fontSize: 15, fontWeight: '700', color: COULEURS.night[700], marginTop: 1 },
  headerSous: { fontSize: 11, color: COULEURS.night[400], marginTop: 2 },
  kipperBadge: {
    backgroundColor: COULEURS.legend[500],
    borderRadius: RAYONS.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  kipperBadgeTexte: { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },

  syntheseBloc: {
    backgroundColor: COULEURS.legend[50],
    borderRadius: RAYONS.lg,
    padding: ESPACEMENT.sm,
  },
  syntheseTexte: { fontSize: 14, color: COULEURS.night[600], lineHeight: 21, fontStyle: 'italic' },

  section: { gap: 10 },
  sectionTitre: {
    fontSize: 11,
    fontWeight: '700',
    color: COULEURS.night[400],
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },

  insightsList: { gap: 8 },
  insightCard: {
    backgroundColor: COULEURS.night[50],
    borderRadius: RAYONS.lg,
    padding: 12,
    gap: 6,
  },
  insightHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  insightAvatar: {
    width: 30,
    height: 30,
    borderRadius: RAYONS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightInitiales: { fontSize: 11, fontWeight: '700' },
  insightNom: { flex: 1, fontSize: 14, fontWeight: '600', color: COULEURS.night[700] },
  statutBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: RAYONS.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statutLabel: { fontSize: 10, fontWeight: '700' },
  insightCommentaire: { fontSize: 13, color: COULEURS.night[500], lineHeight: 19 },

  ajustCard: {
    borderLeftWidth: 3,
    borderLeftColor: COULEURS.legend[300],
    paddingLeft: 12,
    gap: 3,
    paddingVertical: 4,
  },
  ajustHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ajustNom: { fontSize: 13, fontWeight: '700', color: COULEURS.night[700] },
  ajustSuggestion: { fontSize: 13, color: COULEURS.legend[600], fontWeight: '600' },
  ajustRaison: { fontSize: 12, color: COULEURS.night[400], lineHeight: 17 },

  chatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COULEURS.legend[50],
    borderWidth: 1.5,
    borderColor: COULEURS.legend[200],
    borderRadius: RAYONS.full,
    paddingHorizontal: ESPACEMENT.md,
    paddingVertical: 11,
    justifyContent: 'center',
  },
  chatBtnTexte: { fontSize: 14, fontWeight: '600', color: COULEURS.legend[500], flex: 1, textAlign: 'center' },
});

const stylesKipper = StyleSheet.create({
  bloc: {
    marginHorizontal: ESPACEMENT.md,
    marginTop: ESPACEMENT.lg,
    backgroundColor: '#fff',
    borderRadius: RAYONS.xl,
    borderWidth: 1.5,
    borderColor: COULEURS.legend[100],
    padding: ESPACEMENT.md,
    gap: ESPACEMENT.md,
    shadowColor: COULEURS.legend[500],
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  iconeWrap: {
    width: 34,
    height: 34,
    borderRadius: RAYONS.full,
    backgroundColor: COULEURS.legend[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  titre: { fontSize: 15, fontWeight: '700', color: COULEURS.night[700], marginTop: 1 },
  sous: { fontSize: 11, color: COULEURS.night[400], marginTop: 2, lineHeight: 16 },
  debugBtn: { padding: 6, borderRadius: RAYONS.full },
  debugBtnActif: { backgroundColor: COULEURS.legend[50] },
  bouton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COULEURS.legend[500],
    borderRadius: RAYONS.full,
    paddingVertical: 14,
    shadowColor: COULEURS.legend[500],
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 3,
  },
  boutonEnCours: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  boutonTexte: { fontSize: 15, fontWeight: '700', color: '#fff' },
});

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centrage: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  texteErreur: { fontSize: 16, color: COULEURS.night[400] },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: ESPACEMENT.md,
    paddingVertical: ESPACEMENT.sm,
    borderBottomWidth: 1,
    borderBottomColor: COULEURS.night[100],
    backgroundColor: '#fff',
  },
  boutonRetour: {
    width: 40,
    height: 40,
    borderRadius: RAYONS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boutonModifier: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COULEURS.legend[50],
    borderWidth: 1,
    borderColor: COULEURS.legend[200],
    borderRadius: RAYONS.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  boutonModifierTexte: {
    fontSize: 13,
    fontWeight: '600',
    color: COULEURS.legend[500],
  },
  headerTitre: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: COULEURS.night[700],
    textAlign: 'center',
  },

  contenu: { paddingBottom: 20 },

  // Hero
  hero: {
    height: 220,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  heroContenu: {
    padding: ESPACEMENT.md,
    gap: 6,
  },
  heroTypeLigne: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RAYONS.full,
  },
  typeBadgeTexte: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },
  validéeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: RAYONS.full,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  validéeBadgeTexte: { fontSize: 11, fontWeight: '700', color: '#fff' },
  heroTitre: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },
  heroDate: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '500',
  },

  // Grille info
  grilleInfo: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: ESPACEMENT.sm,
    padding: ESPACEMENT.md,
    paddingBottom: 0,
  },
  carteInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COULEURS.night[50],
    borderRadius: RAYONS.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexBasis: '47%',
    flexGrow: 1,
  },
  carteInfoLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COULEURS.night[400],
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  carteInfoValeur: {
    fontSize: 14,
    fontWeight: '600',
    color: COULEURS.night[700],
    marginTop: 1,
  },

  // Description
  section: {
    paddingHorizontal: ESPACEMENT.md,
    paddingTop: ESPACEMENT.lg,
  },
  descriptionTexte: {
    fontSize: 15,
    color: COULEURS.night[500],
    lineHeight: 23,
  },

  // Accordéon
  accordeon: {
    marginHorizontal: ESPACEMENT.md,
    marginTop: ESPACEMENT.lg,
    backgroundColor: COULEURS.night[50],
    borderRadius: RAYONS.xl,
    overflow: 'hidden',
  },
  accordeonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: ESPACEMENT.md,
  },
  accordeonTitre: {
    fontSize: 17,
    fontWeight: '700',
    color: COULEURS.night[700],
  },

  // Timeline déroulé
  timeline: {
    paddingHorizontal: ESPACEMENT.md,
    paddingBottom: ESPACEMENT.md,
    paddingLeft: ESPACEMENT.md + 8,
  },
  etapeContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  etapeGauche: {
    alignItems: 'center',
    width: 20,
  },
  etapePoint: {
    width: 20,
    height: 20,
    borderRadius: RAYONS.full,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  etapePointInterne: {
    width: 8,
    height: 8,
    borderRadius: RAYONS.full,
    backgroundColor: '#fff',
  },
  etapeLigne: {
    width: 2,
    flex: 1,
    marginVertical: 2,
    minHeight: 20,
  },
  etapeCorps: {
    flex: 1,
    paddingBottom: ESPACEMENT.md,
    paddingTop: 1,
  },
  etapeTitre: {
    fontSize: 15,
    fontWeight: '600',
    color: COULEURS.night[700],
  },
  etapeMeta: {
    fontSize: 13,
    marginTop: 3,
    lineHeight: 18,
  },

  // Groupes d'allure
  groupesListe: {
    paddingHorizontal: ESPACEMENT.md,
    paddingBottom: ESPACEMENT.md,
    gap: ESPACEMENT.sm,
  },
  groupesSousTitre: {
    fontSize: 13,
    color: COULEURS.night[400],
    marginBottom: 4,
  },
  carteGroupe: {
    backgroundColor: '#fff',
    borderLeftWidth: 4,
    borderRadius: 4,
    borderTopRightRadius: RAYONS.lg,
    borderBottomRightRadius: RAYONS.lg,
    padding: ESPACEMENT.md,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  carteGroupeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  carteGroupeNom: {
    fontSize: 15,
    fontWeight: '700',
    color: COULEURS.night[700],
    flex: 1,
  },
  allureBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RAYONS.full,
  },
  allureTexte: {
    fontSize: 13,
    fontWeight: '700',
  },
  carteGroupeConsignes: {
    fontSize: 13,
    color: COULEURS.night[400],
    lineHeight: 18,
  },

  // Workout v2 display
  wkBlocEtape: { borderLeftWidth: 3, borderRadius: 4, backgroundColor: COULEURS.night[50], padding: ESPACEMENT.sm, marginBottom: 6 },
  wkBlocEtapeIndente: { marginLeft: ESPACEMENT.md },
  wkEtapeLabel: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  wkEtapeMeta: { fontSize: 12, color: COULEURS.night[500] },
  wkBoucle: { backgroundColor: COULEURS.legend[50], borderRadius: RAYONS.md, padding: ESPACEMENT.sm, marginBottom: 8, borderWidth: 1, borderColor: COULEURS.legend[100] },
  wkBoucleHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: ESPACEMENT.sm },
  wkBoucleHeaderTexte: { fontSize: 13, fontWeight: '700', color: COULEURS.legend[600] },

  // Participants
  accordeonTitreRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  countBadge: { backgroundColor: COULEURS.legend[100], borderRadius: RAYONS.full, paddingHorizontal: 8, paddingVertical: 2 },
  countBadgeTexte: { fontSize: 12, fontWeight: '700', color: COULEURS.legend[600] },
  participantsVide: { paddingHorizontal: ESPACEMENT.md, paddingBottom: ESPACEMENT.md },
  participantsVideTexte: { fontSize: 14, color: COULEURS.night[400], fontStyle: 'italic' },
  participantsList: { paddingHorizontal: ESPACEMENT.md, paddingBottom: ESPACEMENT.md, gap: 2 },
  ligneParticipant: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  avatarParticipant: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  avatarInitiales: { fontSize: 13, fontWeight: '700' },
  nomParticipant: { flex: 1, fontSize: 15, fontWeight: '500', color: COULEURS.night[700] },
  moiBadge: { backgroundColor: COULEURS.legend[50], borderRadius: RAYONS.full, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: COULEURS.legend[200] },
  moiBadgeTexte: { fontSize: 11, fontWeight: '700', color: COULEURS.legend[500] },

  // Validation
  validationBloc: {
    marginHorizontal: ESPACEMENT.md,
    marginTop: ESPACEMENT.lg,
    backgroundColor: COULEURS.succes + '0D',
    borderRadius: RAYONS.xl,
    borderWidth: 1,
    borderColor: COULEURS.succes + '30',
    padding: ESPACEMENT.md,
    gap: ESPACEMENT.sm,
  },
  validationInfo: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
  },
  validationInfoTexte: {
    flex: 1, fontSize: 13, color: COULEURS.night[500], lineHeight: 18,
  },
  validationDistanceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', borderRadius: RAYONS.lg,
    borderWidth: 1.5, borderColor: COULEURS.succes + '50',
    paddingHorizontal: ESPACEMENT.sm, paddingVertical: 10,
  },
  validationDistanceInput: {
    flex: 1, fontSize: 15, fontWeight: '600', color: COULEURS.night[700],
  },
  boutonValider: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COULEURS.succes, borderRadius: RAYONS.full,
    paddingVertical: 14,
    shadowColor: COULEURS.succes,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  boutonValiderTexte: { fontSize: 16, fontWeight: '700', color: '#fff' },

  // CTA
  ctaContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: ESPACEMENT.md,
    paddingBottom: ESPACEMENT.lg,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderTopWidth: 1,
    borderTopColor: COULEURS.night[100],
  },
  ctaBouton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: COULEURS.volt[500],
    borderRadius: RAYONS.full,
    paddingVertical: 18,
    shadowColor: COULEURS.volt[500],
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
  },
  ctaBoutonPresent: {
    backgroundColor: COULEURS.legend[50],
    borderWidth: 2,
    borderColor: COULEURS.legend[200],
    shadowOpacity: 0,
    elevation: 0,
  },
  ctaTexte: {
    fontSize: 17,
    fontWeight: '800',
    color: COULEURS.night[700],
    letterSpacing: -0.3,
  },
  ctaTextePresent: {
    color: COULEURS.legend[500],
  },
});
