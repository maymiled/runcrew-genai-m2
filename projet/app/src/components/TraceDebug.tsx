import { View, Text, StyleSheet } from 'react-native';
import { COULEURS, ESPACEMENT, RAYONS, POLICES } from '../lib/constantes';
import { EvenementDebug } from '../stores/useCoachStore';

type Props = {
  evenements: EvenementDebug[];
  enCours: boolean;
};

// Timeline live du raisonnement de l'agent -- le raisonnement entre les étapes,
// chaque appel d'outil avec ses arguments, et chaque sortie d'outil. Alimentée
// par polling rapide (voir useCoachStore.genererPlanDebug) mais rendue comme un
// flux qui se construit event par event, à l'identique d'un vrai streaming.
export default function TraceDebug({ evenements, enCours }: Props) {
  if (!evenements.length && !enCours) return null;

  return (
    <View style={styles.conteneur}>
      <Text style={styles.titre}>MODE DEBUG — ce que Kipper fait, en direct</Text>
      {evenements.map((ev, i) => (
        <LigneEvenement key={i} ev={ev} />
      ))}
      {enCours && (
        <View style={styles.ligne}>
          <Text style={styles.puce}>…</Text>
          <Text style={styles.texteEnCours}>Kipper réfléchit…</Text>
        </View>
      )}
    </View>
  );
}

function LigneEvenement({ ev }: { ev: EvenementDebug }) {
  switch (ev.type) {
    case 'reasoning':
      return (
        <View style={styles.ligne}>
          <Text style={styles.puce}>💭</Text>
          <Text style={styles.texteRaisonnement}>{ev.text}</Text>
        </View>
      );
    case 'tool_call':
      return (
        <View style={styles.ligne}>
          <Text style={styles.puce}>⚙️</Text>
          <Text style={styles.texteAppel}>
            {ev.tool}({JSON.stringify(ev.input)})
          </Text>
        </View>
      );
    case 'tool_result':
      return (
        <View style={styles.ligne}>
          <Text style={styles.puce}>{ev.is_error ? '⚠️' : '✅'}</Text>
          <Text
            style={[styles.texteResultat, ev.is_error && styles.texteErreur]}
            numberOfLines={4}
          >
            {ev.output}
          </Text>
        </View>
      );
    case 'error':
      return (
        <View style={styles.ligne}>
          <Text style={styles.puce}>❌</Text>
          <Text style={styles.texteErreur}>{ev.message}</Text>
        </View>
      );
    default:
      // 'final' -- le brouillon prend le relais ailleurs dans l'écran, rien à
      // afficher ici pour ne pas dupliquer l'info.
      return null;
  }
}

const styles = StyleSheet.create({
  conteneur: {
    backgroundColor: COULEURS.night[700],
    borderRadius: RAYONS.md,
    padding: ESPACEMENT.md,
    marginTop: ESPACEMENT.md,
    gap: ESPACEMENT.sm,
  },
  titre: {
    color: COULEURS.volt[400],
    fontFamily: POLICES.mono,
    fontSize: 11,
    letterSpacing: 0.5,
    marginBottom: ESPACEMENT.xs,
  },
  ligne: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ESPACEMENT.xs,
  },
  puce: { fontSize: 13, lineHeight: 18 },
  texteRaisonnement: {
    flex: 1,
    color: COULEURS.night[100],
    fontFamily: POLICES.corps,
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  texteAppel: {
    flex: 1,
    color: COULEURS.volt[300],
    fontFamily: POLICES.mono,
    fontSize: 12,
    lineHeight: 17,
  },
  texteResultat: {
    flex: 1,
    color: COULEURS.night[200],
    fontFamily: POLICES.mono,
    fontSize: 11,
    lineHeight: 16,
  },
  texteErreur: {
    color: COULEURS.danger,
  },
  texteEnCours: {
    color: COULEURS.night[300],
    fontFamily: POLICES.corps,
    fontSize: 13,
    fontStyle: 'italic',
  },
});
