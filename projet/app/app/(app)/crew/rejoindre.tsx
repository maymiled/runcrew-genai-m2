import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COULEURS, ESPACEMENT, RAYONS } from '../../../src/lib/constantes';
import { useCrewStore } from '../../../src/stores/useCrewStore';

const LONGUEUR_CODE = 6;

export default function RejoindreCrewScreen() {
  const [code, setCode] = useState('');
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  const rejoindreCrewParCode = useCrewStore((s) => s.rejoindreCrewParCode);

  const handleChangement = (val: string) => {
    const propre = val.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, LONGUEUR_CODE);
    setCode(propre);
    if (erreur) setErreur(null);
  };

  const handleRejoindre = async () => {
    if (code.length < LONGUEUR_CODE) {
      setErreur(`Le code fait exactement ${LONGUEUR_CODE} caractères.`);
      return;
    }
    setChargement(true);
    setErreur(null);
    try {
      const crewId = await rejoindreCrewParCode(code);
      router.replace(`/crew/${crewId}`);
    } catch (e: any) {
      setErreur(e.message || 'Impossible de rejoindre le crew.');
    } finally {
      setChargement(false);
    }
  };

  // Affiche le code sous forme de cases
  const cases = Array.from({ length: LONGUEUR_CODE }, (_, i) => code[i] ?? '');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.retour}>
          <Ionicons name="arrow-back" size={24} color={COULEURS.night[700]} />
        </TouchableOpacity>
        <Text style={styles.headerTitre}>Rejoindre un crew</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.corps}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.contenu}>
          {/* Icône */}
          <View style={styles.iconeContainer}>
            <Ionicons name="people" size={48} color={COULEURS.legend[500]} />
          </View>

          <Text style={styles.titre}>Saisis le code d'invitation</Text>
          <Text style={styles.sousTitre}>
            Demande le code à 6 caractères au capitaine de ton crew.
          </Text>

          {/* Cases de code */}
          <TouchableOpacity
            style={styles.casesContainer}
            activeOpacity={1}
            onPress={() => inputRef.current?.focus()}
          >
            {cases.map((char, i) => (
              <View
                key={i}
                style={[
                  styles.caseCode,
                  i < code.length && styles.caseRemplie,
                  i === code.length && styles.caseCourante,
                ]}
              >
                <Text style={styles.caseTexte}>{char}</Text>
              </View>
            ))}
          </TouchableOpacity>

          {/* Input caché qui reçoit la saisie */}
          <TextInput
            ref={inputRef}
            style={styles.inputCache}
            value={code}
            onChangeText={handleChangement}
            autoCapitalize="characters"
            autoCorrect={false}
            keyboardType="default"
            maxLength={LONGUEUR_CODE}
            autoFocus
          />

          {/* Erreur */}
          {erreur && (
            <View style={styles.erreurBox}>
              <Ionicons name="alert-circle-outline" size={16} color={COULEURS.danger} />
              <Text style={styles.erreurTexte}>{erreur}</Text>
            </View>
          )}

          {/* Bouton */}
          <TouchableOpacity
            style={[
              styles.bouton,
              (chargement || code.length < LONGUEUR_CODE) && styles.boutonDesactive,
            ]}
            onPress={handleRejoindre}
            disabled={chargement || code.length < LONGUEUR_CODE}
            activeOpacity={0.85}
          >
            {chargement ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="enter-outline" size={20} color="#fff" />
                <Text style={styles.boutonTexte}>Rejoindre</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
  corps: {
    flex: 1,
  },
  contenu: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: ESPACEMENT.xl,
    paddingTop: ESPACEMENT['3xl'],
  },
  iconeContainer: {
    width: 88,
    height: 88,
    borderRadius: RAYONS.full,
    backgroundColor: COULEURS.legend[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: ESPACEMENT.xl,
  },
  titre: {
    fontSize: 22,
    fontWeight: '700',
    color: COULEURS.night[700],
    textAlign: 'center',
    marginBottom: ESPACEMENT.sm,
  },
  sousTitre: {
    fontSize: 14,
    color: COULEURS.night[400],
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: ESPACEMENT['2xl'],
  },
  casesContainer: {
    flexDirection: 'row',
    gap: ESPACEMENT.sm,
    marginBottom: ESPACEMENT.lg,
  },
  caseCode: {
    width: 44,
    height: 54,
    borderWidth: 1.5,
    borderColor: COULEURS.night[200],
    borderRadius: RAYONS.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COULEURS.night[50],
  },
  caseRemplie: {
    borderColor: COULEURS.legend[400],
    backgroundColor: COULEURS.legend[50],
  },
  caseCourante: {
    borderColor: COULEURS.legend[500],
    borderWidth: 2,
    backgroundColor: '#fff',
  },
  caseTexte: {
    fontSize: 22,
    fontWeight: '700',
    color: COULEURS.night[700],
    letterSpacing: 1,
  },
  inputCache: {
    position: 'absolute',
    opacity: 0,
    width: 1,
    height: 1,
  },
  erreurBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF0F0',
    borderRadius: RAYONS.md,
    padding: ESPACEMENT.sm,
    marginBottom: ESPACEMENT.md,
    width: '100%',
  },
  erreurTexte: {
    flex: 1,
    fontSize: 13,
    color: COULEURS.danger,
  },
  bouton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COULEURS.legend[500],
    borderRadius: RAYONS.full,
    paddingVertical: 16,
    width: '100%',
    marginTop: ESPACEMENT.md,
  },
  boutonDesactive: {
    opacity: 0.5,
  },
  boutonTexte: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
