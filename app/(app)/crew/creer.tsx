import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
import { useCrewStore } from '../../../src/stores/useCrewStore';

export default function CreerCrew() {
  const [nom, setNom] = useState('');
  const [ville, setVille] = useState('');
  const [description, setDescription] = useState('');
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [dejaCapitaine, setDejaCapitaine] = useState(false);

  const session = useAuthStore((s) => s.session);
  const creerCrew = useCrewStore((s) => s.creerCrew);

  useEffect(() => {
    if (!session?.user?.id) return;
    supabase
      .from('membres')
      .select('id')
      .eq('utilisateur_id', session.user.id)
      .eq('role', 'capitaine')
      .maybeSingle()
      .then(({ data }) => { if (data) setDejaCapitaine(true); });
  }, [session?.user?.id]);

  const handleCreer = async () => {
    setErreur(null);
    if (!nom.trim()) { setErreur('Donne un nom à ton crew'); return; }
    if (!ville.trim()) { setErreur('Indique la ville de ton crew'); return; }
    if (!session?.user?.id) { setErreur('Tu dois être connecté'); return; }

    setChargement(true);
    try {
      const crew = await creerCrew({
        nom,
        ville,
        description,
        capitaineId: session.user.id,
      });
      router.replace(`/crew/${crew.id}`);
    } catch (error: any) {
      setErreur(error.message || 'Impossible de créer le crew');
    } finally {
      setChargement(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.retour}>
          <Ionicons name="arrow-back" size={24} color={COULEURS.night[700]} />
        </TouchableOpacity>
        <Text style={styles.headerTitre}>Nouveau crew</Text>
        <View style={{ width: 40 }} />
      </View>

      {dejaCapitaine ? (
        <View style={styles.blocage}>
          <Ionicons name="shield-checkmark" size={48} color={COULEURS.legend[300]} />
          <Text style={styles.blocageTitre}>Tu es déjà capitaine</Text>
          <Text style={styles.blocageTexte}>
            Un compte ne peut être capitaine que d'un seul crew. Tu peux rejoindre d'autres crews en tant que membre.
          </Text>
          <TouchableOpacity style={styles.blocageBtn} onPress={() => router.replace('/crew/rejoindre' as any)}>
            <Ionicons name="enter-outline" size={18} color="#fff" />
            <Text style={styles.blocageBtnTexte}>Rejoindre un crew</Text>
          </TouchableOpacity>
        </View>
      ) : (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.contenu}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.bloc}>
            <Text style={styles.blocTitre}>Identité du crew</Text>

            <View style={styles.champContainer}>
              <Text style={styles.label}>Nom du crew *</Text>
              <TextInput
                style={styles.champ}
                value={nom}
                onChangeText={setNom}
                placeholder="Ex : Bastille Runners"
                placeholderTextColor={COULEURS.night[300]}
                autoCapitalize="words"
                maxLength={50}
              />
              <Text style={styles.compteur}>{nom.length}/50</Text>
            </View>

            <View style={styles.champContainer}>
              <Text style={styles.label}>Ville *</Text>
              <TextInput
                style={styles.champ}
                value={ville}
                onChangeText={setVille}
                placeholder="Ex : Paris"
                placeholderTextColor={COULEURS.night[300]}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.champContainer}>
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.champ, styles.champMultiline]}
                value={description}
                onChangeText={setDescription}
                placeholder="Parle de ton crew — allures, ambiance, fréquence des runs..."
                placeholderTextColor={COULEURS.night[300]}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                maxLength={300}
              />
              <Text style={styles.compteur}>{description.length}/300</Text>
            </View>
          </View>

          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={18} color={COULEURS.legend[500]} />
            <Text style={styles.infoTexte}>
              Un code d'invitation unique sera généré automatiquement pour inviter tes coéquipiers.
            </Text>
          </View>

          {erreur && (
            <View style={styles.erreurBox}>
              <Ionicons name="alert-circle-outline" size={16} color={COULEURS.danger} />
              <Text style={styles.erreurTexte}>{erreur}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.bouton, chargement && styles.boutonDesactive]}
            onPress={handleCreer}
            disabled={chargement}
            activeOpacity={0.85}
          >
            {chargement ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="people" size={20} color="#fff" />
                <Text style={styles.boutonTexte}>Créer mon crew</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: ESPACEMENT.md,
    paddingVertical: ESPACEMENT.sm,
    borderBottomWidth: 1,
    borderBottomColor: COULEURS.night[100],
  },
  retour: {
    width: 40,
    height: 40,
    borderRadius: RAYONS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitre: {
    fontSize: 18,
    fontWeight: '700',
    color: COULEURS.night[700],
  },
  contenu: {
    padding: ESPACEMENT.md,
    paddingBottom: ESPACEMENT['3xl'],
  },
  bloc: {
    marginBottom: ESPACEMENT.lg,
  },
  blocTitre: {
    fontSize: 20,
    fontWeight: '700',
    color: COULEURS.night[700],
    marginBottom: ESPACEMENT.md,
  },
  champContainer: {
    marginBottom: ESPACEMENT.md,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COULEURS.night[500],
    marginBottom: 6,
  },
  champ: {
    borderWidth: 1.5,
    borderColor: COULEURS.night[200],
    borderRadius: RAYONS.md,
    paddingHorizontal: ESPACEMENT.md,
    paddingVertical: 12,
    fontSize: 16,
    color: COULEURS.night[700],
    backgroundColor: '#fff',
  },
  champMultiline: {
    height: 100,
    paddingTop: 12,
  },
  compteur: {
    fontSize: 12,
    color: COULEURS.night[300],
    textAlign: 'right',
    marginTop: 4,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: COULEURS.legend[50],
    borderRadius: RAYONS.md,
    padding: ESPACEMENT.md,
    marginBottom: ESPACEMENT.lg,
  },
  infoTexte: {
    flex: 1,
    fontSize: 13,
    color: COULEURS.legend[700],
    lineHeight: 18,
  },
  erreurBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF0F0',
    borderRadius: RAYONS.md,
    padding: ESPACEMENT.sm,
    marginBottom: ESPACEMENT.sm,
  },
  erreurTexte: {
    flex: 1,
    fontSize: 13,
    color: COULEURS.danger,
  },
  blocage: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: ESPACEMENT.xl, gap: ESPACEMENT.md,
  },
  blocageTitre: { fontSize: 22, fontWeight: '800', color: COULEURS.night[700], textAlign: 'center' },
  blocageTexte: { fontSize: 15, color: COULEURS.night[400], textAlign: 'center', lineHeight: 22 },
  blocageBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COULEURS.legend[500], borderRadius: RAYONS.full,
    paddingVertical: 14, paddingHorizontal: 24, marginTop: ESPACEMENT.sm,
  },
  blocageBtnTexte: { fontSize: 15, fontWeight: '700', color: '#fff' },
  bouton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COULEURS.legend[500],
    borderRadius: RAYONS.full,
    paddingVertical: 16,
  },
  boutonDesactive: {
    opacity: 0.7,
  },
  boutonTexte: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
