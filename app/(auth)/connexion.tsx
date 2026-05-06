import { StyleSheet, Text, View } from 'react-native';
import { COULEURS } from '../../src/lib/constantes';

export default function Connexion() {
  return (
    <View style={styles.container}>
      <Text style={styles.titre}>RunCrew</Text>
      <Text style={styles.sousTitre}>Connexion — à construire étape 7</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  titre: {
    fontSize: 32,
    fontWeight: '800',
    color: COULEURS.legend[500],
  },
  sousTitre: {
    fontSize: 14,
    color: COULEURS.night[400],
    marginTop: 8,
  },
});