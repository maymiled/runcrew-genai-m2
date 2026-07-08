import * as Notifications from 'expo-notifications';
import { router, Slot, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { Linking } from 'react-native';
import { supabase } from '../src/lib/supabase';
import { useAuthStore } from '../src/stores/useAuthStore';
import { demanderPermissions } from '../src/lib/notifications';

function ProtectionAuth({ children }: { children: React.ReactNode }) {
  const { session, charge } = useAuthStore();
  const segments = useSegments();
  const appRouter = useRouter();

  useEffect(() => {
    if (charge) return;

    const dansAuth = segments[0] === '(auth)';
    const dansResetPassword = segments[1] === 'reset-password';

    if (!session && !dansAuth) {
      appRouter.replace('/(auth)/connexion');
    } else if (session && dansAuth && !dansResetPassword) {
      // Ne pas rediriger si on est sur l'écran de réinitialisation
      appRouter.replace('/(app)/(tabs)/accueil');
    }
  }, [session, charge, segments]);

  return <>{children}</>;
}

async function gererLienRecuperation(url: string) {
  if (!url.includes('reset-password')) return;

  // Flow implicite : #access_token=xxx&refresh_token=yyy&type=recovery
  const fragment = url.split('#')[1];
  if (fragment) {
    const params = new URLSearchParams(fragment);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const type = params.get('type');

    if (type === 'recovery' && accessToken && refreshToken) {
      router.replace({
        pathname: '/(auth)/reset-password',
        params: { access_token: accessToken, refresh_token: refreshToken },
      } as any);
      return;
    }
  }

  // Flow PKCE : ?code=xxx
  const queryPart = url.split('?')[1];
  if (queryPart) {
    const params = new URLSearchParams(queryPart);
    const code = params.get('code');
    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error && data.session) {
        router.replace({
          pathname: '/(auth)/reset-password',
          params: {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          },
        } as any);
      }
    }
  }
}

export default function LayoutRacine() {
  const initialiser = useAuthStore((s) => s.initialiser);

  useEffect(() => {
    initialiser();
    demanderPermissions();

    // App ouverte via lien (était fermée)
    Linking.getInitialURL().then((url) => {
      if (url) gererLienRecuperation(url);
    });

    // Lien reçu pendant que l'app était ouverte
    const sub = Linking.addEventListener('url', ({ url }) => {
      gererLienRecuperation(url);
    });

    return () => sub.remove();
  }, []);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const sessionId = response.notification.request.content.data?.sessionId;
      if (sessionId) {
        router.push(`/session/${sessionId}` as any);
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <ProtectionAuth>
      <Slot />
    </ProtectionAuth>
  );
}
