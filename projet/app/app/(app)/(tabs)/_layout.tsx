import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, StyleSheet, Text, View } from 'react-native';
import { COULEURS } from '../../../src/lib/constantes';
import { supabase } from '../../../src/lib/supabase';
import { useAuthStore } from '../../../src/stores/useAuthStore';
import { useChatStore } from '../../../src/stores/useChatStore';

function IconeChat({ color, size, badge }: { color: string; size: number; badge: number }) {
  return (
    <View>
      <Ionicons name="chatbubbles" size={size} color={color} />
      {badge > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeTexte}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      )}
    </View>
  );
}

export default function LayoutOnglets() {
  const session = useAuthStore((s) => s.session);
  const userId = session?.user?.id ?? '';
  const nonLusParCrew = useChatStore((s) => s.nonLusParCrew);
  const charger = useChatStore((s) => s.charger);
  const cleanup = useChatStore((s) => s.cleanup);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const crewsAvecNonLus = Object.values(nonLusParCrew).filter((n) => n > 0).length;

  async function rafraichirCrews() {
    if (!userId) return;
    const { data } = await supabase
      .from('membres')
      .select('crew_id')
      .eq('utilisateur_id', userId);
    const crewIds = (data ?? []).map((m: any) => m.crew_id as string);
    if (crewIds.length) {
      charger(userId, crewIds);
    } else {
      cleanup();
    }
  }

  useEffect(() => {
    if (!userId) return;
    rafraichirCrews();
    return () => cleanup();
  }, [userId]);

  // Recharger quand l'app revient au premier plan (après rejoindre/quitter un crew)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appStateRef.current.match(/inactive|background/) && next === 'active') {
        rafraichirCrews();
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [userId]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: COULEURS.legend[500],
        tabBarInactiveTintColor: COULEURS.night[300],
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: COULEURS.night[100],
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="accueil"
        options={{
          title: 'Accueil',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="explorer"
        options={{
          title: 'Explorer',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="compass" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color, size }) => (
            <IconeChat color={color} size={size} badge={crewsAvecNonLus} />
          ),
        }}
      />
      <Tabs.Screen
        name="profil"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -5,
    right: -10,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: COULEURS.legend[500],
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  badgeTexte: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
    lineHeight: 12,
  },
});
