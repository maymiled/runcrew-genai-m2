import { Stack, router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { enregistrerPushToken } from '../../src/lib/notifications';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { useProfilStore } from '../../src/stores/useProfilStore';

export default function LayoutApp() {
  const session = useAuthStore((s) => s.session);
  const chargerProfil = useProfilStore((s) => s.charger);
  const resetProfil = useProfilStore((s) => s.reset);

  useEffect(() => {
    if (session?.user?.id) {
      chargerProfil(session.user.id);
      enregistrerPushToken(session.user.id);
    } else {
      resetProfil();
    }
  }, [session?.user?.id]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.type === 'chat' && data?.crewId) {
        router.push(`/chat/${data.crewId}` as any);
      } else if (data?.sessionId) {
        router.push(`/session/${data.sessionId}` as any);
      }
    });
    return () => sub.remove();
  }, []);

  return <Stack screenOptions={{ headerShown: false }} />;
}
