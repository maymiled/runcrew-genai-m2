import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
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
import { useSessionStore } from '../../../src/stores/useSessionStore';
import { TypeEntrainement } from '../../../src/types/base';

// ─── Types workout builder ────────────────────────────────────────────────────

type TypeEtapeWk = 'echauffement' | 'actif' | 'recuperation' | 'retour_calme' | 'autre';

type EtapeWk = {
  cle: string;
  kind: 'etape';
  typeEtape: TypeEtapeWk;
  labelAutre: string; // utilisé uniquement quand typeEtape === 'autre'
  dureeType: 'temps' | 'distance';
  dureeMin: number;
  dureeSec: number;
  dureeDistanceM: number; // en mètres (100, 200, 400, ...);
  allureActive: boolean;
  allureBasseMin: number;
  allureBasseSec: number;
  allureHauteMin: number;
  allureHauteSec: number;
};

type BoucleWk = {
  cle: string;
  kind: 'boucle';
  repetitions: number;
  etapes: EtapeWk[];
};

type BlocWk = EtapeWk | BoucleWk;

// ─── Types déroulé simple ────────────────────────────────────────────────────

type EtapeForm = { cle: string; titre: string; dureeMin: number; dureeSec: number; description: string };
type GroupeForm = {
  cle: string; nom: string;
  allureBasseMin: number; allureBasseSec: number;
  allureHauteMin: number; allureHauteSec: number;
  consignes: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cle(): string { return Math.random().toString(36).substring(2, 9); }

function formaterDate(j: number, m: number, a: number): string {
  return `${String(j).padStart(2,'0')}/${String(m).padStart(2,'0')}/${a}`;
}

function formaterHeure(h: number, min: number): string {
  return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
}

function formaterTemps(min: number, sec: number): string {
  return `${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function formaterAllure(min: number, sec: number): string {
  return `${min}:${String(sec).padStart(2,'0')}`;
}

function joursDuMois(annee: number, mois: number): (Date | null)[] {
  const premier = new Date(annee, mois, 1);
  const dernier = new Date(annee, mois + 1, 0);
  const decalage = (premier.getDay() + 6) % 7;
  const jours: (Date | null)[] = Array(decalage).fill(null);
  for (let i = 1; i <= dernier.getDate(); i++) jours.push(new Date(annee, mois, i));
  return jours;
}

// Auto-calculate distance from workout blocs
function calculerDistanceTotale(blocs: BlocWk[]): number | null {
  let total = 0;
  let hasData = false;

  function etapeDistance(e: EtapeWk): number {
    if (e.dureeType === 'distance') {
      hasData = true;
      return (e.dureeDistanceM ?? 0) / 1000;
    }
    // time step with pace → distance = time_min / pace_min_per_km
    const pace = e.allureActive ? e.allureBasseMin + e.allureBasseSec / 60 : 0;
    if (pace > 0) {
      hasData = true;
      const dMin = e.dureeMin + e.dureeSec / 60;
      return dMin / pace;
    }
    return 0;
  }

  for (const bloc of blocs) {
    if (bloc.kind === 'etape') {
      total += etapeDistance(bloc);
    } else {
      let boucleTotal = 0;
      for (const e of bloc.etapes) boucleTotal += etapeDistance(e);
      total += boucleTotal * bloc.repetitions;
    }
  }

  return hasData ? Math.round(total * 10) / 10 : null;
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const MOIS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const JOURS_SEM = ['Lu','Ma','Me','Je','Ve','Sa','Di'];

const TYPES: { valeur: TypeEntrainement; label: string; groupe: 'workout' | 'simple' }[] = [
  { valeur: 'fractionne', label: 'Fractionné', groupe: 'workout' },
  { valeur: 'seuil',      label: 'Seuil',      groupe: 'workout' },
  { valeur: 'tempo',      label: 'Tempo',       groupe: 'workout' },
  { valeur: 'footing',    label: 'Footing',     groupe: 'simple' },
  { valeur: 'sortie_longue', label: 'Sortie longue', groupe: 'simple' },
  { valeur: 'libre',      label: 'Libre',       groupe: 'simple' },
];

const TYPES_WK = new Set<TypeEntrainement>(['fractionne', 'seuil', 'tempo']);

const ETAPE_META: Record<TypeEtapeWk, { label: string; couleur: string; icone: string }> = {
  echauffement: { label: 'Échauffement', couleur: '#F59E0B', icone: 'flame-outline' },
  actif:        { label: 'Actif',        couleur: COULEURS.danger, icone: 'flash' },
  recuperation: { label: 'Récupération', couleur: '#10B981', icone: 'leaf-outline' },
  retour_calme: { label: 'Retour calme', couleur: COULEURS.legend[400], icone: 'moon-outline' },
  autre:        { label: 'Autre',        couleur: COULEURS.night[400], icone: 'ellipsis-horizontal' },
};

const TYPES_ETAPE: TypeEtapeWk[] = ['echauffement', 'actif', 'recuperation', 'retour_calme', 'autre'];

const ITEM_H = 44;

function nouvelleEtapeWk(type: TypeEtapeWk = 'actif'): EtapeWk {
  return {
    cle: cle(), kind: 'etape', typeEtape: type, labelAutre: '',
    dureeType: 'temps', dureeMin: 5, dureeSec: 0, dureeDistanceM: 0,
    allureActive: false, allureBasseMin: 4, allureBasseSec: 30,
    allureHauteMin: 5, allureHauteSec: 0,
  };
}

function nouvelleBoucle(): BoucleWk {
  return {
    cle: cle(), kind: 'boucle', repetitions: 4,
    etapes: [
      { ...nouvelleEtapeWk('actif'),       dureeMin: 3, dureeSec: 0 },
      { ...nouvelleEtapeWk('recuperation'), dureeMin: 2, dureeSec: 0 },
    ],
  };
}

// ─── ScrollPicker ─────────────────────────────────────────────────────────────

type PickerCol = { items: string[]; selectedIndex: number; onSelect: (i: number) => void; label?: string };

function ScrollPickerCol({ items, selectedIndex, onSelect }: PickerCol) {
  const ref = useRef<ScrollView>(null);
  const isMomentum = useRef(false);
  const [localSel, setLocalSel] = useState(selectedIndex);

  useEffect(() => {
    const t = setTimeout(() => {
      ref.current?.scrollTo({ y: selectedIndex * ITEM_H, animated: false });
    }, 80);
    return () => clearTimeout(t);
  }, []);

  // Sélectionne sans scrollTo — snapToInterval gère le snap nativement
  function selectIndex(idx: number) {
    const c = Math.max(0, Math.min(idx, items.length - 1));
    setLocalSel(c);
    onSelect(c);
  }

  // Tap direct → scrollTo uniquement dans ce cas
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
            style={[pickerStyles.item, index === localSel && pickerStyles.itemSelected]}
            onPress={() => handlePress(index)}
            activeOpacity={0.8}
          >
            <Text style={[pickerStyles.itemText, index === localSel && pickerStyles.itemTextSelected]}>
              {item}
            </Text>
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
    position: 'absolute',
    top: ITEM_H * 2, left: 4, right: 4, height: ITEM_H,
    borderTopWidth: 1.5, borderBottomWidth: 1.5,
    borderColor: COULEURS.legend[300], borderRadius: 8,
    pointerEvents: 'none',
  },
});

// ─── PickerModal générique ────────────────────────────────────────────────────

type PickerColDef = {
  items: string[];
  selectedIndex: number;
  onSelect: (i: number) => void;
  separator?: string;
  label?: string;
};

// Largeur fixe des séparateurs (":","h"...) — identique dans la ligne labels ET scrollers
const SEP_W = 36;

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

          {/* Ligne labels — hauteur fixe, alignée pixel par pixel avec la ligne scrollers */}
          <View style={pStyles.pickersRow}>
            {colonnes.map((col, i) => (
              <View key={i} style={pStyles.colSlot}>
                <Text style={pStyles.colLabel}>{col.label ?? ''}</Text>
                {col.separator && <View style={{ width: SEP_W }} />}
              </View>
            ))}
          </View>

          {/* Ligne scrollers — tous partent au même y, alignement garanti */}
          <View style={pStyles.pickersRow}>
            {colonnes.map((col, i) => (
              <View key={i} style={pStyles.colSlot}>
                <ScrollPickerCol
                  items={col.items}
                  selectedIndex={col.selectedIndex}
                  onSelect={col.onSelect}
                />
                {col.separator && (
                  <Text style={pStyles.separator}>{col.separator}</Text>
                )}
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

// ─── CalendrierModal ──────────────────────────────────────────────────────────

function CalendrierModal({ visible, dateSelectionnee, onSelect, onFermer }: {
  visible: boolean;
  dateSelectionnee: { j: number; m: number; a: number } | null;
  onSelect: (j: number, m: number, a: number) => void;
  onFermer: () => void;
}) {
  const auj = new Date();
  const [moisAff, setMoisAff] = useState(() => {
    if (dateSelectionnee) return new Date(dateSelectionnee.a, dateSelectionnee.m - 1, 1);
    return new Date(auj.getFullYear(), auj.getMonth(), 1);
  });

  const annee = moisAff.getFullYear();
  const mois = moisAff.getMonth();
  const jours = joursDuMois(annee, mois);

  function prevMois() { setMoisAff(new Date(annee, mois - 1, 1)); }
  function nextMois() { setMoisAff(new Date(annee, mois + 1, 1)); }

  function estSelectionne(d: Date) {
    if (!dateSelectionnee) return false;
    return d.getDate() === dateSelectionnee.j && d.getMonth() + 1 === dateSelectionnee.m && d.getFullYear() === dateSelectionnee.a;
  }

  function estAujourdhui(d: Date) {
    return d.toDateString() === auj.toDateString();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onFermer}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onFermer}>
        <TouchableOpacity activeOpacity={1} style={styles.calModal}>
          <View style={styles.calHeader}>
            <TouchableOpacity onPress={prevMois} style={styles.calNavBtn}>
              <Ionicons name="chevron-back" size={20} color={COULEURS.night[600]} />
            </TouchableOpacity>
            <Text style={styles.calMoisTexte}>{MOIS_FR[mois]} {annee}</Text>
            <TouchableOpacity onPress={nextMois} style={styles.calNavBtn}>
              <Ionicons name="chevron-forward" size={20} color={COULEURS.night[600]} />
            </TouchableOpacity>
          </View>

          <View style={styles.calSemaine}>
            {JOURS_SEM.map(j => (
              <Text key={j} style={styles.calJourSemTexte}>{j}</Text>
            ))}
          </View>

          <View style={styles.calGrille}>
            {jours.map((d, i) => {
              if (!d) return <View key={`vide-${i}`} style={styles.calCase} />;
              const sel = estSelectionne(d);
              const aujd = estAujourdhui(d);
              return (
                <TouchableOpacity
                  key={d.toISOString()}
                  style={[styles.calCase, sel && styles.calCaseSelectionnee, !sel && aujd && styles.calCaseAujourdhui]}
                  onPress={() => { onSelect(d.getDate(), d.getMonth() + 1, d.getFullYear()); onFermer(); }}
                >
                  <Text style={[styles.calJourTexte, sel && styles.calJourTexteSelectionnee, !sel && aujd && styles.calJourTexteAujourdhui]}>
                    {d.getDate()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── LigneEtape ──────────────────────────────────────────────────────────────

function LigneEtape({ etape, onTap, onSupprimer, inBoucle = false }: {
  etape: EtapeWk;
  onTap: () => void;
  onSupprimer: () => void;
  inBoucle?: boolean;
}) {
  const meta = ETAPE_META[etape.typeEtape];
  const nom = etape.typeEtape === 'autre' && etape.labelAutre.trim()
    ? etape.labelAutre.trim()
    : meta.label;
  const dm = etape.dureeDistanceM ?? 0;
  const dmKm = Math.floor(dm / 1000);
  const dmM = dm % 1000;
  const dureeLabel = etape.dureeType === 'temps'
    ? formaterTemps(etape.dureeMin, etape.dureeSec)
    : dmKm > 0 ? (dmM > 0 ? `${dmKm} km ${dmM} m` : `${dmKm} km`) : `${dmM} m`;
  const allureLabel = etape.allureActive
    ? `${formaterAllure(etape.allureBasseMin, etape.allureBasseSec)} – ${formaterAllure(etape.allureHauteMin, etape.allureHauteSec)} /km`
    : null;

  return (
    <TouchableOpacity
      style={[styles.ligneEtape, inBoucle && styles.ligneEtapeInBoucle, { borderLeftColor: meta.couleur }]}
      onPress={onTap}
      activeOpacity={0.75}
    >
      <View style={styles.ligneEtapeCorps}>
        <Text style={styles.ligneEtapeNom}>{nom}</Text>
        <Text style={styles.ligneEtapeSous}>
          {dureeLabel}{allureLabel ? `  ·  ${allureLabel}` : ''}
        </Text>
      </View>
      <View style={styles.ligneEtapeActions}>
        <Ionicons name="chevron-forward" size={15} color={COULEURS.night[300]} />
        <TouchableOpacity onPress={onSupprimer} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close-circle" size={20} color={COULEURS.night[300]} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

// ─── EtapeDetailModal ─────────────────────────────────────────────────────────

function EtapeDetailModal({ visible, etape, onFermer, onMaj, onSupprimer }: {
  visible: boolean;
  etape: EtapeWk | null;
  onFermer: () => void;
  onMaj: (champ: string, val: any) => void;
  onSupprimer: () => void;
}) {
  const [showTypeDD, setShowTypeDD] = useState(false);
  const [showDureeTypeDD, setShowDureeTypeDD] = useState(false);
  const [showAllureTypeDD, setShowAllureTypeDD] = useState(false);
  const [innerPicker, setInnerPicker] = useState<'duree' | 'allurebasse' | 'allurehaut' | null>(null);

  if (!etape) return null;
  const meta = ETAPE_META[etape.typeEtape];
  const dm = etape.dureeDistanceM ?? 0;
  const dmKm = Math.floor(dm / 1000);
  const dmM = dm % 1000;
  const dureeLabel = etape.dureeType === 'temps'
    ? formaterTemps(etape.dureeMin, etape.dureeSec)
    : dmKm > 0 ? (dmM > 0 ? `${dmKm} km ${dmM} m` : `${dmKm} km`) : `${dmM} m`;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onFermer}>
      {/* Pickers rendered inside this Modal so iOS presents them on top */}
      <PickerModal
        visible={innerPicker === 'duree'}
        titre={etape.dureeType === 'temps' ? 'Durée (temps)' : 'Distance'}
        onFermer={() => setInnerPicker(null)}
        colonnes={etape.dureeType === 'temps' ? [
          { items: ETAPE_MIN_ITEMS, selectedIndex: etape.dureeMin, onSelect: v => onMaj('dureeMin', v), separator: ':' },
          { items: ETAPE_SEC_ITEMS, selectedIndex: etape.dureeSec, onSelect: v => onMaj('dureeSec', v), label: 'sec' },
        ] : [
          {
            items: KM_ITEMS,
            selectedIndex: Math.floor((etape.dureeDistanceM ?? 0) / 1000),
            onSelect: v => onMaj('dureeDistanceM', v * 1000 + ((etape.dureeDistanceM ?? 0) % 1000)),
            label: 'km',
          },
          {
            items: ETAPE_M_ITEMS,
            selectedIndex: Math.round(((etape.dureeDistanceM ?? 0) % 1000) / 100),
            onSelect: v => onMaj('dureeDistanceM', Math.floor((etape.dureeDistanceM ?? 0) / 1000) * 1000 + v * 100),
            label: 'm',
          },
        ]}
      />
      <PickerModal
        visible={innerPicker === 'allurebasse' || innerPicker === 'allurehaut'}
        titre={innerPicker === 'allurebasse' ? 'Allure basse' : 'Allure haute'}
        onFermer={() => setInnerPicker(null)}
        colonnes={[
          {
            items: ALLURE_MIN_ITEMS,
            selectedIndex: (innerPicker === 'allurebasse' ? etape.allureBasseMin : etape.allureHauteMin) - 1,
            onSelect: v => onMaj(innerPicker === 'allurebasse' ? 'allureBasseMin' : 'allureHauteMin', v + 1),
            separator: ':',
          },
          {
            items: ALLURE_SEC_ITEMS,
            selectedIndex: innerPicker === 'allurebasse' ? etape.allureBasseSec : etape.allureHauteSec,
            onSelect: v => onMaj(innerPicker === 'allurebasse' ? 'allureBasseSec' : 'allureHauteSec', v),
            label: '/km',
          },
        ]}
      />
      <TouchableOpacity style={detStyles.overlay} activeOpacity={1} onPress={onFermer}>
        <TouchableOpacity activeOpacity={1} style={detStyles.sheet}>
          <View style={detStyles.handle} />

          {/* Header */}
          <View style={detStyles.sheetHeader}>
            <View style={[detStyles.headerDot, { backgroundColor: meta.couleur }]} />
            <Text style={detStyles.sheetTitre}>{meta.label}</Text>
            <TouchableOpacity onPress={() => { onSupprimer(); onFermer(); }} style={detStyles.supprimerBtn}>
              <Text style={detStyles.supprimerTexte}>Supprimer</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* ── TYPE D'ÉTAPE ── */}
            <Text style={detStyles.sectionHeader}>TYPE D'ÉTAPE</Text>
            <TouchableOpacity style={detStyles.ligne} onPress={() => { setShowTypeDD(!showTypeDD); setShowDureeTypeDD(false); setShowAllureTypeDD(false); }} activeOpacity={0.7}>
              <Text style={detStyles.ligneLabel}>Type</Text>
              <View style={detStyles.ligneValeurRow}>
                <View style={[detStyles.typeDot, { backgroundColor: meta.couleur }]} />
                <Text style={detStyles.ligneValeur}>{meta.label}</Text>
                <Ionicons name={showTypeDD ? 'chevron-up' : 'chevron-down'} size={14} color={COULEURS.night[400]} />
              </View>
            </TouchableOpacity>
            {showTypeDD && (
              <View style={detStyles.dropdown}>
                {TYPES_ETAPE.map(t => {
                  const m = ETAPE_META[t];
                  const sel = etape.typeEtape === t;
                  return (
                    <TouchableOpacity key={t} style={[detStyles.dropdownItem, sel && detStyles.dropdownItemSel]}
                      onPress={() => { onMaj('typeEtape', t); setShowTypeDD(false); }}>
                      <View style={[detStyles.typeDot, { backgroundColor: m.couleur }]} />
                      <Text style={[detStyles.dropdownTexte, sel && detStyles.dropdownTexteSel]}>{m.label}</Text>
                      {sel && <Ionicons name="checkmark" size={16} color={COULEURS.legend[500]} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            {etape.typeEtape === 'autre' && (
              <View style={detStyles.ligneInput}>
                <TextInput
                  style={detStyles.autreInput}
                  value={etape.labelAutre}
                  onChangeText={v => onMaj('labelAutre', v)}
                  placeholder="Nom personnalisé (ex : Sprint final)"
                  placeholderTextColor={COULEURS.night[300]}
                  maxLength={40}
                />
              </View>
            )}

            {/* ── DURÉE ── */}
            <Text style={detStyles.sectionHeader}>DURÉE</Text>
            <TouchableOpacity style={detStyles.ligne} onPress={() => { setShowDureeTypeDD(!showDureeTypeDD); setShowTypeDD(false); setShowAllureTypeDD(false); }} activeOpacity={0.7}>
              <Text style={detStyles.ligneLabel}>Type</Text>
              <View style={detStyles.ligneValeurRow}>
                <Text style={detStyles.ligneValeur}>{etape.dureeType === 'temps' ? 'Temps' : 'Distance'}</Text>
                <Ionicons name={showDureeTypeDD ? 'chevron-up' : 'chevron-down'} size={14} color={COULEURS.night[400]} />
              </View>
            </TouchableOpacity>
            {showDureeTypeDD && (
              <View style={detStyles.dropdown}>
                {(['temps', 'distance'] as const).map(t => {
                  const sel = etape.dureeType === t;
                  return (
                    <TouchableOpacity key={t} style={[detStyles.dropdownItem, sel && detStyles.dropdownItemSel]}
                      onPress={() => { onMaj('dureeType', t); setShowDureeTypeDD(false); }}>
                      <Text style={[detStyles.dropdownTexte, sel && detStyles.dropdownTexteSel]}>{t === 'temps' ? 'Temps' : 'Distance'}</Text>
                      {sel && <Ionicons name="checkmark" size={16} color={COULEURS.legend[500]} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            <TouchableOpacity style={detStyles.ligne} onPress={() => setInnerPicker('duree')} activeOpacity={0.7}>
              <Text style={detStyles.ligneLabel}>Valeur</Text>
              <View style={detStyles.ligneValeurRow}>
                <Text style={[detStyles.ligneValeur, detStyles.ligneValeurAccent]}>{dureeLabel}</Text>
                <Ionicons name="chevron-down" size={14} color={COULEURS.legend[500]} />
              </View>
            </TouchableOpacity>

            {/* ── ALLURE ── */}
            <Text style={detStyles.sectionHeader}>ALLURE (OPTIONNEL)</Text>
            <TouchableOpacity style={detStyles.ligne} onPress={() => { setShowAllureTypeDD(!showAllureTypeDD); setShowTypeDD(false); setShowDureeTypeDD(false); }} activeOpacity={0.7}>
              <Text style={detStyles.ligneLabel}>Objectif</Text>
              <View style={detStyles.ligneValeurRow}>
                <Text style={detStyles.ligneValeur}>{etape.allureActive ? 'Allure' : 'Aucun'}</Text>
                <Ionicons name={showAllureTypeDD ? 'chevron-up' : 'chevron-down'} size={14} color={COULEURS.night[400]} />
              </View>
            </TouchableOpacity>
            {showAllureTypeDD && (
              <View style={detStyles.dropdown}>
                {[false, true].map(actif => (
                  <TouchableOpacity key={String(actif)} style={[detStyles.dropdownItem, etape.allureActive === actif && detStyles.dropdownItemSel]}
                    onPress={() => { onMaj('allureActive', actif); setShowAllureTypeDD(false); }}>
                    <Text style={[detStyles.dropdownTexte, etape.allureActive === actif && detStyles.dropdownTexteSel]}>{actif ? 'Allure' : 'Aucun'}</Text>
                    {etape.allureActive === actif && <Ionicons name="checkmark" size={16} color={COULEURS.legend[500]} />}
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {etape.allureActive && (
              <View style={detStyles.ligne}>
                <Text style={detStyles.ligneLabel}>Plage cible</Text>
                <View style={detStyles.allurePlageRow}>
                  <TouchableOpacity style={detStyles.allureBtn} onPress={() => setInnerPicker('allurebasse')}>
                    <Text style={detStyles.allureBtnTxt}>{formaterAllure(etape.allureBasseMin, etape.allureBasseSec)}</Text>
                  </TouchableOpacity>
                  <Text style={detStyles.allureTiret}>~</Text>
                  <TouchableOpacity style={detStyles.allureBtn} onPress={() => setInnerPicker('allurehaut')}>
                    <Text style={detStyles.allureBtnTxt}>{formaterAllure(etape.allureHauteMin, etape.allureHauteSec)}</Text>
                  </TouchableOpacity>
                  <Text style={detStyles.allureUnite}>/km</Text>
                </View>
              </View>
            )}

            <View style={{ height: ESPACEMENT.xl }} />
          </ScrollView>

          <TouchableOpacity style={detStyles.validerBtn} onPress={onFermer}>
            <Text style={detStyles.validerTxt}>Valider</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const detStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '88%' },
  handle: { width: 40, height: 4, backgroundColor: COULEURS.night[200], borderRadius: 2, alignSelf: 'center', marginTop: ESPACEMENT.sm, marginBottom: 4 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: ESPACEMENT.md, paddingVertical: ESPACEMENT.sm, borderBottomWidth: 1, borderBottomColor: COULEURS.night[100] },
  headerDot: { width: 12, height: 12, borderRadius: 6, marginRight: 8 },
  sheetTitre: { flex: 1, fontSize: 17, fontWeight: '700', color: COULEURS.night[700] },
  supprimerBtn: { padding: 4 },
  supprimerTexte: { fontSize: 14, fontWeight: '600', color: COULEURS.danger },
  sectionHeader: { fontSize: 11, fontWeight: '700', color: COULEURS.night[400], letterSpacing: 0.8, paddingHorizontal: ESPACEMENT.md, paddingTop: 14, paddingBottom: 4, backgroundColor: COULEURS.night[50] },
  ligne: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: ESPACEMENT.md, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COULEURS.night[50], backgroundColor: '#fff' },
  ligneLabel: { fontSize: 15, fontWeight: '500', color: COULEURS.night[700] },
  ligneValeurRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ligneValeur: { fontSize: 14, color: COULEURS.night[500] },
  ligneValeurAccent: { color: COULEURS.legend[500], fontWeight: '600' },
  typeDot: { width: 10, height: 10, borderRadius: 5 },
  dropdown: { backgroundColor: COULEURS.night[50] },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: ESPACEMENT.md + 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COULEURS.night[100], backgroundColor: '#fff' },
  dropdownItemSel: { backgroundColor: COULEURS.legend[50] },
  dropdownTexte: { flex: 1, fontSize: 14, color: COULEURS.night[600] },
  dropdownTexteSel: { color: COULEURS.legend[600], fontWeight: '600' },
  ligneInput: { paddingHorizontal: ESPACEMENT.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COULEURS.night[50], backgroundColor: '#fff' },
  autreInput: { borderWidth: 1, borderColor: COULEURS.night[200], borderRadius: RAYONS.md, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: COULEURS.night[700] },
  allurePlageRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  allureBtn: { paddingHorizontal: 10, paddingVertical: 5, backgroundColor: COULEURS.legend[50], borderRadius: RAYONS.sm },
  allureBtnTxt: { fontSize: 15, fontWeight: '600', color: COULEURS.legend[600] },
  allureTiret: { fontSize: 14, color: COULEURS.night[400] },
  allureUnite: { fontSize: 13, color: COULEURS.night[400] },
  validerBtn: { margin: ESPACEMENT.md, backgroundColor: COULEURS.legend[500], borderRadius: RAYONS.full, paddingVertical: 14, alignItems: 'center' },
  validerTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

// ─── BoucleWorkoutCard (compact) ─────────────────────────────────────────────

function BoucleWorkoutCard({ boucle, onMajReps, onSupprimerEtape, onAjouterEtape, onSupprimerBoucle, onOuvrirEtapeModal }: {
  boucle: BoucleWk;
  onMajReps: (n: number) => void;
  onSupprimerEtape: (etapeCle: string) => void;
  onAjouterEtape: () => void;
  onSupprimerBoucle: () => void;
  onOuvrirEtapeModal: (cle: string) => void;
}) {
  const [showRepsPicker, setShowRepsPicker] = useState(false);
  const REPS_ITEMS = Array.from({ length: 50 }, (_, i) => String(i + 1));

  return (
    <View style={styles.boucleCard}>
      <PickerModal
        visible={showRepsPicker}
        titre="Répétitions"
        onFermer={() => setShowRepsPicker(false)}
        colonnes={[{
          items: REPS_ITEMS,
          selectedIndex: boucle.repetitions - 1,
          onSelect: v => onMajReps(v + 1),
          label: 'fois',
        }]}
      />

      {/* Header */}
      <View style={styles.boucleHeader}>
        <Ionicons name="repeat" size={16} color={COULEURS.legend[500]} />
        <TouchableOpacity onPress={() => setShowRepsPicker(true)} style={styles.boucleRepsBtn} activeOpacity={0.7}>
          <Text style={styles.boucleRepsTxt}>{boucle.repetitions} fois</Text>
          <Ionicons name="chevron-down" size={13} color={COULEURS.legend[500]} />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={onSupprimerBoucle} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close-circle" size={20} color={COULEURS.night[300]} />
        </TouchableOpacity>
      </View>

      {/* Sub-steps */}
      <View style={styles.boucleSousEtapes}>
        {boucle.etapes.map(e => (
          <LigneEtape
            key={e.cle}
            etape={e}
            onTap={() => onOuvrirEtapeModal(e.cle)}
            onSupprimer={() => onSupprimerEtape(e.cle)}
            inBoucle
          />
        ))}
        <TouchableOpacity style={styles.ajouterEtapeBoucle} onPress={onAjouterEtape}>
          <Ionicons name="add" size={16} color={COULEURS.legend[500]} />
          <Text style={styles.ajouterEtapeBoucleTexte}>Ajouter une étape</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── CarteEtapeSimple & CarteGroupe ──────────────────────────────────────────

const COULEURS_ETAPE = [COULEURS.legend[500], '#F59E0B', COULEURS.info, '#10B981', COULEURS.danger];

function CarteEtapeSimple({ etape, numero, onMaj, onSupprimer, onOuvrirDureePicker }: {
  etape: EtapeForm; numero: number;
  onMaj: (c: string, champ: keyof EtapeForm, val: any) => void;
  onSupprimer: (c: string) => void;
  onOuvrirDureePicker: (etapeCle: string) => void;
}) {
  const couleur = COULEURS_ETAPE[(numero - 1) % COULEURS_ETAPE.length];
  const dureeLabel = etape.dureeSec > 0
    ? `${etape.dureeMin}:${String(etape.dureeSec).padStart(2, '0')}`
    : `${etape.dureeMin} min`;
  return (
    <View style={[styles.carteEtape, { borderLeftColor: couleur }]}>
      {/* En-tête : numéro + titre + poubelle */}
      <View style={styles.carteEtapeHeader}>
        <View style={[styles.carteEtapeNum, { backgroundColor: couleur + '22' }]}>
          <Text style={[styles.carteEtapeNumTxt, { color: couleur }]}>{numero}</Text>
        </View>
        <TextInput
          style={styles.carteEtapeTitre}
          value={etape.titre}
          onChangeText={v => onMaj(etape.cle, 'titre', v)}
          placeholder="Nom de l'étape"
          placeholderTextColor={COULEURS.night[300]}
          autoCapitalize="sentences"
        />
        <TouchableOpacity onPress={() => onSupprimer(etape.cle)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="trash-outline" size={16} color={COULEURS.danger} />
        </TouchableOpacity>
      </View>

      {/* Corps : durée (picker) + description */}
      <View style={styles.carteEtapeCorps}>
        <TouchableOpacity
          style={[styles.carteEtapeDureeBox, { backgroundColor: couleur + '12' }]}
          onPress={() => onOuvrirDureePicker(etape.cle)}
          activeOpacity={0.75}
        >
          <Text style={[styles.carteEtapeDureeVal, { color: couleur }]}>{dureeLabel}</Text>
          <Ionicons name="chevron-down" size={12} color={couleur} style={{ marginLeft: 2 }} />
        </TouchableOpacity>
        <TextInput
          style={styles.carteEtapeDesc}
          value={etape.description}
          onChangeText={v => onMaj(etape.cle, 'description', v)}
          placeholder="Consignes, détails de l'étape..."
          placeholderTextColor={COULEURS.night[300]}
          multiline
          textAlignVertical="top"
        />
      </View>
    </View>
  );
}

function CarteGroupe({ groupe, numero, onMaj, onSupprimer, onOuvrirAllure }: {
  groupe: GroupeForm; numero: number;
  onMaj: (c: string, champ: keyof GroupeForm, val: any) => void;
  onSupprimer: (c: string) => void;
  onOuvrirAllure: (groupeCle: string, field: 'basse' | 'haute') => void;
}) {
  const couleur = COULEURS_ETAPE[(numero - 1) % COULEURS_ETAPE.length];
  return (
    <View style={styles.carteGroupe}>
      {/* En-tête */}
      <View style={styles.carteGroupeHeader}>
        <View style={[styles.carteGroupeNum, { backgroundColor: couleur }]}>
          <Text style={styles.carteGroupeNumTxt}>{numero}</Text>
        </View>
        <TextInput
          style={styles.carteGroupeNom}
          value={groupe.nom}
          onChangeText={v => onMaj(groupe.cle, 'nom', v)}
          placeholder="Nom du groupe  (ex : Les Gazelles)"
          placeholderTextColor={COULEURS.night[300]}
          autoCapitalize="words"
        />
        <TouchableOpacity onPress={() => onSupprimer(groupe.cle)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="trash-outline" size={16} color={COULEURS.danger} />
        </TouchableOpacity>
      </View>

      {/* Allures via picker */}
      <View style={styles.carteGroupeAllureRow}>
        <Ionicons name="speedometer-outline" size={13} color={COULEURS.night[400]} />
        <Text style={styles.carteGroupeAllureLabel}>Allure</Text>
        <TouchableOpacity style={styles.carteGroupeAllureBtn} onPress={() => onOuvrirAllure(groupe.cle, 'basse')}>
          <Text style={styles.carteGroupeAllureTxt}>{formaterAllure(groupe.allureBasseMin, groupe.allureBasseSec)}</Text>
          <Ionicons name="chevron-down" size={11} color={COULEURS.legend[500]} />
        </TouchableOpacity>
        <Text style={styles.carteGroupeAllureFleche}>→</Text>
        <TouchableOpacity style={styles.carteGroupeAllureBtn} onPress={() => onOuvrirAllure(groupe.cle, 'haute')}>
          <Text style={styles.carteGroupeAllureTxt}>{formaterAllure(groupe.allureHauteMin, groupe.allureHauteSec)}</Text>
          <Ionicons name="chevron-down" size={11} color={COULEURS.legend[500]} />
        </TouchableOpacity>
        <Text style={styles.carteGroupeAllureLabel}>/km</Text>
      </View>

      {/* Consignes */}
      <TextInput
        style={styles.carteGroupeConsignes}
        value={groupe.consignes}
        onChangeText={v => onMaj(groupe.cle, 'consignes', v)}
        placeholder="Consignes optionnelles..."
        placeholderTextColor={COULEURS.night[300]}
        multiline
        textAlignVertical="top"
      />
    </View>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

// Build arrays for pickers
const HEURES_ITEMS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES_ITEMS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const DUREE_H_ITEMS = Array.from({ length: 9 }, (_, i) => String(i) + 'h');
const KM_ITEMS = Array.from({ length: 100 }, (_, i) => String(i));
const KM_DEC_ITEMS = Array.from({ length: 10 }, (_, i) => String(i));
const ALLURE_MIN_ITEMS = Array.from({ length: 10 }, (_, i) => String(i + 1));
const ALLURE_SEC_ITEMS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const ETAPE_MIN_ITEMS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const ETAPE_SEC_ITEMS = ALLURE_SEC_ITEMS;
// Partie mètre de la distance (centaines : 0, 100, 200, ..., 900)
const ETAPE_M_ITEMS = ['0', '100', '200', '300', '400', '500', '600', '700', '800', '900'];
// Minutes pour les étapes simples (déroulé footing/sortie longue/libre) : 0–120 min
const SIMPLE_DUREE_MIN_ITEMS = Array.from({ length: 121 }, (_, i) => String(i));

type ActivePicker =
  | { kind: 'heure' }
  | { kind: 'duree' }
  | { kind: 'distance' }
  | { kind: 'groupeAllure'; groupeCle: string; field: 'basse' | 'haute' }
  | { kind: 'etapeSimpleDuree'; etapeCle: string };

export default function CreerSession() {
  const { crewId, sessionId } = useLocalSearchParams<{ crewId: string; sessionId?: string }>();
  const modeEdition = !!sessionId;
  const session = useAuthStore((s) => s.session);
  const creerSession = useSessionStore((s) => s.creerSession);
  const modifierSession = useSessionStore((s) => s.modifierSession);

  const [chargement, setChargement] = useState(false);
  const [preChargement, setPreChargement] = useState(modeEdition);
  const [erreur, setErreur] = useState<string | null>(null);

  const [titre, setTitre] = useState('');
  const [type, setType] = useState<TypeEntrainement>('fractionne');

  const auj = new Date();
  const [jour, setJour] = useState(auj.getDate());
  const [mois, setMois] = useState(auj.getMonth() + 1);
  const [annee, setAnnee] = useState(auj.getFullYear());
  const [showCal, setShowCal] = useState(false);

  // Heure RDV
  const [rdvH, setRdvH] = useState(7);
  const [rdvMin, setRdvMin] = useState(0);

  // Durée session
  const [dureeH, setDureeH] = useState(1);
  const [dureeMin, setDureeMin] = useState(0);
  const [hasDuree, setHasDuree] = useState(false);

  // Distance (simple types)
  const [distKm, setDistKm] = useState(10);
  const [distDec, setDistDec] = useState(0);
  const [hasDist, setHasDist] = useState(false);

  const [lieu, setLieu] = useState('');
  const [lieuSuggestions, setLieuSuggestions] = useState<Array<{ display_name: string; place_id: number }>>([]);
  const [lieuChargement, setLieuChargement] = useState(false);
  const lieuDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [description, setDescription] = useState('');

  const [activePicker, setActivePicker] = useState<ActivePicker | null>(null);
  const [etapeModal, setEtapeModal] = useState<{ cle: string; boucleCle: string | null } | null>(null);

  // Workout builder
  const [workout, setWorkout] = useState<BlocWk[]>([
    { ...nouvelleEtapeWk('echauffement'), dureeMin: 10, dureeSec: 0 },
    nouvelleBoucle(),
    { ...nouvelleEtapeWk('retour_calme'), dureeMin: 10, dureeSec: 0 },
  ]);

  // Déroulé simple
  const [etapes, setEtapes] = useState<EtapeForm[]>([]);
  const [groupes, setGroupes] = useState<GroupeForm[]>([]);

  // ─── Workout handlers ─────────────────────────────────────────────────────

  function ajouterEtapeWk() { setWorkout(prev => [...prev, nouvelleEtapeWk()]); }
  function ajouterBoucleWk() { setWorkout(prev => [...prev, nouvelleBoucle()]); }
  function supprimerBlocWk(c: string) { setWorkout(prev => prev.filter(b => b.cle !== c)); }

  function majEtapeWk(c: string, champ: string, val: any) {
    setWorkout(prev => prev.map(b => b.cle === c ? { ...b, [champ]: val } : b));
  }

  function majRepsWk(c: string, n: number) {
    setWorkout(prev => prev.map(b => b.cle === c ? { ...b, repetitions: n } : b));
  }

  function ajouterEtapeEnBoucle(boucle_cle: string) {
    setWorkout(prev => prev.map(b => {
      if (b.cle !== boucle_cle || b.kind !== 'boucle') return b;
      return { ...b, etapes: [...b.etapes, nouvelleEtapeWk()] };
    }));
  }

  function majEtapeEnBoucle(boucle_cle: string, etapeCle: string, champ: string, val: any) {
    setWorkout(prev => prev.map(b => {
      if (b.cle !== boucle_cle || b.kind !== 'boucle') return b;
      return { ...b, etapes: b.etapes.map(e => e.cle === etapeCle ? { ...e, [champ]: val } : e) };
    }));
  }

  function supprimerEtapeEnBoucle(boucle_cle: string, etapeCle: string) {
    setWorkout(prev => prev.map(b => {
      if (b.cle !== boucle_cle || b.kind !== 'boucle') return b;
      return { ...b, etapes: b.etapes.filter(e => e.cle !== etapeCle) };
    }));
  }

  // Find etape in workout (flat or in boucle)
  function trouverEtape(etapeCle: string, boucle_cle: string | null): EtapeWk | null {
    if (boucle_cle) {
      const b = workout.find(b => b.cle === boucle_cle && b.kind === 'boucle') as BoucleWk | undefined;
      return b?.etapes.find(e => e.cle === etapeCle) ?? null;
    }
    return (workout.find(b => b.cle === etapeCle && b.kind === 'etape') as EtapeWk | undefined) ?? null;
  }

  function majEtapeField(etapeCle: string, boucle_cle: string | null, champ: string, val: any) {
    if (boucle_cle) {
      majEtapeEnBoucle(boucle_cle, etapeCle, champ, val);
    } else {
      majEtapeWk(etapeCle, champ, val);
    }
  }

  // Resolve boucle_cle from etapeCle (search in all boucles)
  function trouverBoucleDe(etapeCle: string): string | null {
    for (const b of workout) {
      if (b.kind === 'boucle' && b.etapes.some(e => e.cle === etapeCle)) return b.cle;
    }
    return null;
  }

  function ouvrirEtapeModal(cle: string, boucleCle: string | null = null) {
    setEtapeModal({ cle, boucleCle });
  }
  function fermerEtapeModal() { setEtapeModal(null); }

  const etapeModalData = etapeModal
    ? trouverEtape(etapeModal.cle, etapeModal.boucleCle)
    : null;

  function majEtapeModal(champ: string, val: any) {
    if (!etapeModal) return;
    majEtapeField(etapeModal.cle, etapeModal.boucleCle, champ, val);
  }

  function supprimerEtapeModal() {
    if (!etapeModal) return;
    if (etapeModal.boucleCle) {
      supprimerEtapeEnBoucle(etapeModal.boucleCle, etapeModal.cle);
    } else {
      supprimerBlocWk(etapeModal.cle);
    }
    fermerEtapeModal();
  }

  // ─── Pré-remplissage en mode édition ─────────────────────────────────────

  useEffect(() => {
    if (!modeEdition || !sessionId) return;
    preRemplir();
  }, [sessionId]);

  useEffect(() => {
    return () => {
      if (lieuDebounceRef.current) clearTimeout(lieuDebounceRef.current);
    };
  }, []);

  async function preRemplir() {
    setPreChargement(true);
    const [{ data: sess }, { data: grps }] = await Promise.all([
      supabase.from('sessions').select('*').eq('id', sessionId).single(),
      supabase.from('groupes_allure').select('*').eq('session_id', sessionId).order('ordre'),
    ]);
    if (!sess) { setPreChargement(false); return; }

    setTitre(sess.titre);
    setType(sess.type_entrainement as TypeEntrainement);

    const d = new Date(sess.heure_rdv);
    setJour(d.getDate());
    setMois(d.getMonth() + 1);
    setAnnee(d.getFullYear());
    setRdvH(d.getHours());
    setRdvMin(d.getMinutes());

    if (sess.duree_entrainement_min) {
      setHasDuree(true);
      setDureeH(Math.floor(sess.duree_entrainement_min / 60));
      setDureeMin(sess.duree_entrainement_min % 60);
    }

    if (sess.distance_km && !TYPES_WK.has(sess.type_entrainement)) {
      setHasDist(true);
      setDistKm(Math.floor(sess.distance_km));
      setDistDec(Math.round((sess.distance_km - Math.floor(sess.distance_km)) * 10));
    }

    setLieu(sess.point_rdv || '');
    setDescription(sess.description || '');

    if (sess.deroulement) {
      if (Array.isArray(sess.deroulement)) {
        setEtapes((sess.deroulement as any[]).map((e: any) => ({
          cle: cle(), titre: e.titre,
          dureeMin: Math.floor(e.duree_min),
          dureeSec: Math.round((e.duree_min % 1) * 60),
          description: e.description || '',
        })));
      } else if ((sess.deroulement as any).format === 'workout_v2') {
        setWorkout((sess.deroulement as any).blocs);
      }
    }

    if (grps) {
      setGroupes(grps.map((g: any) => ({
        cle: cle(), nom: g.nom,
        allureBasseMin: Math.floor(g.allure_basse),
        allureBasseSec: Math.round((g.allure_basse - Math.floor(g.allure_basse)) * 100),
        allureHauteMin: Math.floor(g.allure_haute),
        allureHauteSec: Math.round((g.allure_haute - Math.floor(g.allure_haute)) * 100),
        consignes: g.consignes || '',
      })));
    }

    setPreChargement(false);
  }

  // ─── Déroulé simple ────────────────────────────────────────────────────────

  function ajouterEtape() { setEtapes(prev => [...prev, { cle: cle(), titre: '', dureeMin: 20, dureeSec: 0, description: '' }]); }
  function majEtape(c: string, champ: keyof EtapeForm, val: any) { setEtapes(prev => prev.map(e => e.cle === c ? { ...e, [champ]: val } : e)); }
  function supprimerEtape(c: string) { setEtapes(prev => prev.filter(e => e.cle !== c)); }
  function ajouterGroupe() {
    setGroupes(prev => [...prev, { cle: cle(), nom: '', allureBasseMin: 5, allureBasseSec: 0, allureHauteMin: 5, allureHauteSec: 30, consignes: '' }]);
  }
  function majGroupe(c: string, champ: keyof GroupeForm, val: any) { setGroupes(prev => prev.map(g => g.cle === c ? { ...g, [champ]: val } : g)); }
  function supprimerGroupe(c: string) { setGroupes(prev => prev.filter(g => g.cle !== c)); }

  // ─── Lieu / géocodage ─────────────────────────────────────────────────────

  function changerLieu(texte: string) {
    setLieu(texte);
    setLieuSuggestions([]);
    if (lieuDebounceRef.current) clearTimeout(lieuDebounceRef.current);
    if (texte.trim().length < 3) { setLieuChargement(false); return; }
    setLieuChargement(true);
    lieuDebounceRef.current = setTimeout(async () => {
      try {
        const q = encodeURIComponent(texte.trim());
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${q}&limit=4&accept-language=fr`,
          { headers: { 'User-Agent': 'RunCrewApp/1.0' } }
        );
        const data = await res.json();
        setLieuSuggestions(Array.isArray(data) ? data : []);
      } catch {
        setLieuSuggestions([]);
      } finally {
        setLieuChargement(false);
      }
    }, 600);
  }

  function choisirSuggestion(displayName: string) {
    setLieu(displayName);
    setLieuSuggestions([]);
    setLieuChargement(false);
    if (lieuDebounceRef.current) clearTimeout(lieuDebounceRef.current);
  }

  function ouvrirMapsLieu() {
    if (!lieu.trim()) return;
    const q = encodeURIComponent(lieu.trim());
    const url = Platform.OS === 'ios'
      ? `maps://?q=${q}`
      : `https://www.google.com/maps/search/?api=1&query=${q}`;
    Linking.openURL(url).catch(() =>
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`)
    );
  }

  // ─── Soumission ────────────────────────────────────────────────────────────

  async function handlePublier() {
    setErreur(null);
    if (!titre.trim()) { setErreur('Donne un titre à ta session'); return; }
    if (!session?.user?.id) { setErreur('Non connecté'); return; }
    if (!modeEdition && !crewId) { setErreur('Crew manquant'); return; }

    const d = new Date(annee, mois - 1, jour, rdvH, rdvMin);
    if (isNaN(d.getTime())) { setErreur('Date invalide'); return; }
    const heureRdv = d.toISOString();

    let deroulement: any;
    let groupesValides: any[] = [];
    let distanceFinale: number | null = null;

    if (TYPES_WK.has(type)) {
      // Serialize blocs with string allure for DB compat
      const blocsDB = workout.map(bloc => {
        if (bloc.kind === 'boucle') {
          return {
            ...bloc,
            etapes: bloc.etapes.map(e => ({
              ...e,
              allureBasse: e.allureActive ? e.allureBasseMin + e.allureBasseSec / 60 : null,
              alureHaute: e.allureActive ? e.allureHauteMin + e.allureHauteSec / 60 : null,
              dureeValeur: e.dureeType === 'temps'
                ? formaterTemps(e.dureeMin, e.dureeSec)
                : `${e.dureeDistanceM}m`,
            })),
          };
        }
        const etape = bloc as EtapeWk;
        return {
          ...etape,
          allureBasse: etape.allureActive ? etape.allureBasseMin + etape.allureBasseSec / 60 : null,
          alureHaute: etape.allureActive ? etape.allureHauteMin + etape.allureHauteSec / 60 : null,
          dureeValeur: etape.dureeType === 'temps'
            ? formaterTemps(etape.dureeMin, etape.dureeSec)
            : `${etape.dureeDistanceM}m`,
        };
      });
      deroulement = { format: 'workout_v2', blocs: blocsDB };
      distanceFinale = calculerDistanceTotale(workout);
    } else {
      deroulement = etapes.filter(e => e.titre.trim() && e.dureeMin > 0).map((e, i) => ({
        ordre: i + 1,
        titre: e.titre.trim(),
        duree_min: e.dureeMin + e.dureeSec / 60,
        description: e.description.trim(),
      }));
      groupesValides = groupes.filter(g => g.nom.trim()).map((g, i) => ({
          nom: g.nom.trim(),
          allure_basse: g.allureBasseMin + g.allureBasseSec / 100,
          allure_haute: g.allureHauteMin + g.allureHauteSec / 100,
          consignes: g.consignes.trim() || null,
          ordre: i + 1,
      }));
      distanceFinale = hasDist ? distKm + distDec / 10 : null;
    }

    const paramsCommuns = {
      titre: titre.trim(),
      description: description.trim() || null,
      type_entrainement: type,
      heure_rdv: heureRdv,
      duree_entrainement_min: hasDuree ? dureeH * 60 + dureeMin : null,
      distance_km: distanceFinale,
      point_rdv: lieu.trim() || null,
      deroulement,
      groupes: groupesValides,
    };

    setChargement(true);
    try {
      if (modeEdition && sessionId) {
        await modifierSession(sessionId, paramsCommuns);
        router.replace(`/session/${sessionId}` as any);
      } else {
        await creerSession({ crew_id: crewId!, cree_par: session.user.id, ...paramsCommuns });
        router.replace(`/crew/${crewId}`);
      }
    } catch (err: any) {
      setErreur(err.message || (modeEdition ? 'Impossible de modifier la session' : 'Impossible de créer la session'));
    } finally {
      setChargement(false);
    }
  }

  const estWorkout = TYPES_WK.has(type);
  const distAutoCalc = estWorkout ? calculerDistanceTotale(workout) : null;

  // ─── Picker modal content ──────────────────────────────────────────────────

  function renderPickerModal() {
    if (!activePicker) return null;

    if (activePicker.kind === 'heure') {
      return (
        <PickerModal
          visible
          titre="Heure de rendez-vous"
          onFermer={() => setActivePicker(null)}
          colonnes={[
            { items: HEURES_ITEMS, selectedIndex: rdvH, onSelect: setRdvH, separator: 'h' },
            { items: MINUTES_ITEMS, selectedIndex: rdvMin, onSelect: setRdvMin },
          ]}
        />
      );
    }

    if (activePicker.kind === 'duree') {
      return (
        <PickerModal
          visible
          titre="Durée estimée"
          onFermer={() => setActivePicker(null)}
          colonnes={[
            { items: DUREE_H_ITEMS, selectedIndex: dureeH, onSelect: setDureeH, separator: '' },
            { items: MINUTES_ITEMS, selectedIndex: dureeMin, onSelect: setDureeMin, label: 'min' },
          ]}
        />
      );
    }

    if (activePicker.kind === 'distance') {
      return (
        <PickerModal
          visible
          titre="Distance"
          onFermer={() => setActivePicker(null)}
          colonnes={[
            { items: KM_ITEMS, selectedIndex: distKm, onSelect: setDistKm, separator: '.' },
            { items: KM_DEC_ITEMS, selectedIndex: distDec, onSelect: setDistDec, label: 'km' },
          ]}
        />
      );
    }

    if (activePicker.kind === 'etapeSimpleDuree') {
      const etape = etapes.find(e => e.cle === activePicker.etapeCle);
      if (!etape) return null;
      return (
        <PickerModal
          visible
          titre="Durée de l'étape"
          onFermer={() => setActivePicker(null)}
          colonnes={[
            {
              items: SIMPLE_DUREE_MIN_ITEMS,
              selectedIndex: etape.dureeMin,
              onSelect: v => majEtape(activePicker.etapeCle, 'dureeMin', v),
              separator: ':',
            },
            {
              items: ETAPE_SEC_ITEMS,
              selectedIndex: etape.dureeSec,
              onSelect: v => majEtape(activePicker.etapeCle, 'dureeSec', v),
              label: 'min',
            },
          ]}
        />
      );
    }

    if (activePicker.kind === 'groupeAllure') {
      const groupe = groupes.find(g => g.cle === activePicker.groupeCle);
      if (!groupe) return null;
      const isBasse = activePicker.field === 'basse';
      return (
        <PickerModal
          visible
          titre={isBasse ? 'Allure basse' : 'Allure haute'}
          onFermer={() => setActivePicker(null)}
          colonnes={[
            {
              items: ALLURE_MIN_ITEMS,
              selectedIndex: (isBasse ? groupe.allureBasseMin : groupe.allureHauteMin) - 1,
              onSelect: v => majGroupe(groupe.cle, isBasse ? 'allureBasseMin' : 'allureHauteMin', v + 1),
              separator: ':',
            },
            {
              items: ALLURE_SEC_ITEMS,
              selectedIndex: isBasse ? groupe.allureBasseSec : groupe.allureHauteSec,
              onSelect: v => majGroupe(groupe.cle, isBasse ? 'allureBasseSec' : 'allureHauteSec', v),
              label: '/km',
            },
          ]}
        />
      );
    }

    return null;
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <EtapeDetailModal
        visible={!!etapeModal}
        etape={etapeModalData}
        onFermer={fermerEtapeModal}
        onMaj={majEtapeModal}
        onSupprimer={supprimerEtapeModal}
      />
      {renderPickerModal()}

      <CalendrierModal
        visible={showCal}
        dateSelectionnee={{ j: jour, m: mois, a: annee }}
        onSelect={(j, m, a) => { setJour(j); setMois(m); setAnnee(a); }}
        onFermer={() => setShowCal(false)}
      />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            if (modeEdition && sessionId) router.replace(`/session/${sessionId}` as any);
            else if (crewId) router.replace(`/crew/${crewId}` as any);
            else router.back();
          }}
          style={styles.boutonFermer}
        >
          <Ionicons name={modeEdition ? 'arrow-back' : 'close'} size={24} color={COULEURS.night[600]} />
        </TouchableOpacity>
        <Text style={styles.headerTitre}>{modeEdition ? 'Modifier la session' : 'Créer une session'}</Text>
        <View style={{ width: 40 }} />
      </View>

      {preChargement && (
        <View style={styles.preChargementOverlay}>
          <ActivityIndicator color={COULEURS.legend[500]} size="large" />
        </View>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* ── Section 1 : Titre & Type ── */}
          <View style={styles.section}>
            <View style={styles.champContainer}>
              <Text style={styles.label}>Titre de la session</Text>
              <TextInput style={styles.champ} value={titre} onChangeText={setTitre} placeholder="Ex : Fractionné du mardi soir" placeholderTextColor={COULEURS.night[300]} autoCapitalize="sentences" />
            </View>

            <Text style={styles.label}>Type d'entraînement</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsRow}>
              {TYPES.map(t => {
                const actif = type === t.valeur;
                return (
                  <TouchableOpacity key={t.valeur} style={[styles.pill, actif && styles.pillActif]} onPress={() => setType(t.valeur)}>
                    {t.groupe === 'workout' && <View style={styles.pillDotWorkout} />}
                    <Text style={[styles.pillTexte, actif && styles.pillTexteActif]}>{t.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* ── Section 2 : Quand & Où ── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitre}>Quand & où</Text>

            <View style={styles.bentoRow}>
              <TouchableOpacity style={[styles.bentoCard, { flex: 1.3 }]} onPress={() => setShowCal(true)} activeOpacity={0.7}>
                <View style={styles.bentoLabel}>
                  <Ionicons name="calendar-outline" size={13} color={COULEURS.night[400]} />
                  <Text style={styles.bentoLabelTexte}>DATE</Text>
                </View>
                <Text style={styles.bentoValeur}>{formaterDate(jour, mois, annee)}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.bentoCard, { flex: 1 }]} onPress={() => setActivePicker({ kind: 'heure' })} activeOpacity={0.7}>
                <View style={styles.bentoLabel}>
                  <Ionicons name="time-outline" size={13} color={COULEURS.night[400]} />
                  <Text style={styles.bentoLabelTexte}>HEURE</Text>
                </View>
                <Text style={styles.bentoValeur}>{formaterHeure(rdvH, rdvMin)}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.bentoRow}>
              {/* Durée */}
              <TouchableOpacity style={[styles.bentoCard, { flex: 1 }]} onPress={() => { setHasDuree(true); setActivePicker({ kind: 'duree' }); }} activeOpacity={0.7}>
                <View style={styles.bentoLabel}>
                  <Ionicons name="hourglass-outline" size={13} color={COULEURS.night[400]} />
                  <Text style={styles.bentoLabelTexte}>DURÉE</Text>
                </View>
                {hasDuree ? (
                  <View style={styles.bentoValeurRow}>
                    <Text style={styles.bentoValeur}>{dureeH}h{String(dureeMin).padStart(2,'0')}</Text>
                    <TouchableOpacity onPress={e => { e.stopPropagation?.(); setHasDuree(false); }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                      <Ionicons name="close-circle" size={14} color={COULEURS.night[300]} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={styles.bentoPlaceholder}>Optionnel</Text>
                )}
              </TouchableOpacity>

              {/* Distance — auto pour workout, manuel pour simple */}
              {estWorkout ? (
                <View style={[styles.bentoCard, { flex: 1, opacity: 0.7 }]}>
                  <View style={styles.bentoLabel}>
                    <Ionicons name="navigate-outline" size={13} color={COULEURS.night[400]} />
                    <Text style={styles.bentoLabelTexte}>DISTANCE</Text>
                  </View>
                  <Text style={[styles.bentoValeur, (!distAutoCalc || isNaN(distAutoCalc)) && styles.bentoPlaceholder]}>
                    {distAutoCalc && !isNaN(distAutoCalc) ? `~${distAutoCalc} km` : 'Calcul automatique'}
                  </Text>
                </View>
              ) : (
                <TouchableOpacity style={[styles.bentoCard, { flex: 1 }]} onPress={() => { setHasDist(true); setActivePicker({ kind: 'distance' }); }} activeOpacity={0.7}>
                  <View style={styles.bentoLabel}>
                    <Ionicons name="navigate-outline" size={13} color={COULEURS.night[400]} />
                    <Text style={styles.bentoLabelTexte}>DISTANCE</Text>
                  </View>
                  {hasDist ? (
                    <View style={styles.bentoValeurRow}>
                      <Text style={styles.bentoValeur}>{distKm}.{distDec} km</Text>
                      <TouchableOpacity onPress={e => { e.stopPropagation?.(); setHasDist(false); }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                        <Ionicons name="close-circle" size={14} color={COULEURS.night[300]} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Text style={styles.bentoPlaceholder}>Optionnel</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.bentoCard}>
              <View style={styles.bentoLabel}>
                <Ionicons name="location-outline" size={13} color={COULEURS.night[400]} />
                <Text style={styles.bentoLabelTexte}>LIEU DE RENDEZ-VOUS</Text>
                {lieuChargement && <ActivityIndicator size="small" color={COULEURS.legend[500]} style={{ marginLeft: 'auto' }} />}
              </View>
              <TextInput
                style={styles.bentoInput}
                value={lieu}
                onChangeText={changerLieu}
                placeholder="Ex : Stade Charléty, entrée principale"
                placeholderTextColor={COULEURS.night[300]}
                autoCapitalize="words"
              />
              {/* Suggestions Nominatim */}
              {lieuSuggestions.length > 0 && (
                <View style={styles.lieuSuggestions}>
                  {lieuSuggestions.map((s) => (
                    <TouchableOpacity
                      key={s.place_id}
                      style={styles.lieuSuggestionItem}
                      onPress={() => choisirSuggestion(s.display_name)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="location-outline" size={14} color={COULEURS.legend[500]} />
                      <Text style={styles.lieuSuggestionTexte} numberOfLines={2}>{s.display_name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {/* Lien Maps — visible quand lieu renseigné et pas de suggestions en cours */}
              {lieu.trim().length > 0 && lieuSuggestions.length === 0 && !lieuChargement && (
                <TouchableOpacity style={styles.lieuMapsLien} onPress={ouvrirMapsLieu} activeOpacity={0.75}>
                  <Ionicons name="map-outline" size={13} color={COULEURS.info} />
                  <Text style={styles.lieuMapsLienTexte}>Vérifier sur Maps</Text>
                  <Ionicons name="open-outline" size={11} color={COULEURS.info} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* ── Section 3 : Description ── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitre}>Description</Text>
            <TextInput
              style={[styles.champ, styles.champMultiline]}
              value={description}
              onChangeText={setDescription}
              placeholder={estWorkout ? 'Contexte de la séance, objectifs, conseils...' : 'Détails de la sortie, matériel, conseils...'}
              placeholderTextColor={COULEURS.night[300]}
              multiline numberOfLines={3} textAlignVertical="top"
            />
          </View>

          {/* ── Section 4 : Workout ou Déroulé ── */}
          {estWorkout ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitre}>Workout</Text>

              {workout.map(bloc => {
                if (bloc.kind === 'etape') {
                  return (
                    <LigneEtape
                      key={bloc.cle}
                      etape={bloc}
                      onTap={() => ouvrirEtapeModal(bloc.cle, null)}
                      onSupprimer={() => supprimerBlocWk(bloc.cle)}
                    />
                  );
                }
                return (
                  <BoucleWorkoutCard
                    key={bloc.cle}
                    boucle={bloc}
                    onMajReps={n => majRepsWk(bloc.cle, n)}
                    onSupprimerEtape={etapeCle => supprimerEtapeEnBoucle(bloc.cle, etapeCle)}
                    onAjouterEtape={() => ajouterEtapeEnBoucle(bloc.cle)}
                    onSupprimerBoucle={() => supprimerBlocWk(bloc.cle)}
                    onOuvrirEtapeModal={cle => ouvrirEtapeModal(cle, bloc.cle)}
                  />
                );
              })}

              <View style={styles.workoutAjouterRow}>
                <TouchableOpacity style={styles.workoutAjouterBtn} onPress={ajouterEtapeWk}>
                  <Ionicons name="add" size={18} color={COULEURS.legend[500]} />
                  <Text style={styles.workoutAjouterTexte}>Ajouter une étape</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.workoutAjouterBtn} onPress={ajouterBoucleWk}>
                  <Ionicons name="repeat" size={18} color={COULEURS.legend[500]} />
                  <Text style={styles.workoutAjouterTexte}>Boucle de répétitions</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitre}>Déroulé</Text>
                  <TouchableOpacity style={styles.lienAjouter} onPress={ajouterEtape}>
                    <Ionicons name="add-circle-outline" size={16} color={COULEURS.legend[500]} />
                    <Text style={styles.lienAjouterTexte}>AJOUTER</Text>
                  </TouchableOpacity>
                </View>
                {etapes.length === 0 && (
                  <View style={styles.etatVideSection}>
                    <Text style={styles.etatVideTexte}>Planifie ta séance étape par étape — échauffement, corps de séance, retour au calme.</Text>
                  </View>
                )}
                {etapes.map((e, i) => (
                  <CarteEtapeSimple
                    key={e.cle} etape={e} numero={i + 1}
                    onMaj={majEtape} onSupprimer={supprimerEtape}
                    onOuvrirDureePicker={etapeCle => setActivePicker({ kind: 'etapeSimpleDuree', etapeCle })}
                  />
                ))}
              </View>

              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitre}>Groupes d'allure</Text>
                  <TouchableOpacity style={styles.lienAjouter} onPress={ajouterGroupe}>
                    <Ionicons name="people-outline" size={16} color={COULEURS.legend[500]} />
                    <Text style={styles.lienAjouterTexte}>AJOUTER</Text>
                  </TouchableOpacity>
                </View>
                {groupes.length === 0 && (
                  <View style={styles.etatVideSection}>
                    <Text style={styles.etatVideTexte}>Crée des groupes de vitesse — nomme-les, fixe les allures et écris les consignes.</Text>
                  </View>
                )}
                {groupes.map((g, i) => (
                  <CarteGroupe
                    key={g.cle} groupe={g} numero={i + 1}
                    onMaj={majGroupe} onSupprimer={supprimerGroupe}
                    onOuvrirAllure={(groupeCle, field) => setActivePicker({ kind: 'groupeAllure', groupeCle, field })}
                  />
                ))}
              </View>
            </>
          )}

          {erreur && (
            <View style={styles.erreurBox}>
              <Ionicons name="alert-circle-outline" size={16} color={COULEURS.danger} />
              <Text style={styles.erreurTexte}>{erreur}</Text>
            </View>
          )}

          <View style={{ height: ESPACEMENT['2xl'] }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity style={[styles.boutonPublier, chargement && styles.boutonDesactive]} onPress={handlePublier} disabled={chargement || preChargement} activeOpacity={0.85}>
          {chargement ? <ActivityIndicator color="#fff" /> : (
            <>
              <Ionicons name={modeEdition ? 'checkmark' : 'send'} size={18} color="#fff" />
              <Text style={styles.boutonPublierTexte}>{modeEdition ? 'Enregistrer les modifications' : 'Publier la session'}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  preChargementOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center', zIndex: 10 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: ESPACEMENT.md, paddingVertical: ESPACEMENT.sm, borderBottomWidth: 1, borderBottomColor: COULEURS.night[100] },
  boutonFermer: { width: 40, height: 40, borderRadius: RAYONS.full, alignItems: 'center', justifyContent: 'center' },
  headerTitre: { fontSize: 18, fontWeight: '700', color: COULEURS.night[700] },

  contenu: { paddingBottom: ESPACEMENT.lg },
  section: { paddingHorizontal: ESPACEMENT.md, paddingTop: ESPACEMENT.lg, paddingBottom: ESPACEMENT.sm, borderBottomWidth: 1, borderBottomColor: COULEURS.night[50] },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: ESPACEMENT.sm },
  sectionTitre: { fontSize: 18, fontWeight: '700', color: COULEURS.night[700], marginBottom: ESPACEMENT.sm },

  champContainer: { marginBottom: ESPACEMENT.sm },
  label: { fontSize: 14, fontWeight: '600', color: COULEURS.night[500], marginBottom: 6 },
  champ: { borderWidth: 1.5, borderColor: COULEURS.night[100], borderRadius: RAYONS.md, paddingHorizontal: ESPACEMENT.md, paddingVertical: 12, fontSize: 15, color: COULEURS.night[700], backgroundColor: COULEURS.night[50] },
  champMultiline: { height: 90, paddingTop: 12, textAlignVertical: 'top' },

  pillsRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: RAYONS.full, borderWidth: 1.5, borderColor: COULEURS.night[200], backgroundColor: '#fff' },
  pillActif: { backgroundColor: COULEURS.legend[500], borderColor: COULEURS.legend[500] },
  pillTexte: { fontSize: 13, fontWeight: '600', color: COULEURS.night[500] },
  pillTexteActif: { color: '#fff' },
  pillDotWorkout: { width: 6, height: 6, borderRadius: 3, backgroundColor: COULEURS.legend[400] },
  workoutBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: ESPACEMENT.sm, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: COULEURS.legend[50], borderRadius: RAYONS.md },
  workoutBadgeTexte: { fontSize: 12, color: COULEURS.legend[600], fontWeight: '500' },

  bentoRow: { flexDirection: 'row', gap: ESPACEMENT.sm, marginBottom: ESPACEMENT.sm },
  bentoCard: { backgroundColor: COULEURS.night[50], borderRadius: RAYONS.lg, padding: ESPACEMENT.sm },
  bentoLabel: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  bentoLabelTexte: { fontSize: 10, fontWeight: '700', color: COULEURS.night[400], letterSpacing: 0.5 },
  bentoInput: { fontSize: 16, fontWeight: '600', color: COULEURS.night[700], padding: 0 },
  lieuSuggestions: {
    marginTop: 8,
    borderRadius: RAYONS.md,
    borderWidth: 1,
    borderColor: COULEURS.night[100],
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  lieuSuggestionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: ESPACEMENT.sm,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: COULEURS.night[50],
  },
  lieuSuggestionTexte: {
    flex: 1,
    fontSize: 13,
    color: COULEURS.night[600],
    lineHeight: 17,
  },
  lieuMapsLien: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  lieuMapsLienTexte: {
    fontSize: 12,
    fontWeight: '600',
    color: COULEURS.info,
  },
  bentoValeur: { fontSize: 16, fontWeight: '600', color: COULEURS.night[700] },
  bentoValeurRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bentoPlaceholder: { fontSize: 14, color: COULEURS.night[300], fontStyle: 'italic' },

  lienAjouter: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lienAjouterTexte: { fontSize: 11, fontWeight: '700', color: COULEURS.legend[500], letterSpacing: 0.3 },

  etatVideSection: { backgroundColor: COULEURS.night[50], borderRadius: RAYONS.lg, padding: ESPACEMENT.md, marginBottom: ESPACEMENT.sm },
  etatVideTexte: { fontSize: 13, color: COULEURS.night[400], lineHeight: 19, fontStyle: 'italic' },

  // Workout
  etapeWkCard: { borderLeftWidth: 3, borderRadius: 6, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, backgroundColor: '#fff', marginBottom: ESPACEMENT.sm, padding: ESPACEMENT.sm, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  etapeWkCardCompact: { marginLeft: ESPACEMENT.sm, marginBottom: 6 },

  etapeWkTypeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  etapeTypePills: { flexDirection: 'row', gap: 5, flex: 1 },
  etapeTypePill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: RAYONS.full, backgroundColor: COULEURS.night[50] },
  etapeTypePillTexte: { fontSize: 11, fontWeight: '600', color: COULEURS.night[400] },
  etapeAutreInput: {
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: COULEURS.night[200],
    borderRadius: RAYONS.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    fontWeight: '600',
    color: COULEURS.night[700],
    backgroundColor: COULEURS.night[50],
  },

  etapeWkDureeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  dureeToggle: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RAYONS.full, borderWidth: 1, borderColor: COULEURS.night[200] },
  dureeToggleActif: { backgroundColor: COULEURS.night[700], borderColor: COULEURS.night[700] },
  dureeToggleTexte: { fontSize: 11, fontWeight: '600', color: COULEURS.night[400] },
  dureeToggleTexteActif: { color: '#fff' },
  dureeValeurBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: COULEURS.night[50], borderRadius: RAYONS.md },
  dureeValeurTexte: { fontSize: 14, fontWeight: '600', color: COULEURS.night[700] },
  etapeWkUnite: { fontSize: 11, color: COULEURS.night[400] },

  etapeWkAllureRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  etapeWkTiret: { fontSize: 14, color: COULEURS.night[400] },
  allurePickerBtn: { paddingHorizontal: 8, paddingVertical: 3, backgroundColor: COULEURS.legend[50], borderRadius: RAYONS.sm },
  allurePickerTexte: { fontSize: 14, fontWeight: '600', color: COULEURS.legend[600] },
  ajouterAllureBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4 },
  ajouterAllureBtnTexte: { fontSize: 12, color: COULEURS.legend[500], fontWeight: '600' },

  boucleCard: { backgroundColor: COULEURS.legend[50], borderRadius: RAYONS.lg, padding: ESPACEMENT.sm, marginBottom: ESPACEMENT.sm, borderWidth: 1, borderColor: COULEURS.legend[100] },
  boucleHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  boucleHeaderGauche: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  boucleHeaderTexte: { fontSize: 14, fontWeight: '700', color: COULEURS.legend[600] },
  repsBtn: { width: 26, height: 26, borderRadius: RAYONS.full, backgroundColor: COULEURS.legend[100], alignItems: 'center', justifyContent: 'center' },
  repsValeur: { minWidth: 28, alignItems: 'center' },
  repsTexte: { fontSize: 18, fontWeight: '700', color: COULEURS.legend[600] },
  boucleEtapes: { gap: 6 },
  ajouterEtapeBoucle: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingLeft: ESPACEMENT.sm },
  ajouterEtapeBoucleTexte: { fontSize: 12, color: COULEURS.legend[500], fontWeight: '600' },

  workoutAjouterRow: { flexDirection: 'row', gap: ESPACEMENT.sm, marginTop: ESPACEMENT.sm },
  workoutAjouterBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: RAYONS.full, borderWidth: 1.5, borderColor: COULEURS.legend[300], backgroundColor: COULEURS.legend[50] },
  workoutAjouterTexte: { fontSize: 13, fontWeight: '600', color: COULEURS.legend[600] },

  // Garmin-style compact rows
  ligneEtape: {
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 4,
    borderRadius: 8,
    backgroundColor: '#fff',
    marginBottom: 6,
    paddingHorizontal: ESPACEMENT.sm,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  ligneEtapeInBoucle: { marginBottom: 4, marginHorizontal: 0 },
  ligneEtapeCorps: { flex: 1, gap: 3 },
  ligneEtapeNom: { fontSize: 15, fontWeight: '700', color: COULEURS.night[700] },
  ligneEtapeSous: { fontSize: 12, color: COULEURS.night[400] },
  ligneEtapeActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  // Boucle compact
  boucleRepsBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: COULEURS.legend[50], borderRadius: RAYONS.full },
  boucleRepsTxt: { fontSize: 14, fontWeight: '700', color: COULEURS.legend[600] },
  boucleSousEtapes: { gap: 4, marginTop: 6 },

  // ─ Déroulé étapes (redesign)
  carteEtape: {
    backgroundColor: '#fff', borderLeftWidth: 4, borderRadius: 12,
    borderTopLeftRadius: 0, borderBottomLeftRadius: 0,
    marginBottom: ESPACEMENT.sm, padding: ESPACEMENT.md,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  carteEtapeHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  carteEtapeNum: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  carteEtapeNumTxt: { fontSize: 13, fontWeight: '700' },
  carteEtapeTitre: { flex: 1, fontSize: 15, fontWeight: '600', color: COULEURS.night[700], padding: 0 },
  carteEtapeCorps: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  carteEtapeDureeBox: { flexDirection: 'row', alignItems: 'center', borderRadius: RAYONS.md, paddingHorizontal: 8, paddingVertical: 4, gap: 3 },
  carteEtapeDureeVal: { fontSize: 14, fontWeight: '700', textAlign: 'center', padding: 0 },
  carteEtapeDureeUnite: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginTop: -2 },
  carteEtapeDesc: { flex: 1, fontSize: 13, color: COULEURS.night[500], padding: 0, lineHeight: 18, marginTop: 4 },

  // ─ Groupes d'allure (redesign)
  carteGroupe: {
    backgroundColor: '#fff', borderRadius: RAYONS.lg, marginBottom: ESPACEMENT.sm,
    padding: ESPACEMENT.md,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 1,
    borderWidth: 1, borderColor: COULEURS.night[100],
  },
  carteGroupeHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  carteGroupeNum: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  carteGroupeNumTxt: { fontSize: 13, fontWeight: '700', color: '#fff' },
  carteGroupeNom: { flex: 1, fontSize: 15, fontWeight: '600', color: COULEURS.night[700], padding: 0 },
  carteGroupeAllureRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, backgroundColor: COULEURS.night[50], borderRadius: RAYONS.md, paddingHorizontal: 12, paddingVertical: 10 },
  carteGroupeAllureLabel: { fontSize: 12, color: COULEURS.night[400], fontWeight: '600' },
  carteGroupeAllureBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: COULEURS.legend[50], borderRadius: RAYONS.sm, paddingHorizontal: 10, paddingVertical: 5 },
  carteGroupeAllureTxt: { fontSize: 15, fontWeight: '700', color: COULEURS.legend[600] },
  carteGroupeAllureFleche: { fontSize: 14, color: COULEURS.night[400] },
  carteGroupeConsignes: { fontSize: 13, color: COULEURS.night[500], borderTopWidth: 1, borderTopColor: COULEURS.night[100], paddingTop: 10, paddingHorizontal: 0, minHeight: 36, textAlignVertical: 'top' },

  erreurBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFF0F0', borderRadius: RAYONS.md, padding: ESPACEMENT.sm, marginHorizontal: ESPACEMENT.md, marginTop: ESPACEMENT.sm },
  erreurTexte: { flex: 1, fontSize: 13, color: COULEURS.danger },

  footer: { padding: ESPACEMENT.md, paddingBottom: Platform.OS === 'ios' ? ESPACEMENT.lg : ESPACEMENT.md, borderTopWidth: 1, borderTopColor: COULEURS.night[100], backgroundColor: '#fff' },
  boutonPublier: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COULEURS.legend[500], borderRadius: RAYONS.full, paddingVertical: 16 },
  boutonDesactive: { opacity: 0.7 },
  boutonPublierTexte: { color: '#fff', fontSize: 16, fontWeight: '700' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  calModal: { backgroundColor: '#fff', borderRadius: RAYONS.xl, padding: ESPACEMENT.lg, width: 320, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 10 },
  calHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: ESPACEMENT.md },
  calNavBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: RAYONS.full, backgroundColor: COULEURS.night[50] },
  calMoisTexte: { fontSize: 16, fontWeight: '700', color: COULEURS.night[700] },
  calSemaine: { flexDirection: 'row', marginBottom: 8 },
  calJourSemTexte: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600', color: COULEURS.night[400] },
  calGrille: { flexDirection: 'row', flexWrap: 'wrap' },
  calCase: { width: `${100/7}%` as any, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  calCaseSelectionnee: { backgroundColor: COULEURS.legend[500], borderRadius: RAYONS.full },
  calCaseAujourdhui: { borderWidth: 1.5, borderColor: COULEURS.legend[400], borderRadius: RAYONS.full },
  calJourTexte: { fontSize: 14, color: COULEURS.night[700] },
  calJourTexteSelectionnee: { color: '#fff', fontWeight: '700' },
  calJourTexteAujourdhui: { color: COULEURS.legend[500], fontWeight: '600' },
});
