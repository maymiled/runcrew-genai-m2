import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
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
import { useProfilStore } from '../../../src/stores/useProfilStore';
import { Profil as ProfilType } from '../../../src/types/profil';
import { Crew } from '../../../src/types/crew';
import { RoleMembre } from '../../../src/types/base';

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

// ─── ScrollPicker (même logique que creer.tsx) ───────────────────────────────

const ITEM_H = 44;

type PickerCol = { items: string[]; selectedIndex: number; onSelect: (i: number) => void; label?: string; separator?: string };

function ScrollPickerCol({ items, selectedIndex, onSelect }: PickerCol) {
  const ref = useRef<ScrollView>(null);
  const isMomentum = useRef(false);
  const [localSel, setLocalSel] = useState(selectedIndex);

  useEffect(() => {
    const t = setTimeout(() => { ref.current?.scrollTo({ y: selectedIndex * ITEM_H, animated: false }); }, 80);
    return () => clearTimeout(t);
  }, []);

  // Sélectionne sans scrollTo — snapToInterval gère le snap nativement
  function selectIndex(idx: number) {
    const c = Math.max(0, Math.min(idx, items.length - 1));
    setLocalSel(c);
    onSelect(c);
  }

  // Tap direct sur un item → scrollTo uniquement dans ce cas
  function handlePress(index: number) {
    setLocalSel(index);
    ref.current?.scrollTo({ y: index * ITEM_H, animated: true });
    onSelect(index);
  }

  function handleScroll(e: any) {
    const idx = Math.max(0, Math.min(Math.round(e.nativeEvent.contentOffset.y / ITEM_H), items.length - 1));
    setLocalSel(idx);
  }

  function handleScrollEndDrag(e: any) {
    if (!isMomentum.current) {
      selectIndex(Math.round(e.nativeEvent.contentOffset.y / ITEM_H));
    }
  }

  function handleMomentumScrollBegin() {
    isMomentum.current = true;
  }

  function handleMomentumScrollEnd(e: any) {
    isMomentum.current = false;
    selectIndex(Math.round(e.nativeEvent.contentOffset.y / ITEM_H));
  }

  return (
    <View style={{ width: 72, height: ITEM_H * 5 }}>
      <ScrollView ref={ref} style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: ITEM_H * 2 }}
        showsVerticalScrollIndicator={false} snapToInterval={ITEM_H} decelerationRate="fast"
        onScroll={handleScroll} scrollEventThrottle={16}
        onScrollEndDrag={handleScrollEndDrag}
        onMomentumScrollBegin={handleMomentumScrollBegin}
        onMomentumScrollEnd={handleMomentumScrollEnd}>
        {items.map((item, index) => (
          <TouchableOpacity key={index} style={[pickerStyles.item, index === localSel && pickerStyles.itemSelected]}
            onPress={() => handlePress(index)} activeOpacity={0.8}>
            <Text style={[pickerStyles.itemText, index === localSel && pickerStyles.itemTextSelected]}>{item}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View pointerEvents="none" style={pickerStyles.indicator} />
    </View>
  );
}

const pickerStyles = StyleSheet.create({
  item: { height: ITEM_H, width: 72, alignItems: 'center', justifyContent: 'center' },
  itemSelected: { backgroundColor: COULEURS.legend[50], borderRadius: 8 },
  itemText: { fontSize: 22, color: COULEURS.night[300], fontWeight: '500' },
  itemTextSelected: { color: COULEURS.night[700], fontWeight: '700' },
  indicator: {
    position: 'absolute', top: ITEM_H * 2, left: 4, right: 4, height: ITEM_H,
    borderTopWidth: 1.5, borderBottomWidth: 1.5, borderColor: COULEURS.legend[300], borderRadius: 8,
  },
});

type PickerColDef = { items: string[]; selectedIndex: number; onSelect: (i: number) => void; separator?: string; label?: string };
const SEP_W = 36;

function PickerModal({ visible, titre, colonnes, onFermer }: { visible: boolean; titre: string; colonnes: PickerColDef[]; onFermer: () => void }) {
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

const ALLURE_MIN_ITEMS = Array.from({ length: 12 }, (_, i) => String(i + 2)); // 2–13 min/km
const ALLURE_SEC_ITEMS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

// ─── Types ────────────────────────────────────────────────────────────────────

type MembreAvecCrew = { crew_id: string; role: RoleMembre; crews: Crew };
type ActivePicker = 'basse' | 'haute' | null;

// ─── Composant principal ─────────────────────────────────────────────────────

export default function Profil() {
  const session = useAuthStore((s) => s.session);
  const seDeconnecter = useAuthStore((s) => s.seDeconnecter);
  const mettreAJourStore = useProfilStore((s) => s.mettreAJour);
  const nomDuStore = useProfilStore((s) => s.profil?.nom_affichage);

  const [profil, setProfil] = useState<ProfilType | null>(null);
  const [mesCrews, setMesCrews] = useState<MembreAvecCrew[]>([]);
  const [nbRunsValides, setNbRunsValides] = useState(0);
  const [totalKmValides, setTotalKmValides] = useState(0);
  const [chargement, setChargement] = useState(true);
  const [modeEdition, setModeEdition] = useState(false);
  const [sauvegarde, setSauvegarde] = useState(false);
  const [erreurSauvegarde, setErreurSauvegarde] = useState<string | null>(null);
  const [activePicker, setActivePicker] = useState<ActivePicker>(null);
  const [uploadPhoto, setUploadPhoto] = useState(false);

  // Champs texte
  const [nomAffichage, setNomAffichage] = useState('');
  const [ville, setVille] = useState('');
  const [bio, setBio] = useState('');

  // Allure via picker (en secondes décomposées)
  const [allureBasseMin, setAllureBasseMin] = useState(5);
  const [allureBasseSec, setAllureBasseSec] = useState(0);
  const [allureHauteMin, setAllureHauteMin] = useState(5);
  const [allureHauteSec, setAllureHauteSec] = useState(30);

  useFocusEffect(
    useCallback(() => {
      if (!session?.user?.id) return;
      chargerProfil();
    }, [session?.user?.id])
  );

  async function chargerProfil() {
    setChargement(true);
    const userId = session!.user.id;
    const [{ data: profilData }, { data: crewsData }, { data: runsData }] = await Promise.all([
      supabase.from('profils').select('*').eq('id', userId).single(),
      supabase.from('membres').select('crew_id, role, crews(*)').eq('utilisateur_id', userId),
      supabase
        .from('confirmations')
        .select('session_id, sessions!inner(validee, distance_km)')
        .eq('utilisateur_id', userId)
        .eq('statut', 'present')
        .eq('sessions.validee', true),
    ]);

    setNbRunsValides(runsData?.length ?? 0);
    setTotalKmValides(Math.round((runsData ?? []).reduce((acc: number, r: any) => acc + (r.sessions?.distance_km ?? 0), 0)));
    if (profilData) {
      const p = profilData as ProfilType;
      setProfil(p);
      setNomAffichage(p.nom_affichage ?? '');
      setVille(p.ville ?? '');
      setBio(p.bio ?? '');
      const allure = parseNumrange(p.allure_footing);
      if (allure) {
        setAllureBasseMin(Math.floor(allure[0] / 60));
        setAllureBasseSec(Math.round(allure[0] % 60));
        setAllureHauteMin(Math.floor(allure[1] / 60));
        setAllureHauteSec(Math.round(allure[1] % 60));
      }
    }
    if (crewsData) setMesCrews(crewsData as unknown as MembreAvecCrew[]);
    setChargement(false);
  }

  async function choisirPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;
    const userId = session!.user.id;
    setUploadPhoto(true);
    setErreurSauvegarde(null);
    try {
      const uri = result.assets[0].uri;
      const response = await fetch(uri);
      const blob = await response.blob();
      const path = `${userId}.jpg`;
      const { error: errUpload } = await supabase.storage
        .from('Avatars')
        .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
      if (errUpload) throw errUpload;
      const { data: { publicUrl } } = supabase.storage.from('Avatars').getPublicUrl(path);
      const urlAvecBust = `${publicUrl}?v=${Date.now()}`;
      const { error: errProfil } = await supabase.from('profils').update({ photo_url: urlAvecBust }).eq('id', userId);
      if (errProfil) throw errProfil;
      await chargerProfil();
    } catch (e: any) {
      setErreurSauvegarde(e?.message ?? 'Erreur lors de l\'upload');
    } finally {
      setUploadPhoto(false);
    }
  }

  async function sauvegarder() {
    if (!session?.user?.id || !profil) return;
    setSauvegarde(true);
    const basse = allureBasseMin * 60 + allureBasseSec;
    const haute = allureHauteMin * 60 + allureHauteSec;
    const miseAJour: Partial<ProfilType> & { allure_footing?: string | null } = {
      nom_affichage: nomAffichage.trim() || profil.nom_affichage,
      ville: ville.trim() || null,
      bio: bio.trim() || null,
      allure_footing: basse > 0 && haute > 0 && basse <= haute ? `[${basse},${haute})` : null,
    };
    const { error } = await supabase.from('profils').update(miseAJour).eq('id', session.user.id);
    if (error) {
      setErreurSauvegarde(error.message);
    } else {
      setErreurSauvegarde(null);
      mettreAJourStore(miseAJour as Partial<ProfilType>);
      await chargerProfil();
      setModeEdition(false);
    }
    setSauvegarde(false);
  }

  function confirmerDeconnexion() {
    if (Platform.OS === 'web') {
      if (window.confirm('Se déconnecter ?')) seDeconnecter();
    } else {
      Alert.alert('Déconnexion', 'Es-tu sûr de vouloir te déconnecter ?', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Se déconnecter', style: 'destructive', onPress: seDeconnecter },
      ]);
    }
  }

  if (chargement) {
    return <View style={styles.centrage}><ActivityIndicator color={COULEURS.legend[500]} size="large" /></View>;
  }
  if (!profil) {
    return <View style={styles.centrage}><Text style={styles.texteErreur}>Profil introuvable</Text></View>;
  }

  const allure = parseNumrange(profil.allure_footing);
  const nomAffichageActuel = nomDuStore ?? profil.nom_affichage;
  const nbRuns = nbRunsValides;
  const nbCrews = mesCrews.length;
  const estCapitaine = mesCrews.some((m) => m.role === 'capitaine');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Picker modal allure */}
      {activePicker && (
        <PickerModal
          visible
          titre={activePicker === 'basse' ? 'Allure basse' : 'Allure haute'}
          onFermer={() => setActivePicker(null)}
          colonnes={[
            {
              items: ALLURE_MIN_ITEMS,
              selectedIndex: (activePicker === 'basse' ? allureBasseMin : allureHauteMin) - 2,
              onSelect: v => activePicker === 'basse' ? setAllureBasseMin(v + 2) : setAllureHauteMin(v + 2),
              separator: ':',
            },
            {
              items: ALLURE_SEC_ITEMS,
              selectedIndex: activePicker === 'basse' ? allureBasseSec : allureHauteSec,
              onSelect: v => activePicker === 'basse' ? setAllureBasseSec(v) : setAllureHauteSec(v),
              label: 'min/km',
            },
          ]}
        />
      )}

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>RunCrew</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {!modeEdition && (
            <TouchableOpacity
              style={styles.boutonParametres}
              onPress={() => router.push('/parametres' as any)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="settings-outline" size={22} color={COULEURS.night[500]} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.boutonEditer, modeEdition && styles.boutonSauvegarder]}
            onPress={() => modeEdition ? sauvegarder() : setModeEdition(true)}
            disabled={sauvegarde}
          >
            {sauvegarde
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={[styles.boutonEditerTexte, modeEdition && styles.boutonSauvegarderTexte]}>
                  {modeEdition ? 'Sauvegarder' : 'Modifier'}
                </Text>
            }
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.contenu}>

        {/* ── Hero ── */}
        <View style={styles.hero}>
          <View style={styles.heroFond} />
          <View style={styles.avatarWrapper}>
            <TouchableOpacity
              style={styles.avatar}
              onPress={choisirPhoto}
              activeOpacity={0.7}
              disabled={uploadPhoto}
            >
              {uploadPhoto ? (
                <ActivityIndicator color={COULEURS.legend[500]} />
              ) : profil.photo_url ? (
                <Image
                  source={{ uri: profil.photo_url }}
                  style={styles.avatarImage}
                  contentFit="cover"
                />
              ) : (
                <Text style={styles.avatarTexte}>{initialesNom(nomAffichageActuel)}</Text>
              )}
              {!uploadPhoto && (
                <View style={styles.avatarEditOverlay}>
                  <Ionicons name="camera" size={20} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
            <View style={styles.badgeVerifie}>
              <Ionicons name="shield-checkmark" size={12} color="#fff" />
            </View>
          </View>
        </View>

        {/* ── Identité ── */}
        <View style={styles.identite}>
          {modeEdition ? (
            <TextInput style={styles.champNom} value={nomAffichage} onChangeText={setNomAffichage}
              placeholder="Ton prénom ou pseudo" placeholderTextColor={COULEURS.night[300]}
              autoCapitalize="words" textAlign="center" />
          ) : (
            <Text style={styles.nom}>{nomAffichageActuel}</Text>
          )}

          {modeEdition ? (
            <TextInput style={styles.champVille} value={ville} onChangeText={setVille}
              placeholder="Ta ville" placeholderTextColor={COULEURS.night[300]}
              autoCapitalize="words" textAlign="center" />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={styles.username}>@{profil.nom_utilisateur}{profil.ville ? ` · ${profil.ville}` : ''}</Text>
              {profil.plan === 'pro' && (
                <View style={styles.badgePro}>
                  <Text style={styles.badgeProTexte}>PRO</Text>
                </View>
              )}
            </View>
          )}

          {modeEdition ? (
            <TextInput style={styles.champBio} value={bio} onChangeText={setBio}
              placeholder="Ta bio de coureur..." placeholderTextColor={COULEURS.night[300]}
              multiline numberOfLines={2} textAlignVertical="top" textAlign="center" />
          ) : profil.bio ? (
            <Text style={styles.bio}>{profil.bio}</Text>
          ) : null}
        </View>

        {/* ── Stats ── */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValeur}>{nbRuns}</Text>
            <Text style={styles.statLabel}>{nbRuns <= 1 ? 'Run' : 'Runs'}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValeur}>{totalKmValides}</Text>
            <Text style={styles.statLabel}>Total km</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValeur}>{nbCrews}</Text>
            <Text style={styles.statLabel}>{nbCrews <= 1 ? 'Crew' : 'Crews'}</Text>
          </View>
        </View>

        {/* ── Allure footing ── */}
        <View style={styles.allureBloc}>
          <View style={styles.allureBlocHeader}>
            <View style={styles.allureBlocTitre}>
              <View style={styles.allureIconeBg}>
                <Ionicons name="speedometer-outline" size={16} color={COULEURS.legend[500]} />
              </View>
              <Text style={styles.allureTitre}>Allure footing</Text>
            </View>
            {!modeEdition && allure && (
              <Text style={styles.allureUnite}>min/km</Text>
            )}
          </View>

          {modeEdition ? (
            <View style={styles.allureEdition}>
              <View style={styles.allureEditionCote}>
                <Text style={styles.allureEditionLabel}>BASSE</Text>
                <TouchableOpacity style={styles.allurePickerBtn} onPress={() => setActivePicker('basse')} activeOpacity={0.75}>
                  <Text style={styles.allurePickerVal}>{allureBasseMin}:{String(allureBasseSec).padStart(2,'0')}</Text>
                  <Ionicons name="chevron-down" size={14} color={COULEURS.legend[500]} />
                </TouchableOpacity>
              </View>
              <View style={styles.allureEditionFleche}>
                <Text style={styles.allureFlèche}>→</Text>
              </View>
              <View style={styles.allureEditionCote}>
                <Text style={styles.allureEditionLabel}>HAUTE</Text>
                <TouchableOpacity style={styles.allurePickerBtn} onPress={() => setActivePicker('haute')} activeOpacity={0.75}>
                  <Text style={styles.allurePickerVal}>{allureHauteMin}:{String(allureHauteSec).padStart(2,'0')}</Text>
                  <Ionicons name="chevron-down" size={14} color={COULEURS.legend[500]} />
                </TouchableOpacity>
              </View>
            </View>
          ) : allure ? (
            <View style={styles.allureAffichage}>
              <View style={styles.allurePill}>
                <Text style={styles.allurePillTexte}>{secondesVersAllure(allure[0])}</Text>
              </View>
              <View style={styles.allurePillFleche}>
                <Text style={styles.allurePillFlecheTxt}>→</Text>
              </View>
              <View style={styles.allurePill}>
                <Text style={styles.allurePillTexte}>{secondesVersAllure(allure[1])}</Text>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.allureVide} onPress={() => setModeEdition(true)}>
              <Ionicons name="add-circle-outline" size={16} color={COULEURS.legend[400]} />
              <Text style={styles.allureVideTexte}>Ajouter mon allure</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Mes crews ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitre}>Mes crews</Text>

          {mesCrews.map((m) => (
            <TouchableOpacity key={m.crew_id} style={[styles.crewLigne, m.role === 'capitaine' && styles.crewLigneCapitaine]}
              onPress={() => router.push(`/crew/${m.crew_id}`)} activeOpacity={0.8}>
              <View style={[styles.crewAvatar, m.role === 'capitaine' && !m.crews.photo_url && styles.crewAvatarCapitaine]}>
                {m.crews.photo_url ? (
                  <Image
                    source={{ uri: m.crews.photo_url }}
                    style={{ width: 48, height: 48, borderRadius: RAYONS.md, position: 'absolute' }}
                    contentFit="cover"
                  />
                ) : (
                  <Text style={[styles.crewAvatarTexte, m.role === 'capitaine' && styles.crewAvatarTexteCapitaine]}>
                    {initialesNom(m.crews.nom)}
                  </Text>
                )}
              </View>
              <View style={styles.crewInfo}>
                <View style={styles.crewNomRow}>
                  <Text style={styles.crewNom}>{m.crews.nom}</Text>
                  {m.role === 'capitaine' && (
                    <View style={styles.crewCapitaineBadge}>
                      <Text style={styles.crewCapitaineBadgeTexte}>Capitaine</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.crewMeta}>{m.crews.ville} · {m.crews.nombre_membres} membre{m.crews.nombre_membres > 1 ? 's' : ''}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COULEURS.night[300]} />
            </TouchableOpacity>
          ))}

          <View style={styles.crewActionsLigne}>
            {!estCapitaine && (
              <TouchableOpacity style={styles.crewActionBtn} onPress={() => router.push('/crew/creer')} activeOpacity={0.8}>
                <Ionicons name="add-circle-outline" size={18} color={COULEURS.legend[500]} />
                <Text style={styles.crewActionTexte}>Créer un crew</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.crewActionBtn, styles.crewActionBtnSecondaire]} onPress={() => router.push('/crew/rejoindre')} activeOpacity={0.8}>
              <Ionicons name="enter-outline" size={18} color={COULEURS.night[500]} />
              <Text style={[styles.crewActionTexte, styles.crewActionTexteSecondaire]}>Rejoindre avec un code</Text>
            </TouchableOpacity>
          </View>
        </View>

        {erreurSauvegarde && (
          <View style={styles.erreurBox}>
            <Ionicons name="alert-circle-outline" size={16} color={COULEURS.danger} />
            <Text style={styles.erreurTexte}>{erreurSauvegarde}</Text>
          </View>
        )}

        {modeEdition && (
          <TouchableOpacity style={styles.boutonAnnuler} onPress={() => { setModeEdition(false); setErreurSauvegarde(null); }}>
            <Text style={styles.boutonAnnulerTexte}>Annuler</Text>
          </TouchableOpacity>
        )}

        {!modeEdition && (
          <TouchableOpacity style={styles.boutonDeconnexion} onPress={confirmerDeconnexion}>
            <Ionicons name="log-out-outline" size={18} color={COULEURS.danger} />
            <Text style={styles.boutonDeconnexionTexte}>Déconnexion</Text>
          </TouchableOpacity>
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

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: ESPACEMENT.md, paddingVertical: ESPACEMENT.sm,
    borderBottomWidth: 1, borderBottomColor: COULEURS.night[100],
  },
  logo: { fontSize: 24, fontWeight: '800', color: COULEURS.legend[500] },
  boutonParametres: {
    width: 36, height: 36, borderRadius: RAYONS.full,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: COULEURS.night[50],
  },
  boutonEditer: {
    paddingHorizontal: 16, paddingVertical: 7, borderRadius: RAYONS.full,
    borderWidth: 1.5, borderColor: COULEURS.legend[300],
  },
  boutonSauvegarder: {
    backgroundColor: COULEURS.legend[500], borderColor: COULEURS.legend[500],
  },
  boutonEditerTexte: { fontSize: 14, fontWeight: '600', color: COULEURS.legend[500] },
  boutonSauvegarderTexte: { color: '#fff' },

  contenu: { paddingBottom: 48 },

  // Hero
  hero: { alignItems: 'center', marginBottom: 0 },
  heroFond: {
    width: '100%', height: 120,
    backgroundColor: COULEURS.legend[500],
  },
  avatarWrapper: {
    position: 'relative',
    marginTop: -52,
  },
  avatar: {
    width: 104, height: 104, borderRadius: 52,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 4, borderColor: '#fff',
    shadowColor: COULEURS.legend[500],
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25, shadowRadius: 16, elevation: 8,
  },
  avatarTexte: { fontSize: 34, fontWeight: '800', color: COULEURS.legend[500] },
  avatarImage: { width: 104, height: 104, borderRadius: 52 },
  avatarEditOverlay: {
    position: 'absolute', inset: 0, borderRadius: 52,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  badgeVerifie: {
    position: 'absolute', bottom: 4, right: 4,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: COULEURS.legend[500],
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: '#fff',
  },

  // Identité
  identite: { alignItems: 'center', paddingTop: ESPACEMENT.md, paddingHorizontal: ESPACEMENT.md, gap: 4 },
  nom: { fontSize: 28, fontWeight: '800', color: COULEURS.night[700], letterSpacing: -0.5 },
  username: { fontSize: 14, fontWeight: '500', color: COULEURS.legend[500] },
  bio: { fontSize: 14, color: COULEURS.night[400], textAlign: 'center', lineHeight: 20, marginTop: 2 },
  champNom: {
    fontSize: 26, fontWeight: '700', color: COULEURS.night[700],
    borderBottomWidth: 1.5, borderBottomColor: COULEURS.legend[300],
    paddingVertical: 4, minWidth: 200, textAlign: 'center',
  },
  champVille: {
    fontSize: 14, color: COULEURS.legend[500],
    borderBottomWidth: 1, borderBottomColor: COULEURS.night[200],
    paddingVertical: 4, minWidth: 150, textAlign: 'center',
  },
  champBio: {
    fontSize: 14, color: COULEURS.night[500],
    borderWidth: 1, borderColor: COULEURS.night[200],
    borderRadius: RAYONS.md, padding: 8, width: '100%', marginTop: 4, textAlign: 'center',
  },

  // Stats
  statsRow: {
    flexDirection: 'row', gap: ESPACEMENT.sm,
    marginHorizontal: ESPACEMENT.md, marginTop: ESPACEMENT.lg,
  },
  statCard: {
    flex: 1, alignItems: 'center', paddingVertical: ESPACEMENT.md,
    backgroundColor: COULEURS.night[50], borderRadius: RAYONS.xl,
  },
  statValeur: { fontSize: 24, fontWeight: '800', color: COULEURS.legend[500] },
  statLabel: { fontSize: 11, fontWeight: '600', color: COULEURS.night[400], marginTop: 2, letterSpacing: 0.3 },

  // Allure footing
  allureBloc: {
    marginHorizontal: ESPACEMENT.md, marginTop: ESPACEMENT.lg,
    backgroundColor: COULEURS.legend[50], borderRadius: RAYONS.xl,
    padding: ESPACEMENT.md, borderWidth: 1, borderColor: COULEURS.legend[100],
  },
  allureBlocHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: ESPACEMENT.md,
  },
  allureBlocTitre: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  allureIconeBg: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: COULEURS.legend[100], alignItems: 'center', justifyContent: 'center',
  },
  allureTitre: { fontSize: 16, fontWeight: '700', color: COULEURS.night[700] },
  allureUnite: { fontSize: 12, fontWeight: '600', color: COULEURS.night[400] },

  // Affichage pills (mode lecture)
  allureAffichage: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  allurePill: {
    flex: 1, backgroundColor: '#fff', borderRadius: RAYONS.lg,
    paddingVertical: 10, alignItems: 'center',
    borderWidth: 1.5, borderColor: COULEURS.legend[200],
  },
  allurePillTexte: { fontSize: 20, fontWeight: '800', color: COULEURS.legend[500] },
  allurePillFleche: { alignItems: 'center' },
  allurePillFlecheTxt: { fontSize: 20, color: COULEURS.night[400], fontWeight: '600' },

  // Édition picker
  allureEdition: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  allureEditionCote: { flex: 1, gap: 6 },
  allureEditionLabel: { fontSize: 10, fontWeight: '700', color: COULEURS.legend[400], letterSpacing: 0.8, textAlign: 'center' },
  allurePickerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    backgroundColor: '#fff', borderRadius: RAYONS.lg,
    paddingVertical: 10, borderWidth: 1.5, borderColor: COULEURS.legend[200],
  },
  allurePickerVal: { fontSize: 20, fontWeight: '800', color: COULEURS.legend[500] },
  allureEditionFleche: { alignItems: 'center', paddingTop: 20 },
  allureFlèche: { fontSize: 20, color: COULEURS.night[400], fontWeight: '600' },

  // Vide
  allureVide: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10,
  },
  allureVideTexte: { fontSize: 14, fontWeight: '600', color: COULEURS.legend[400] },

  // Mes crews
  section: { marginHorizontal: ESPACEMENT.md, marginTop: ESPACEMENT.lg },
  sectionTitre: { fontSize: 18, fontWeight: '700', color: COULEURS.night[700], marginBottom: ESPACEMENT.sm },
  crewActionsLigne: { flexDirection: 'row', gap: ESPACEMENT.sm, marginTop: ESPACEMENT.sm },
  crewActionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: RAYONS.lg,
    backgroundColor: COULEURS.legend[50], borderWidth: 1, borderColor: COULEURS.legend[100],
  },
  crewActionBtnSecondaire: { backgroundColor: COULEURS.night[50], borderColor: COULEURS.night[100] },
  crewActionTexte: { fontSize: 13, fontWeight: '600', color: COULEURS.legend[500] },
  crewActionTexteSecondaire: { color: COULEURS.night[500] },
  crewLigne: {
    flexDirection: 'row', alignItems: 'center', gap: ESPACEMENT.sm,
    padding: ESPACEMENT.sm, backgroundColor: '#fff',
    borderRadius: RAYONS.lg, marginBottom: ESPACEMENT.sm,
    borderWidth: 1, borderColor: COULEURS.night[100],
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  crewLigneCapitaine: { borderLeftWidth: 3, borderLeftColor: COULEURS.legend[500] },
  crewAvatar: {
    width: 48, height: 48, borderRadius: RAYONS.md,
    backgroundColor: COULEURS.legend[100], alignItems: 'center', justifyContent: 'center',
  },
  crewAvatarCapitaine: { backgroundColor: COULEURS.legend[500] },
  crewAvatarTexte: { fontSize: 16, fontWeight: '700', color: COULEURS.legend[500] },
  crewAvatarTexteCapitaine: { color: '#fff' },
  crewInfo: { flex: 1 },
  crewNomRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  crewNom: { fontSize: 15, fontWeight: '600', color: COULEURS.night[700] },
  crewCapitaineBadge: { backgroundColor: COULEURS.legend[100], borderRadius: RAYONS.full, paddingHorizontal: 7, paddingVertical: 2 },
  crewCapitaineBadgeTexte: { fontSize: 10, fontWeight: '700', color: COULEURS.legend[600] },
  crewMeta: { fontSize: 12, color: COULEURS.night[400], marginTop: 2 },

  erreurBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FFF0F0', borderRadius: RAYONS.md,
    padding: ESPACEMENT.sm, marginHorizontal: ESPACEMENT.md, marginTop: ESPACEMENT.sm,
  },
  erreurTexte: { flex: 1, fontSize: 13, color: COULEURS.danger },

  boutonAnnuler: {
    marginHorizontal: ESPACEMENT.md, marginTop: ESPACEMENT.md,
    paddingVertical: 12, borderRadius: RAYONS.full,
    borderWidth: 1, borderColor: COULEURS.night[200], alignItems: 'center',
  },
  boutonAnnulerTexte: { fontSize: 15, fontWeight: '600', color: COULEURS.night[500] },

  boutonDeconnexion: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: ESPACEMENT.md, marginTop: ESPACEMENT.xl,
    paddingVertical: 14, borderRadius: RAYONS.lg,
    borderWidth: 1, borderColor: COULEURS.danger + '40',
  },
  boutonDeconnexionTexte: { fontSize: 15, fontWeight: '600', color: COULEURS.danger },
  badgePro: {
    backgroundColor: '#F59E0B',
    borderRadius: RAYONS.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeProTexte: { fontSize: 10, fontWeight: '800', color: '#fff' },
});
