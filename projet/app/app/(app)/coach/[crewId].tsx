import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TraceDebug from '../../../src/components/TraceDebug';
import { COULEURS, ESPACEMENT, RAYONS } from '../../../src/lib/constantes';
import { useCoachStore } from '../../../src/stores/useCoachStore';

const SUGGESTIONS = [
  'Fractionné 45 min, focus seuil, groupe mixte',
  'Footing tranquille 40 min pour tout le monde',
  'Sortie longue 1h30, allure fondamentale',
];

function KipperBadge({ taille = 56 }: { taille?: number }) {
  return (
    <View style={[styles.kipperBadgeExterne, { width: taille, height: taille, borderRadius: taille / 2 }]}>
      <View
        style={[
          styles.kipperBadgeInterne,
          { width: taille - 12, height: taille - 12, borderRadius: (taille - 12) / 2 },
        ]}
      >
        <Ionicons name="flash" size={taille * 0.42} color="#fff" />
      </View>
    </View>
  );
}

export default function PageCoachIA() {
  const { crewId } = useLocalSearchParams<{ crewId: string }>();
  const [brief, setBrief] = useState('');
  const {
    chargement,
    erreur,
    genererPlan,
    genererPlanDebug,
    modeDebug,
    toggleModeDebug,
    evenementsDebug,
    enCoursDebug,
  } = useCoachStore();

  async function handleGenerer() {
    if (!crewId || !brief.trim()) return;
    try {
      if (modeDebug) {
        await genererPlanDebug(crewId, brief.trim());
      } else {
        await genererPlan(crewId, brief.trim());
      }
      router.push(`/coach/brouillon?crewId=${crewId}` as any);
    } catch {
      // erreur déjà affichée via le store
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.boutonRetour} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={COULEURS.night[700]} />
        </TouchableOpacity>
        <Text style={styles.headerTitre}>Coach Kipper</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
          <View style={styles.introBloc}>
            <KipperBadge />
            <Text style={styles.introTitre}>Salut, c'est Kipper 👋</Text>
            <Text style={styles.introTexte}>
              Décris la séance que tu veux, je lis les allures réelles de ton crew et je te propose un
              déroulé complet avec des groupes d'allure adaptés. Tu valides avant que ça parte.
            </Text>
          </View>

          <TextInput
            style={styles.input}
            placeholder="Ex : séance fractionné 45 min, focus seuil, groupe mixte"
            placeholderTextColor={COULEURS.night[300]}
            value={brief}
            onChangeText={setBrief}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
          />

          <View style={styles.suggestions}>
            {SUGGESTIONS.map((s) => (
              <TouchableOpacity key={s} style={styles.suggestionChip} onPress={() => setBrief(s)}>
                <Text style={styles.suggestionTexte}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.toggleDebugLigne}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleDebugTitre}>Mode debug</Text>
              <Text style={styles.toggleDebugSousTitre}>
                Voir le raisonnement de Kipper et ses appels d'outils en direct
              </Text>
            </View>
            <Switch
              value={modeDebug}
              onValueChange={toggleModeDebug}
              trackColor={{ false: COULEURS.night[200], true: COULEURS.legend[400] }}
              thumbColor="#fff"
            />
          </View>

          {modeDebug && <TraceDebug evenements={evenementsDebug} enCours={enCoursDebug} />}

          {erreur && (
            <View style={styles.erreurBloc}>
              <Ionicons name="alert-circle" size={18} color={COULEURS.danger} />
              <Text style={styles.erreurTexte}>{erreur}</Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.barreAction}>
          <TouchableOpacity
            style={[styles.boutonGenerer, (!brief.trim() || chargement) && styles.boutonDesactive]}
            onPress={handleGenerer}
            disabled={!brief.trim() || chargement}
            activeOpacity={0.85}
          >
            {chargement ? (
              <>
                <ActivityIndicator color="#fff" />
                <Text style={styles.boutonGenererTexte}>Kipper réfléchit...</Text>
              </>
            ) : (
              <>
                <Ionicons name="flash" size={18} color="#fff" />
                <Text style={styles.boutonGenererTexte}>Demander à Kipper</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
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

  contenu: { padding: ESPACEMENT.md, gap: ESPACEMENT.md, paddingBottom: ESPACEMENT.xl },

  introBloc: { alignItems: 'center', gap: 6, paddingVertical: ESPACEMENT.md },
  kipperBadgeExterne: {
    backgroundColor: COULEURS.volt[300],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  kipperBadgeInterne: {
    backgroundColor: COULEURS.legend[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  introTitre: { fontSize: 18, fontWeight: '700', color: COULEURS.night[700], textAlign: 'center' },
  introTexte: { fontSize: 14, color: COULEURS.night[400], textAlign: 'center', lineHeight: 20 },

  input: {
    borderWidth: 1,
    borderColor: COULEURS.night[200],
    borderRadius: RAYONS.lg,
    padding: ESPACEMENT.md,
    fontSize: 15,
    color: COULEURS.night[700],
    minHeight: 120,
  },

  suggestions: { gap: 8 },
  suggestionChip: {
    backgroundColor: COULEURS.night[50],
    borderRadius: RAYONS.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  suggestionTexte: { fontSize: 13, color: COULEURS.night[500] },

  toggleDebugLigne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ESPACEMENT.sm,
    backgroundColor: COULEURS.night[50],
    borderRadius: RAYONS.md,
    padding: ESPACEMENT.sm,
  },
  toggleDebugTitre: { fontSize: 14, fontWeight: '700', color: COULEURS.night[700] },
  toggleDebugSousTitre: { fontSize: 12, color: COULEURS.night[400], marginTop: 2 },

  erreurBloc: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderRadius: RAYONS.md,
    padding: ESPACEMENT.sm,
  },
  erreurTexte: { flex: 1, fontSize: 13, color: COULEURS.danger },

  barreAction: {
    padding: ESPACEMENT.md,
    borderTopWidth: 1,
    borderTopColor: COULEURS.night[100],
    backgroundColor: '#fff',
  },
  boutonGenerer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COULEURS.legend[500],
    borderRadius: RAYONS.full,
    paddingVertical: 14,
  },
  boutonDesactive: { opacity: 0.5 },
  boutonGenererTexte: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
