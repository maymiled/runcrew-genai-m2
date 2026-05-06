import { Slot, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { useAuthStore } from '../src/stores/useAuthStore';

function ProtectionAuth({ children }: { children: React.ReactNode }) {
  const { session, charge } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (charge) return;

    const dansAuth = segments[0] === '(auth)';

    if (!session && !dansAuth) {
      router.replace('/(auth)/connexion');
    } else if (session && dansAuth) {
      router.replace('/(app)/(tabs)/accueil');
    }
  }, [session, charge]);

  return <>{children}</>;
}

export default function LayoutRacine() {
  const initialiser = useAuthStore((s) => s.initialiser);

  useEffect(() => {
    initialiser();
  }, []);

  return (
    <ProtectionAuth>
      <Slot />
    </ProtectionAuth>
  );
}