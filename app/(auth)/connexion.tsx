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
import { supabase } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/stores/useAuthStore';

export default function Connexion() {
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [chargement, setChargement] = useState(false);
  const seConnecter = useAuthStore((s) => s.seConnecter);

  const handleConnexion = async () => {
    if (!email || !motDePasse) {
      Alert.alert('Erreur', 'Remplis tous les champs');
      return;
    }

    setChargement(true);
    try {
      await seConnecter(email.trim().toLowerCase(), motDePasse);
    } catch (error: any) {
      Alert.alert('Erreur de connexion', error.message || 'Une erreur est survenue');
    } finally {
      setChargement(false);
    }
  };

  const reinitialiserMotDePasse = async () => {
    if (!email) {
      Alert.alert('Email requis', 'Entre ton adresse email d\'abord.');
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: 'runcrew://reset-password',
    });
    if (error) {
      const msg = error.message.includes('rate limit')
        ? 'Trop de demandes. Attends quelques minutes avant de réessayer.'
        : error.message.includes('not found') || error.message.includes('user')
        ? 'Aucun compte trouvé avec cet email.'
        : 'Impossible d\'envoyer l\'email. Réessaie dans quelques instants.';
      Alert.alert('Erreur', msg);
    } else {
      Alert.alert('Email envoyé', `Un lien de réinitialisation a été envoyé à ${email.trim().toLowerCase()}.`);
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
          <Text style={styles.titre}>Connexion</Text>

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
              placeholder="••••••••"
              placeholderTextColor={COULEURS.night[300]}
              secureTextEntry
            />
          </View>

          <TouchableOpacity
            style={[styles.bouton, chargement && styles.boutonDesactive]}
            onPress={handleConnexion}
            disabled={chargement}
          >
            {chargement ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.boutonTexte}>Se connecter</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.motDePasseOublie}
            onPress={reinitialiserMotDePasse}
          >
            <Text style={styles.motDePasseOublieTexte}>Mot de passe oublié ?</Text>
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerTexte}>Pas encore de compte ? </Text>
            <Link href="/(auth)/inscription" asChild>
              <TouchableOpacity>
                <Text style={styles.footerLien}>S'inscrire</Text>
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
  motDePasseOublie: {
    alignItems: 'center',
    marginTop: 12,
    paddingVertical: 4,
  },
  motDePasseOublieTexte: {
    fontSize: 14,
    color: COULEURS.legend[500],
    fontWeight: '500',
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