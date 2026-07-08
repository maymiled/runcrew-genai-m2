import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { COULEURS } from '../../src/lib/constantes';
import { supabase } from '../../src/lib/supabase';

export default function ResetPassword() {
  const { access_token, refresh_token } = useLocalSearchParams<{
    access_token?: string;
    refresh_token?: string;
  }>();

  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [chargement, setChargement] = useState(false);
  const [afficherMdp, setAfficherMdp] = useState(false);

  const handleReset = async () => {
    if (motDePasse.length < 8) {
      Alert.alert('Erreur', 'Le mot de passe doit faire au moins 8 caractères.');
      return;
    }
    if (motDePasse !== confirmation) {
      Alert.alert('Erreur', 'Les mots de passe ne correspondent pas.');
      return;
    }

    setChargement(true);
    try {
      // Établir la session avec les tokens du lien email
      if (access_token && refresh_token) {
        const { error: errSession } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        if (errSession) throw errSession;
      }

      const { error } = await supabase.auth.updateUser({ password: motDePasse });
      if (error) throw error;

      await supabase.auth.signOut();
      Alert.alert(
        'Mot de passe mis à jour',
        'Connecte-toi avec ton nouveau mot de passe.',
        [{ text: 'OK', onPress: () => router.replace('/(auth)/connexion') }]
      );
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible de mettre à jour le mot de passe.');
    } finally {
      setChargement(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.contenu}>
        <View style={styles.header}>
          <Text style={styles.logo}>RunCrew</Text>
          <Text style={styles.slogan}>Construis ta légende.</Text>
        </View>

        <View style={styles.formulaire}>
          <Text style={styles.titre}>Nouveau mot de passe</Text>
          <Text style={styles.sousTitre}>
            Choisis un mot de passe sécurisé d'au moins 8 caractères.
          </Text>

          <View style={styles.champContainer}>
            <Text style={styles.label}>Nouveau mot de passe</Text>
            <View style={styles.champAvecOeil}>
              <TextInput
                style={styles.champ}
                value={motDePasse}
                onChangeText={setMotDePasse}
                placeholder="••••••••"
                placeholderTextColor={COULEURS.night[300]}
                secureTextEntry={!afficherMdp}
                autoFocus
              />
              <TouchableOpacity
                style={styles.oeilBtn}
                onPress={() => setAfficherMdp(!afficherMdp)}
              >
                <Ionicons
                  name={afficherMdp ? 'eye-off' : 'eye'}
                  size={20}
                  color={COULEURS.night[400]}
                />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.champContainer}>
            <Text style={styles.label}>Confirmer le mot de passe</Text>
            <TextInput
              style={styles.champ}
              value={confirmation}
              onChangeText={setConfirmation}
              placeholder="••••••••"
              placeholderTextColor={COULEURS.night[300]}
              secureTextEntry={!afficherMdp}
            />
          </View>

          <TouchableOpacity
            style={[styles.bouton, chargement && styles.boutonDesactive]}
            onPress={handleReset}
            disabled={chargement}
          >
            {chargement ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.boutonTexte}>Mettre à jour</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.retour}
            onPress={() => router.replace('/(auth)/connexion')}
          >
            <Text style={styles.retourTexte}>Retour à la connexion</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  contenu: { flex: 1, justifyContent: 'center', paddingHorizontal: 32 },
  header: { alignItems: 'center', marginBottom: 48 },
  logo: { fontSize: 40, fontWeight: '800', color: COULEURS.legend[500] },
  slogan: { fontSize: 16, color: COULEURS.night[400], marginTop: 8, fontStyle: 'italic' },
  formulaire: { width: '100%', maxWidth: 400, alignSelf: 'center' },
  titre: { fontSize: 24, fontWeight: '700', color: COULEURS.night[700], marginBottom: 8 },
  sousTitre: {
    fontSize: 14,
    color: COULEURS.night[400],
    marginBottom: 24,
    lineHeight: 20,
  },
  champContainer: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '500', color: COULEURS.night[500], marginBottom: 6 },
  champ: {
    borderWidth: 1.5,
    borderColor: COULEURS.night[200],
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: COULEURS.night[700],
    backgroundColor: '#fff',
  },
  champAvecOeil: { position: 'relative' },
  oeilBtn: { position: 'absolute', right: 14, top: 13 },
  bouton: {
    backgroundColor: COULEURS.legend[500],
    borderRadius: 9999,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  boutonDesactive: { opacity: 0.7 },
  boutonTexte: { color: '#fff', fontSize: 16, fontWeight: '600' },
  retour: { alignItems: 'center', marginTop: 16, paddingVertical: 4 },
  retourTexte: { fontSize: 14, color: COULEURS.legend[500], fontWeight: '500' },
});
