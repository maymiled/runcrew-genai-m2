import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COULEURS, ESPACEMENT, RAYONS } from '../../../src/lib/constantes';
import { supabase } from '../../../src/lib/supabase';
import { useAuthStore } from '../../../src/stores/useAuthStore';
import { Crew, Membre } from '../../../src/types/crew';
import { Profil } from '../../../src/types/profil';
import { Session } from '../../../src/types/session';
import { TypeEntrainement } from '../../../src/types/base';

type MembreAvecProfil = Membre & { profils: Profil };
type Onglet = 'sessions' | 'membres' | 'infos';

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
  libre: COULEURS.night[400],
};

const ICONES_TYPE: Record<TypeEntrainement, keyof typeof Ionicons.glyphMap> = {
  fractionne: 'flash',
  seuil: 'speedometer',
  tempo: 'pulse',
  footing: 'walk',
  sortie_longue: 'map',
  libre: 'star',
};

function formaterDate(iso: string): string {
  const d = new Date(iso);
  const maintenant = new Date();
  const demain = new Date(maintenant);
  demain.setDate(maintenant.getDate() + 1);

  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  if (d.toDateString() === maintenant.toDateString()) return `Aujourd'hui · ${heure}`;
  if (d.toDateString() === demain.toDateString()) return `Demain · ${heure}`;

  const jour = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${jour} · ${heure}`;
}

function initialesNom(nom: string): string {
  return nom
    .split(' ')
    .slice(0, 2)
    .map((m) => m[0]?.toUpperCase() ?? '')
    .join('');
}

export default function PageCrew() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useAuthStore((s) => s.session);

  const [crew, setCrew] = useState<Crew | null>(null);
  const [membres, setMembres] = useState<MembreAvecProfil[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [capitaineProfil, setCapitaineProfil] = useState<Profil | null>(null);
  const [totalRunsCrew, setTotalRunsCrew] = useState(0);
  const [runsParMembre, setRunsParMembre] = useState<Record<string, number>>({});
  const [chargement, setChargement] = useState(true);
  const [onglet, setOnglet] = useState<Onglet>('sessions');
  const [uploadPhoto, setUploadPhoto] = useState(false);

  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!id) return;
    chargerTout();
  }, [id]);

  async function chargerTout() {
    setChargement(true);

    const [{ data: crewData }, { data: membresData }, { data: sessionsData }, { data: sessionsValidees }] = await Promise.all([
      supabase.from('crews').select('*').eq('id', id).single(),
      supabase.from('membres').select('*, profils(*)').eq('crew_id', id).order('rejoint_le', { ascending: true }),
      supabase
        .from('sessions')
        .select('*')
        .eq('crew_id', id)
        .or(`heure_rdv.gte.${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()},validee.eq.true`)
        .order('heure_rdv', { ascending: true }),
      supabase
        .from('sessions')
        .select('id')
        .eq('crew_id', id)
        .eq('validee', true),
    ]);

    if (crewData) {
      setCrew(crewData as Crew);
      const { data: profCap } = await supabase
        .from('profils')
        .select('*')
        .eq('id', crewData.capitaine_id)
        .single();
      if (profCap) setCapitaineProfil(profCap as Profil);
    }

    if (membresData) setMembres(membresData as MembreAvecProfil[]);
    if (sessionsData) setSessions(sessionsData as Session[]);

    // Stats dynamiques : runs totaux du crew et runs par membre
    const sessionIds = (sessionsValidees ?? []).map((s: any) => s.id);
    setTotalRunsCrew(sessionIds.length);

    if (sessionIds.length > 0) {
      const { data: confirmsData } = await supabase
        .from('confirmations')
        .select('utilisateur_id')
        .in('session_id', sessionIds)
        .eq('statut', 'present');

      const map: Record<string, number> = {};
      for (const c of (confirmsData ?? [])) {
        map[c.utilisateur_id] = (map[c.utilisateur_id] ?? 0) + 1;
      }
      setRunsParMembre(map);
    } else {
      setRunsParMembre({});
    }

    setChargement(false);
  }

  function changerOnglet(nouvelOnglet: Onglet) {
    setOnglet(nouvelOnglet);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }

  const estCapitaine = crew && session?.user?.id === crew.capitaine_id;
  const estMembre = membres.some(m => m.utilisateur_id === session?.user?.id);

  function quitterCrew() {
    if (!session?.user?.id || !id) return;
    const executer = async () => {
      const { error } = await supabase
        .from('membres')
        .delete()
        .eq('crew_id', id)
        .eq('utilisateur_id', session!.user.id);
      if (!error) router.replace('/(app)/(tabs)/accueil');
      else Alert.alert('Erreur', 'Impossible de quitter ce crew.');
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Quitter ${crew?.nom ?? 'ce crew'} ?`)) executer();
    } else {
      Alert.alert(
        'Quitter le crew',
        `Es-tu sûr de vouloir quitter ${crew?.nom ?? 'ce crew'} ?`,
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Quitter', style: 'destructive', onPress: executer },
        ]
      );
    }
  }

  async function choisirPhotoCrew() {
    if (!id || !session?.user?.id || uploadPhoto) return;

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission refusée', 'Autorise l\'accès à ta galerie dans les réglages.');
      return;
    }

    const resultat = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.7,
    });

    if (resultat.canceled || !resultat.assets?.[0]) return;

    setUploadPhoto(true);
    try {
      const asset = resultat.assets[0];
      const uri = asset.uri;
      const reponse = await fetch(uri);
      const blob = await reponse.blob();
      const mimeType = asset.mimeType ?? blob.type ?? 'image/jpeg';
      const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
      const chemin = `crew-${id}/photo.${ext}`;

      const { error: erreurUpload } = await supabase.storage
        .from('Avatars')
        .upload(chemin, blob, { upsert: true, contentType: mimeType });

      if (erreurUpload) throw erreurUpload;

      const { data: { publicUrl } } = supabase.storage.from('Avatars').getPublicUrl(chemin);

      const urlAvecBust = `${publicUrl}?v=${Date.now()}`;
      const { error: erreurUpdate } = await supabase
        .from('crews')
        .update({ photo_url: urlAvecBust })
        .eq('id', id);

      if (erreurUpdate) throw erreurUpdate;

      setCrew(prev => prev ? { ...prev, photo_url: urlAvecBust } : null);
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Impossible de mettre à jour la photo.');
    } finally {
      setUploadPhoto(false);
    }
  }

  function supprimerSession(sessionId: string) {
    const doDelete = async () => {
      // .select() retourne les lignes réellement supprimées — vide si RLS bloque
      const { data: supprimees, error } = await supabase
        .from('sessions')
        .delete()
        .eq('id', sessionId)
        .select('id');

      if (error) {
        const msg = 'Impossible de supprimer cette session.';
        Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Erreur', msg);
        return;
      }

      if (supprimees && supprimees.length > 0) {
        setSessions(prev => prev.filter(s => s.id !== sessionId));
      } else {
        // RLS a bloqué silencieusement : l'utilisateur n'a pas la permission
        const msg = 'Permission refusée : seul le créateur ou le capitaine peut supprimer cette session.';
        Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Permission refusée', msg);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Supprimer cette session définitivement pour tous les membres ?')) {
        doDelete();
      }
    } else {
      Alert.alert(
        'Supprimer la session',
        'Cette session sera supprimée définitivement pour tous les membres.',
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Supprimer', style: 'destructive', onPress: doDelete },
        ]
      );
    }
  }

  function supprimerCrew() {
    if (!session?.user?.id || !id) return;
    const executer = async () => {
      const { error } = await supabase
        .from('crews')
        .delete()
        .eq('id', id)
        .eq('capitaine_id', session!.user.id);
      if (!error) router.replace('/(app)/(tabs)/accueil');
      else Alert.alert('Erreur', 'Impossible de supprimer ce crew.');
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Supprimer ce crew définitivement ? Action irréversible.')) executer();
    } else {
      Alert.alert(
        'Supprimer le crew',
        'Cette action est irréversible. Tous les membres, sessions et données seront supprimés définitivement.',
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Supprimer', style: 'destructive', onPress: executer },
        ]
      );
    }
  }

  if (chargement) {
    return (
      <View style={styles.centrage}>
        <ActivityIndicator color={COULEURS.legend[500]} size="large" />
      </View>
    );
  }

  if (!crew) {
    return (
      <View style={styles.centrage}>
        <Text style={styles.texteErreur}>Crew introuvable</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.canDismiss() ? router.dismiss() : router.replace('/(app)/(tabs)/accueil')} style={styles.boutonRetour}>
          <Ionicons name="arrow-back" size={24} color={COULEURS.night[700]} />
        </TouchableOpacity>
        <Text style={styles.headerTitre} numberOfLines={1}>
          {crew.nom}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={styles.contenu}>
        {/* Bannière */}
        <View style={styles.banniere}>
          {crew.photo_url ? (
            <Image
              source={{ uri: crew.photo_url }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
          ) : null}
          <View style={[styles.banniereOverlay, crew.photo_url ? styles.banniereOverlayPhoto : null]} />
          <Text style={styles.banniereNom}>{crew.nom.toUpperCase()}</Text>
          {capitaineProfil && (
            <View style={styles.capitaineBadge}>
              <Ionicons name="shield-checkmark" size={13} color="#fff" />
              <Text style={styles.capitaineTexte}>
                Capitaine : {capitaineProfil.nom_affichage}
              </Text>
            </View>
          )}
          {estCapitaine && (
            <TouchableOpacity
              style={styles.bannierePhotoBtn}
              onPress={choisirPhotoCrew}
              disabled={uploadPhoto}
              activeOpacity={0.8}
            >
              {uploadPhoto ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="camera-outline" size={15} color="#fff" />
                  <Text style={styles.bannierePhotoTexte}>
                    {crew.photo_url ? 'Modifier la photo' : 'Ajouter une photo'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Stats */}
        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Text style={styles.statValeur} numberOfLines={1}>{crew.ville}</Text>
            <Text style={styles.statLabel}>VILLE</Text>
          </View>
          <View style={[styles.statItem, styles.statSep]}>
            <Text style={styles.statValeur}>{crew.nombre_membres}</Text>
            <Text style={styles.statLabel}>MEMBRES</Text>
          </View>
          <View style={[styles.statItem, styles.statSep]}>
            <Text style={styles.statValeur}>{totalRunsCrew}</Text>
            <Text style={styles.statLabel}>RUNS</Text>
          </View>
          <View style={[styles.statItem, styles.statSep]}>
            <Text style={styles.statValeur}>{crew.serie_actuelle}j</Text>
            <Text style={styles.statLabel}>STREAK</Text>
          </View>
        </View>

        {/* Onglets */}
        <View style={styles.tabs}>
          {(['sessions', 'membres', 'infos'] as Onglet[]).map((o) => (
            <TouchableOpacity
              key={o}
              style={[styles.tab, onglet === o && styles.tabActif]}
              onPress={() => changerOnglet(o)}
            >
              <Text style={[styles.tabTexte, onglet === o && styles.tabTexteActif]}>
                {o === 'sessions' ? 'Sessions' : o === 'membres' ? 'Membres' : 'Infos'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Contenu Sessions */}
        {onglet === 'sessions' && (() => {
          const maintenant = new Date();
          const aVenir = sessions.filter(s => new Date(s.heure_rdv) >= maintenant && !s.validee);
          const passees = sessions.filter(s => new Date(s.heure_rdv) < maintenant || !!s.validee);

          return (
            <View style={styles.section}>
              {estCapitaine && (
                <TouchableOpacity
                  style={styles.boutonCreerSession}
                  onPress={() => router.push(`/session/creer?crewId=${id}`)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="add-circle" size={20} color="#fff" />
                  <Text style={styles.boutonCreerSessionTexte}>Planifier une session</Text>
                </TouchableOpacity>
              )}

              {estCapitaine && (
                <TouchableOpacity
                  style={styles.boutonCoachIA}
                  onPress={() => router.push(`/coach/${id}` as any)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="sparkles" size={20} color="#fff" />
                  <Text style={styles.boutonCreerSessionTexte}>Coach IA</Text>
                </TouchableOpacity>
              )}

              {/* Sessions à venir */}
              {aVenir.length > 0 && (
                <View style={styles.sectionSessions}>
                  <View style={styles.sectionSessionsHeader}>
                    <View style={[styles.sectionSessionsDot, { backgroundColor: COULEURS.legend[500] }]} />
                    <Text style={styles.sectionSessionsTitre}>À venir</Text>
                    <View style={[styles.sectionSessionsCount, { backgroundColor: COULEURS.legend[50] }]}>
                      <Text style={[styles.sectionSessionsCountTexte, { color: COULEURS.legend[600] }]}>{aVenir.length}</Text>
                    </View>
                  </View>
                  {aVenir.map((s) => <CarteSession key={s.id} session={s} estCapitaine={!!estCapitaine} onSupprimer={() => supprimerSession(s.id)} />)}
                </View>
              )}

              {/* Sessions passées */}
              {passees.length > 0 && (
                <View style={styles.sectionSessions}>
                  <View style={styles.sectionSessionsHeader}>
                    <View style={[styles.sectionSessionsDot, { backgroundColor: COULEURS.night[300] }]} />
                    <Text style={[styles.sectionSessionsTitre, { color: COULEURS.night[400] }]}>Passées</Text>
                    <View style={[styles.sectionSessionsCount, { backgroundColor: COULEURS.night[100] }]}>
                      <Text style={[styles.sectionSessionsCountTexte, { color: COULEURS.night[400] }]}>{passees.length}</Text>
                    </View>
                  </View>
                  {passees.map((s) => <CarteSession key={s.id} session={s} estCapitaine={!!estCapitaine} onSupprimer={() => supprimerSession(s.id)} />)}
                </View>
              )}

              {sessions.length === 0 && (
                <View style={styles.etatVide}>
                  <Ionicons name="calendar-outline" size={48} color={COULEURS.night[200]} />
                  <Text style={styles.etatVideTitre}>Aucune session planifiée</Text>
                  <Text style={styles.etatVideTexte}>
                    {estCapitaine
                      ? 'Clique sur le bouton ci-dessus pour créer la première session !'
                      : "Le capitaine n'a pas encore planifié de session."}
                  </Text>
                </View>
              )}
            </View>
          );
        })()}

        {/* Contenu Membres */}
        {onglet === 'membres' && (
          <View style={styles.section}>
            {membres.map((m) => (
              <LigneMembre
                key={m.id}
                membre={m}
                crewId={id!}
                nbRuns={runsParMembre[m.utilisateur_id] ?? 0}
              />
            ))}
          </View>
        )}

        {/* Contenu Infos */}
        {onglet === 'infos' && (
          <View style={styles.section}>
            {crew.description ? (
              <View style={styles.infoBloc}>
                <Text style={styles.infoBlocTitre}>À propos</Text>
                <Text style={styles.infoTexte}>{crew.description}</Text>
              </View>
            ) : null}

            <View style={styles.infoBloc}>
              <Text style={styles.infoBlocTitre}>Code d'invitation</Text>
              <View style={styles.codeBox}>
                <Text style={styles.codeTexte}>{crew.code_invitation}</Text>
                <Text style={styles.codeSousTitre}>
                  Partage ce code pour inviter tes coéquipiers
                </Text>
              </View>
              <TouchableOpacity
                style={styles.boutonPartager}
                onPress={() =>
                  Share.share({
                    message: `Rejoins mon crew "${crew.nom}" sur RunCrew ! 🏃\nCode d'invitation : ${crew.code_invitation}`,
                    title: `Rejoin ${crew.nom}`,
                  })
                }
                activeOpacity={0.8}
              >
                <Ionicons name="share-social-outline" size={18} color={COULEURS.legend[500]} />
                <Text style={styles.boutonPartagerTexte}>Partager le code</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.infoBloc}>
              <Text style={styles.infoBlocTitre}>Détails</Text>
              <View style={styles.detailLigne}>
                <Ionicons name="location-outline" size={16} color={COULEURS.night[400]} />
                <Text style={styles.detailTexte}>{crew.ville}</Text>
              </View>
              <View style={styles.detailLigne}>
                <Ionicons name="people-outline" size={16} color={COULEURS.night[400]} />
                <Text style={styles.detailTexte}>
                  {crew.nombre_membres} / {crew.max_membres} membres
                </Text>
              </View>
            </View>

            {estMembre && !estCapitaine && (
              <TouchableOpacity style={styles.boutonQuitter} onPress={quitterCrew}>
                <Ionicons name="exit-outline" size={18} color={COULEURS.danger} />
                <Text style={styles.boutonQuitterTexte}>Quitter ce crew</Text>
              </TouchableOpacity>
            )}
            {estCapitaine && (
              <TouchableOpacity style={styles.boutonQuitter} onPress={supprimerCrew}>
                <Ionicons name="trash-outline" size={18} color={COULEURS.danger} />
                <Text style={styles.boutonQuitterTexte}>Supprimer le crew</Text>
              </TouchableOpacity>
            )}
            {!estMembre && !estCapitaine && (
              <TouchableOpacity
                style={styles.boutonRejoindre}
                onPress={() => router.push('/crew/rejoindre' as any)}
                activeOpacity={0.85}
              >
                <Ionicons name="enter-outline" size={18} color="#fff" />
                <Text style={styles.boutonRejoindreTexte}>Rejoindre avec un code</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>

    </SafeAreaView>
  );
}

function CarteSession({ session, estCapitaine, onSupprimer }: { session: Session; estCapitaine?: boolean; onSupprimer?: () => void }) {
  const couleur = COULEURS_TYPE[session.type_entrainement];
  const icone = ICONES_TYPE[session.type_entrainement];
  const estPassee = new Date(session.heure_rdv) < new Date();
  const estValidee = !!session.validee;

  function naviguer() {
    router.push(`/session/${session.id}`);
  }

  function appuieSurCarte() {
    if (!estPassee) { naviguer(); return; }
    if (Platform.OS === 'web') {
      if (window.confirm('Voir les détails de cette séance ?')) naviguer();
    } else {
      Alert.alert(session.titre, 'Voulez-vous voir les détails de cette séance ?', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Voir les détails', onPress: naviguer },
      ]);
    }
  }

  return (
    <View style={[styles.carteSession, estPassee && styles.carteSessionPassee]}>
      {/* Rangée principale */}
      <View style={styles.carteSessionRangee}>
        <TouchableOpacity
          style={styles.carteSessionZoneNav}
          activeOpacity={0.75}
          onPress={appuieSurCarte}
        >
          <View style={[styles.carteSessionIcone, { backgroundColor: estPassee ? COULEURS.night[100] : couleur + '18' }]}>
            <Ionicons
              name={estValidee ? 'checkmark-done' : icone}
              size={22}
              color={estPassee ? COULEURS.night[400] : couleur}
            />
          </View>
          <View style={styles.carteSessionCorps}>
            <View style={styles.carteSessionLigne}>
              <Text style={[styles.carteSessionTitre, estPassee && styles.carteSessionTitrePassee]} numberOfLines={1}>
                {session.titre}
              </Text>
              {estValidee ? (
                <View style={[styles.badge, { backgroundColor: COULEURS.succes + '22' }]}>
                  <Ionicons name="checkmark-circle" size={10} color={COULEURS.succes} />
                  <Text style={[styles.badgeTexte, { color: COULEURS.succes }]}>Validée</Text>
                </View>
              ) : estPassee ? (
                <View style={[styles.badge, { backgroundColor: COULEURS.night[100] }]}>
                  <Text style={[styles.badgeTexte, { color: COULEURS.night[400] }]}>Passé</Text>
                </View>
              ) : (
                <View style={[styles.badge, { backgroundColor: couleur + '18' }]}>
                  <Text style={[styles.badgeTexte, { color: couleur }]}>À venir</Text>
                </View>
              )}
            </View>
            <View style={styles.carteSessionMeta}>
              <Ionicons name="time-outline" size={13} color={COULEURS.night[300]} />
              <Text style={[styles.carteSessionMetaTexte, estPassee && styles.carteSessionMetaPassee]}>
                {formaterDate(session.heure_rdv)}
              </Text>
              {session.duree_entrainement_min && (
                <Text style={[styles.carteSessionMetaTexte, estPassee && styles.carteSessionMetaPassee]}>
                  · {session.duree_entrainement_min} min
                </Text>
              )}
            </View>
            <View style={styles.carteSessionMeta}>
              <Ionicons name="people-outline" size={13} color={COULEURS.night[300]} />
              <Text style={[styles.carteSessionMetaTexte, { color: COULEURS.night[400], fontWeight: '600' }]}>
                {session.nb_presents} runner{session.nb_presents !== 1 ? 's' : ''} inscrit{session.nb_presents !== 1 ? 's' : ''}
              </Text>
            </View>
          </View>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={estPassee ? COULEURS.night[300] : COULEURS.night[300]}
          />
        </TouchableOpacity>

        {/* Bouton suppression */}
        {estCapitaine && onSupprimer && (
          <TouchableOpacity
            onPress={onSupprimer}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.boutonSupprimerSession}
          >
            <Ionicons name="trash-outline" size={16} color={COULEURS.danger} />
          </TouchableOpacity>
        )}
      </View>

      {/* Bandeau "Voir les détails" pour les sessions passées */}
      {estPassee && (
        <TouchableOpacity style={styles.voirDetailsBandeau} onPress={naviguer} activeOpacity={0.7}>
          <Ionicons name="eye-outline" size={15} color={COULEURS.legend[500]} />
          <Text style={styles.voirDetailsTexte}>Voir les détails</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function LigneMembre({ membre, crewId, nbRuns }: { membre: MembreAvecProfil; crewId: string; nbRuns: number }) {
  const estCapitaine = membre.role === 'capitaine';
  const estPacer = membre.role === 'pacer';
  const nomAffichage = membre.profils?.nom_affichage ?? 'Membre';
  const photoUrl = membre.profils?.photo_url;

  return (
    <TouchableOpacity
      style={styles.ligneMembre}
      onPress={() => router.push(`/profil/${membre.utilisateur_id}?crewId=${crewId}` as any)}
      activeOpacity={0.7}
    >
      <View style={styles.membreAvatar}>
        {photoUrl ? (
          <Image source={{ uri: photoUrl }} style={styles.membreAvatarImage} contentFit="cover" />
        ) : (
          <Text style={styles.membreAvatarTexte}>{initialesNom(nomAffichage)}</Text>
        )}
      </View>
      <View style={styles.membreCorps}>
        <View style={styles.membreLigne}>
          <Text style={styles.membreNom}>{nomAffichage}</Text>
          {estCapitaine && (
            <View style={[styles.badge, { backgroundColor: COULEURS.legend[100] }]}>
              <Ionicons name="shield-checkmark" size={10} color={COULEURS.legend[500]} />
              <Text style={[styles.badgeTexte, { color: COULEURS.legend[500] }]}>Capitaine</Text>
            </View>
          )}
          {estPacer && (
            <View style={[styles.badge, { backgroundColor: COULEURS.volt[100] }]}>
              <Text style={[styles.badgeTexte, { color: COULEURS.volt[600] }]}>Pacer</Text>
            </View>
          )}
        </View>
        <Text style={styles.membreStats}>
          {nbRuns} run{nbRuns !== 1 ? 's' : ''}
          {membre.serie_actuelle > 0 && ` · 🔥 ${membre.serie_actuelle}j de streak`}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={COULEURS.night[200]} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centrage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  texteErreur: {
    fontSize: 16,
    color: COULEURS.night[400],
  },

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
  headerTitre: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: COULEURS.night[700],
    textAlign: 'center',
  },

  contenu: {
    paddingBottom: 100,
  },

  // Bannière
  banniere: {
    backgroundColor: COULEURS.legend[500],
    paddingHorizontal: ESPACEMENT.md,
    paddingTop: ESPACEMENT.xl,
    paddingBottom: ESPACEMENT['2xl'],
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  banniereOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  banniereOverlayPhoto: {
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  banniereNom: {
    fontSize: 34,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -1,
  },
  capitaineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: ESPACEMENT.sm,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RAYONS.full,
  },
  capitaineTexte: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  bannierePhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: ESPACEMENT.sm,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: RAYONS.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  bannierePhotoTexte: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },

  // Stats
  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginHorizontal: ESPACEMENT.md,
    marginTop: -ESPACEMENT.lg,
    borderRadius: RAYONS.xl,
    paddingVertical: ESPACEMENT.md,
    paddingHorizontal: ESPACEMENT.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 5,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statSep: {
    borderLeftWidth: 1,
    borderLeftColor: COULEURS.night[100],
  },
  statValeur: {
    fontSize: 16,
    fontWeight: '700',
    color: COULEURS.legend[500],
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: COULEURS.night[300],
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Tabs
  tabs: {
    flexDirection: 'row',
    marginTop: ESPACEMENT.lg,
    paddingHorizontal: ESPACEMENT.md,
    borderBottomWidth: 1,
    borderBottomColor: COULEURS.night[100],
  },
  tab: {
    paddingBottom: ESPACEMENT.sm,
    marginRight: ESPACEMENT.lg,
  },
  tabActif: {
    borderBottomWidth: 2,
    borderBottomColor: COULEURS.legend[500],
  },
  tabTexte: {
    fontSize: 15,
    fontWeight: '600',
    color: COULEURS.night[400],
  },
  tabTexteActif: {
    color: COULEURS.legend[500],
  },

  section: {
    paddingHorizontal: ESPACEMENT.md,
    paddingTop: ESPACEMENT.md,
  },

  // Carte session
  carteSession: {
    flexDirection: 'column',
    borderBottomWidth: 1,
    borderBottomColor: COULEURS.night[50],
  },
  carteSessionRangee: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: ESPACEMENT.md,
  },
  carteSessionZoneNav: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: ESPACEMENT.sm,
  },
  carteSessionPassee: {
    backgroundColor: COULEURS.night[50],
  },
  carteSessionTitrePassee: {
    color: COULEURS.night[400],
  },
  carteSessionMetaPassee: {
    color: COULEURS.night[300],
  },
  voirDetailsBandeau: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COULEURS.legend[100],
    backgroundColor: COULEURS.legend[50],
    borderBottomLeftRadius: RAYONS.md,
    borderBottomRightRadius: RAYONS.md,
  },
  voirDetailsTexte: {
    fontSize: 13,
    color: COULEURS.legend[500],
    fontWeight: '600',
  },
  carteSessionIcone: {
    width: 48,
    height: 48,
    borderRadius: RAYONS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  carteSessionCorps: {
    flex: 1,
    gap: 3,
  },
  carteSessionLigne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  carteSessionTitre: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: COULEURS.night[700],
  },
  carteSessionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  carteSessionMetaTexte: {
    fontSize: 13,
    color: COULEURS.night[400],
  },
  carteSessionDroite: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  boutonSupprimerSession: {
    padding: 6,
    marginLeft: 4,
  },

  // Badge
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: RAYONS.full,
    flexShrink: 0,
  },
  badgeTexte: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },

  // Ligne membre
  ligneMembre: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ESPACEMENT.sm,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COULEURS.night[50],
  },
  membreAvatar: {
    width: 44,
    height: 44,
    borderRadius: RAYONS.full,
    backgroundColor: COULEURS.legend[100],
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
  },
  membreAvatarImage: { width: 44, height: 44, borderRadius: RAYONS.full },
  membreAvatarTexte: {
    fontSize: 15,
    fontWeight: '700',
    color: COULEURS.legend[500],
  },
  membreCorps: {
    flex: 1,
    gap: 2,
  },
  membreLigne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  membreNom: {
    fontSize: 15,
    fontWeight: '600',
    color: COULEURS.night[700],
  },
  membreStats: {
    fontSize: 13,
    color: COULEURS.night[400],
  },

  // Infos tab
  infoBloc: {
    marginBottom: ESPACEMENT.lg,
  },
  infoBlocTitre: {
    fontSize: 16,
    fontWeight: '700',
    color: COULEURS.night[700],
    marginBottom: ESPACEMENT.sm,
  },
  infoTexte: {
    fontSize: 15,
    color: COULEURS.night[500],
    lineHeight: 22,
  },
  codeBox: {
    backgroundColor: COULEURS.legend[50],
    borderRadius: RAYONS.lg,
    padding: ESPACEMENT.md,
    alignItems: 'center',
    gap: 6,
  },
  codeTexte: {
    fontSize: 32,
    fontWeight: '800',
    color: COULEURS.legend[500],
    letterSpacing: 6,
  },
  codeSousTitre: {
    fontSize: 13,
    color: COULEURS.night[400],
    textAlign: 'center',
  },
  boutonPartager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: ESPACEMENT.sm,
    paddingVertical: 12,
    borderRadius: RAYONS.full,
    borderWidth: 1.5,
    borderColor: COULEURS.legend[300],
    backgroundColor: COULEURS.legend[50],
  },
  boutonPartagerTexte: {
    fontSize: 14,
    fontWeight: '600',
    color: COULEURS.legend[600],
  },
  detailLigne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  detailTexte: {
    fontSize: 15,
    color: COULEURS.night[500],
  },
  boutonRejoindre: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: ESPACEMENT.xl,
    paddingVertical: 14,
    borderRadius: RAYONS.full,
    backgroundColor: COULEURS.legend[500],
  },
  boutonRejoindreTexte: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  boutonQuitter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: ESPACEMENT.xl,
    paddingVertical: 14,
    borderRadius: RAYONS.full,
    borderWidth: 1.5,
    borderColor: COULEURS.danger,
  },
  boutonQuitterTexte: {
    fontSize: 15,
    fontWeight: '600',
    color: COULEURS.danger,
  },

  // État vide
  etatVide: {
    alignItems: 'center',
    paddingVertical: ESPACEMENT['2xl'],
    gap: ESPACEMENT.sm,
  },
  etatVideTitre: {
    fontSize: 17,
    fontWeight: '700',
    color: COULEURS.night[600],
  },
  etatVideTexte: {
    fontSize: 14,
    color: COULEURS.night[400],
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 260,
  },

  sectionSessions: {
    marginTop: ESPACEMENT.md,
  },
  sectionSessionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: ESPACEMENT.sm,
  },
  sectionSessionsDot: {
    width: 8,
    height: 8,
    borderRadius: RAYONS.full,
  },
  sectionSessionsTitre: {
    fontSize: 13,
    fontWeight: '700',
    color: COULEURS.night[700],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionSessionsCount: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: RAYONS.full,
  },
  sectionSessionsCountTexte: {
    fontSize: 11,
    fontWeight: '700',
  },

  boutonCreerSession: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COULEURS.legend[500],
    borderRadius: RAYONS.full,
    paddingVertical: 14,
    marginBottom: ESPACEMENT.md,
    shadowColor: COULEURS.legend[500],
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  boutonCreerSessionTexte: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  boutonCoachIA: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COULEURS.night[600],
    borderRadius: RAYONS.full,
    paddingVertical: 14,
    marginBottom: ESPACEMENT.md,
  },
});
