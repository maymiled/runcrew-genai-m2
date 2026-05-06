import { StyleSheet, Text, View } from 'react-native';
import { COULEURS } from '../../../src/lib/constantes';

export default function Accueil() {
  return (
    <View style={styles.container}>
      <Text style={styles.titre}>Accueil</Text>
      <Text style={styles.texte}>Tes prochaines sessions apparaîtront ici</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  titre: { fontSize: 24, fontWeight: '700', color: COULEURS.night[700] },
  texte: { fontSize: 14, color: COULEURS.night[400], marginTop: 8 },
});