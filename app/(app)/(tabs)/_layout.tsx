import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { COULEURS } from '../../../src/lib/constantes';

export default function LayoutOnglets() {
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
            <Ionicons name="chatbubbles" size={size} color={color} />
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