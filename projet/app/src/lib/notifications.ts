import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function demanderPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function enregistrerPushToken(userId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  const autorise = await demanderPermissions();
  if (!autorise) return;
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    if (token) {
      await supabase.from('profils').update({ expo_push_token: token }).eq('id', userId);
    }
  } catch {}
}

export async function planifierRappelSession(params: {
  sessionId: string;
  titre: string;
  heureRdv: string;
  pointRdv?: string | null;
}): Promise<void> {
  if (Platform.OS === 'web') return;
  const autorise = await demanderPermissions();
  if (!autorise) return;
  try {
    const pref = await SecureStore.getItemAsync('pref_notif_session');
    if (pref === 'false') return;
  } catch {}

  const rdv = new Date(params.heureRdv);
  const maintenant = new Date();

  // Annule tout rappel existant pour cette session
  await annulerRappelSession(params.sessionId);

  // Rappel J-1 à 20h
  const veille = new Date(rdv);
  veille.setDate(veille.getDate() - 1);
  veille.setHours(20, 0, 0, 0);
  if (veille > maintenant) {
    await Notifications.scheduleNotificationAsync({
      identifier: `session-veille-${params.sessionId}`,
      content: {
        title: 'Session demain 🏃',
        body: `${params.titre}${params.pointRdv ? ` · ${params.pointRdv}` : ''}`,
        data: { sessionId: params.sessionId },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: veille },
    });
  }

  // Rappel 1h avant
  const unHeureAvant = new Date(rdv.getTime() - 60 * 60 * 1000);
  if (unHeureAvant > maintenant) {
    await Notifications.scheduleNotificationAsync({
      identifier: `session-1h-${params.sessionId}`,
      content: {
        title: "C'est dans 1 heure ! 🔥",
        body: `${params.titre}${params.pointRdv ? ` · ${params.pointRdv}` : ''}`,
        data: { sessionId: params.sessionId },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: unHeureAvant },
    });
  }
}

export async function annulerRappelSession(sessionId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.cancelScheduledNotificationAsync(`session-veille-${sessionId}`).catch(() => {});
  await Notifications.cancelScheduledNotificationAsync(`session-1h-${sessionId}`).catch(() => {});
}

export async function annulerTousLesRappels(): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}

// Cache en mémoire de la préférence (SecureStore async → lu une seule fois)
let _prefNotifChat: boolean | null = null;

export function setPrefNotifChatCache(val: boolean) {
  _prefNotifChat = val;
}

export async function notifierNouveauMessage(params: {
  crewId: string;
  crewNom: string;
  nomAuteur: string;
  contenu: string;
}): Promise<void> {
  if (Platform.OS === 'web') return;

  // Préférence en cache — lecture SecureStore seulement au premier appel
  if (_prefNotifChat === null) {
    try {
      const pref = await SecureStore.getItemAsync('pref_notif_chat');
      _prefNotifChat = pref !== 'false';
    } catch {
      _prefNotifChat = true;
    }
  }
  if (!_prefNotifChat) return;

  // getPermissionsAsync est rapide (vérification locale, pas de dialog)
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: params.crewNom,
      body: `${params.nomAuteur} : ${params.contenu}`,
      data: { crewId: params.crewId, type: 'chat' },
    },
    trigger: null,
  });
}
