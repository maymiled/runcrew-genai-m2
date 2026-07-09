import { Link } from 'expo-router';
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
import { useAuthStore } from '../../src/stores/useAuthStore';

export default function Inscription() {
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [chargement, setChargement] = useState(false);
  const sInscrire = useAuthStore((s) => s.sInscrire);

  const handleInscription = async () => {
    if (!nom || !email || !motDePasse) {
      Alert.alert('Erreur', 'Remplis tous les champs');
      return;
    }

    if (motDePasse.length < 8) {
      Alert.alert('Erreur', 'Le mot de passe doit faire au moins 8 caractères');
      return;
    }

    setChargement(true);
    try {
      await sInscrire(email.trim().toLowerCase(), motDePasse, nom.trim());
      Alert.alert(
        'Inscription réussie',
        'Vérifie ta boîte mail pour confirmer ton compte, puis connecte-toi.'
      );
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Une erreur est survenue');
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
          <Text style={styles.titre}>Inscription</Text>

          <View style={styles.champContainer}>
            <Text style={styles.label}>Prénom ou pseudo</Text>
            <TextInput
              style={styles.champ}
              value={nom}
              onChangeText={setNom}
              placeholder="Ex: Giuliano"
              placeholderTextColor={COULEURS.night[300]}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.champContainer}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.champ}
              value={email}
              onChangeText={setEmail}
              placeholder="ton@email.com"
              placeholderTextColor={COULEURS.night[300]}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.champContainer}>
            <Text style={styles.label}>Mot de passe</Text>
            <TextInput
              style={styles.champ}
              value={motDePasse}
              onChangeText={setMotDePasse}
              placeholder="8 caractères minimum"
              placeholderTextColor={COULEURS.night[300]}
              secureTextEntry
            />
          </View>

          <TouchableOpacity
            style={[styles.bouton, chargement && styles.boutonDesactive]}
            onPress={handleInscription}
            disabled={chargement}
          >
            {chargement ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.boutonTexte}>Créer mon compte</Text>
            )}
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerTexte}>Déjà un compte ? </Text>
            <Link href="/(auth)/connexion" asChild>
              <TouchableOpacity>
                <Text style={styles.footerLien}>Se connecter</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  contenu: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logo: {
    fontSize: 40,
    fontWeight: '800',
    color: COULEURS.legend[500],
  },
  slogan: {
    fontSize: 16,
    color: COULEURS.night[400],
    marginTop: 8,
    fontStyle: 'italic',
  },
  formulaire: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  titre: {
    fontSize: 24,
    fontWeight: '700',
    color: COULEURS.night[700],
    marginBottom: 24,
  },
  champContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: COULEURS.night[500],
    marginBottom: 6,
  },
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
  bouton: {
    backgroundColor: COULEURS.legend[500],
    borderRadius: 9999,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  boutonDesactive: {
    opacity: 0.7,
  },
  boutonTexte: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  footerTexte: {
    fontSize: 14,
    color: COULEURS.night[400],
  },
  footerLien: {
    fontSize: 14,
    fontWeight: '600',
    color: COULEURS.legend[500],
  },
});