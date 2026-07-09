import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { COULEURS, ESPACEMENT, RAYONS } from '../../../src/lib/constantes';
import { supabase } from '../../../src/lib/supabase';
import { useAuthStore } from '../../../src/stores/useAuthStore';
import { useChatStore } from '../../../src/stores/useChatStore';
import { router } from 'expo-router';
import { questionnerKipper } from '../../../src/lib/coach';

// ─── Types ────────────────────────────────────────────────────────────────────

type Message = {
  id: string;
  utilisateur_id: string;
  contenu: string;
  cree_le: string;
  nomAffichage: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formaterHeure(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formaterDate(iso: string): string {
  const d = new Date(iso);
  const auj = new Date();
  const hier = new Date(auj);
  hier.setDate(auj.getDate() - 1);
  if (d.toDateString() === auj.toDateString()) return "Aujourd'hui";
  if (d.toDateString() === hier.toDateString()) return 'Hier';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}

function initialesNom(nom: string): string {
  return nom
    .split(' ')
    .slice(0, 2)
    .map((m) => m[0]?.toUpperCase() ?? '')
    .join('');
}

const PALETTE_MEMBRES = [
  '#7C3AED', // violet
  '#2563EB', // bleu
  '#059669', // vert
  '#D97706', // ambre
  '#DC2626', // rouge
  '#0891B2', // cyan
  '#7C2D12', // brun
  '#4F46E5', // indigo
  '#BE185D', // rose
  '#065F46', // vert foncé
  '#1D4ED8', // bleu foncé
  '#B45309', // orange
];

function couleurMembre(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PALETTE_MEMBRES[Math.abs(hash) % PALETTE_MEMBRES.length];
}

// ─── Composant ────────────────────────────────────────────────────────────────

export default function ChatCrew() {
  const { crewId } = useLocalSearchParams<{ crewId: string }>();
  const session = useAuthStore((s) => s.session);
  const userId = session?.user?.id ?? '';
  const marquerLu = useChatStore((s) => s.marquerLu);
  const setCrewActif = useChatStore((s) => s.setCrewActif);
  const insets = useSafeAreaInsets();

  const [nomCrew, setNomCrew] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [texte, setTexte] = useState('');
  const [chargement, setChargement] = useState(true);
  const [envoi, setEnvoi] = useState(false);
  const [kipperEnCours, setKipperEnCours] = useState(false);

  const profilsCache = useRef<Map<string, string>>(new Map());
  const flatListRef = useRef<FlatList>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Signaler au store quel crew est actif — empêche l'incrémentation des non-lus pendant la lecture
  useFocusEffect(
    useCallback(() => {
      if (crewId) {
        setCrewActif(crewId);
        marquerLu(crewId);
      }
      return () => {
        if (crewId) marquerLu(crewId);
        setCrewActif(null);
      };
    }, [crewId])
  );

  useEffect(() => {
    if (!crewId || !userId) return;
    chargerNomCrew();
    chargerMessages();
    abonner();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [crewId]);

  async function chargerNomCrew() {
    const { data } = await supabase
      .from('crews')
      .select('nom')
      .eq('id', crewId)
      .single();
    if (data) setNomCrew(data.nom);
  }

  async function chargerMessages() {
    setChargement(true);
    const { data } = await supabase
      .from('messages')
      .select('id, utilisateur_id, contenu, cree_le, profils(nom_affichage)')
      .eq('crew_id', crewId)
      .order('cree_le', { ascending: true })
      .limit(100);

    if (data) {
      const liste: Message[] = (data as any[]).map((m) => {
        const nom = m.profils?.nom_affichage ?? 'Membre';
        profilsCache.current.set(m.utilisateur_id, nom);
        return {
          id: m.id,
          utilisateur_id: m.utilisateur_id,
          contenu: m.contenu,
          cree_le: m.cree_le,
          nomAffichage: nom,
        };
      });
      setMessages(liste);
      // Scroll vers le bas après chargement
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);
    }
    setChargement(false);
  }

  function abonner() {
    if (channelRef.current) supabase.removeChannel(channelRef.current);

    const channel = supabase
      .channel(`chat-${crewId}-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `crew_id=eq.${crewId}` },
        async (payload) => {
          const row = payload.new as any;
          let nom = profilsCache.current.get(row.utilisateur_id);
          if (!nom) {
            const { data } = await supabase
              .from('profils')
              .select('nom_affichage')
              .eq('id', row.utilisateur_id)
              .single();
            nom = data?.nom_affichage ?? 'Membre';
            profilsCache.current.set(row.utilisateur_id, nom as string);
          }
          const nouveau: Message = {
            id: row.id,
            utilisateur_id: row.utilisateur_id,
            contenu: row.contenu,
            cree_le: row.cree_le,
            nomAffichage: nom as string,
          };
          setMessages((prev) => {
            if (prev.some((m) => m.id === nouveau.id)) return prev;
            return [...prev, nouveau];
          });
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        }
      )
      .subscribe();

    channelRef.current = channel;
  }

  async function envoyerMessage() {
    if (!texte.trim() || !crewId || envoi) return;
    const contenu = texte.trim();
    setTexte('');
    setEnvoi(true);

    await supabase.from('messages').insert({ crew_id: crewId, utilisateur_id: userId, contenu });
    setEnvoi(false);

    // Détecter mention @Kipper et déclencher la réponse RAG
    if (/^@kipper\b/i.test(contenu)) {
      const question = contenu.replace(/^@kipper\s*/i, '').trim();
      if (!question) return;
      setKipperEnCours(true);
      try {
        const { data: { session: authSess } } = await supabase.auth.getSession();
        const jwt = authSess?.access_token;
        if (jwt) await questionnerKipper(crewId, question, userId, jwt);
      } catch {
        // La réponse de Kipper n'est pas critique — on fail silencieusement
      } finally {
        setKipperEnCours(false);
      }
    }
  }

  // ── Construire la liste avec séparateurs de date ──
  type Item = { type: 'date'; date: string } | { type: 'msg'; msg: Message };

  function construireListe(): Item[] {
    const items: Item[] = [];
    let derniereDate = '';
    for (const msg of messages) {
      const d = new Date(msg.cree_le).toDateString();
      if (d !== derniereDate) {
        items.push({ type: 'date', date: msg.cree_le });
        derniereDate = d;
      }
      items.push({ type: 'msg', msg });
    }
    return items;
  }

  if (!userId) return null;

  const liste = construireListe();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.retourBtn}
          onPress={() => (router.canDismiss() ? router.dismiss() : router.replace('/chat' as any))}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={26} color={COULEURS.night[700]} />
        </TouchableOpacity>
        <View style={styles.headerAvatar}>
          <Text style={styles.headerAvatarLettre}>
            {nomCrew[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>
        <Text style={styles.headerNom} numberOfLines={1}>
          {nomCrew || 'Chargement…'}
        </Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {chargement ? (
          <View style={styles.centrage}>
            <ActivityIndicator color={COULEURS.legend[500]} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={liste}
            keyExtractor={(item, i) =>
              item.type === 'date' ? `date-${i}` : item.msg.id
            }
            contentContainerStyle={styles.messagesContenu}
            onContentSizeChange={() =>
              flatListRef.current?.scrollToEnd({ animated: false })
            }
            onLayout={() =>
              flatListRef.current?.scrollToEnd({ animated: false })
            }
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
            ListFooterComponent={kipperEnCours ? (
              <View style={[styles.msgRow, styles.msgRowAutre]}>
                <View style={styles.avatarKipper}>
                  <Text style={styles.avatarKipperTexte}>🐾</Text>
                </View>
                <View style={styles.msgCorps}>
                  <Text style={styles.msgNomKipper}>Kipper</Text>
                  <View style={styles.bulleKipperTyping}>
                    <ActivityIndicator size="small" color={COULEURS.legend[400]} />
                    <Text style={styles.kipperTypingTexte}>Kipper réfléchit…</Text>
                  </View>
                </View>
              </View>
            ) : null}
            renderItem={({ item }) => {
              if (item.type === 'date') {
                return (
                  <View style={styles.sepDate}>
                    <View style={styles.sepLigne} />
                    <Text style={styles.sepTexte}>{formaterDate(item.date)}</Text>
                    <View style={styles.sepLigne} />
                  </View>
                );
              }

              const { msg } = item;
              const estKipper = msg.contenu.startsWith('🐾 Kipper :');
              const estMoi = !estKipper && msg.utilisateur_id === userId;
              const couleur = estMoi ? COULEURS.legend[500] : couleurMembre(msg.utilisateur_id);
              const contenuAffiche = estKipper
                ? msg.contenu.replace('🐾 Kipper :', '').trim()
                : msg.contenu;

              if (estKipper) {
                return (
                  <View style={[styles.msgRow, styles.msgRowAutre]}>
                    <View style={styles.avatarKipper}>
                      <Text style={styles.avatarKipperTexte}>🐾</Text>
                    </View>
                    <View style={styles.msgCorps}>
                      <View style={styles.kipperNomRow}>
                        <Text style={styles.msgNomKipper}>Kipper</Text>
                        <View style={styles.kipperBadge}>
                          <Text style={styles.kipperBadgeTexte}>Coach IA</Text>
                        </View>
                      </View>
                      <View style={styles.bulleKipper}>
                        <Text style={styles.bulleTexteKipper}>{contenuAffiche}</Text>
                      </View>
                      <Text style={styles.heureAutre}>{formaterHeure(msg.cree_le)}</Text>
                    </View>
                  </View>
                );
              }

              return (
                <View
                  style={[
                    styles.msgRow,
                    estMoi ? styles.msgRowMoi : styles.msgRowAutre,
                  ]}
                >
                  {!estMoi && (
                    <View style={[styles.avatar, { backgroundColor: couleur + '22', borderColor: couleur + '55', borderWidth: 1.5 }]}>
                      <Text style={[styles.avatarTexte, { color: couleur }]}>
                        {initialesNom(msg.nomAffichage)}
                      </Text>
                    </View>
                  )}
                  <View style={styles.msgCorps}>
                    {!estMoi && (
                      <Text style={[styles.msgNom, { color: couleur }]}>{msg.nomAffichage}</Text>
                    )}
                    <View style={[styles.bulle, estMoi ? styles.bulleMoi : styles.bulleAutre]}>
                      <Text style={[styles.bulleTexte, estMoi ? styles.bulleTexteMoi : styles.bulleTexteAutre]}>
                        {msg.contenu}
                      </Text>
                    </View>
                    <Text style={[styles.heure, estMoi ? styles.heureMoi : styles.heureAutre]}>
                      {formaterHeure(msg.cree_le)}
                    </Text>
                  </View>
                </View>
              );
            }}
          />
        )}

        {/* Barre d'envoi */}
        <View style={[styles.barreEnvoi, { paddingBottom: insets.bottom || ESPACEMENT.sm }]}>
          {/* Chip @Kipper — s'affiche si l'input est vide */}
          {!texte && (
            <TouchableOpacity
              style={styles.kipperChip}
              onPress={() => setTexte('@Kipper ')}
              activeOpacity={0.75}
            >
              <Text style={styles.kipperChipTexte}>🐾 @Kipper</Text>
            </TouchableOpacity>
          )}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={texte}
              onChangeText={setTexte}
              placeholder="Écris un message…"
              placeholderTextColor={COULEURS.night[300]}
              multiline
              maxLength={500}
              returnKeyType="send"
              onSubmitEditing={envoyerMessage}
            />
            <TouchableOpacity
              style={[styles.boutonEnvoi, (!texte.trim() || envoi) && styles.boutonEnvoiOff]}
              onPress={envoyerMessage}
              disabled={!texte.trim() || envoi}
            >
              <Ionicons name="send" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centrage: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ESPACEMENT.sm,
    paddingHorizontal: ESPACEMENT.md,
    paddingVertical: ESPACEMENT.sm,
    borderBottomWidth: 1,
    borderBottomColor: COULEURS.night[100],
  },
  retourBtn: { padding: 2 },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: RAYONS.full,
    backgroundColor: COULEURS.legend[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarLettre: { fontSize: 15, fontWeight: '700', color: COULEURS.legend[600] },
  headerNom: { flex: 1, fontSize: 17, fontWeight: '700', color: COULEURS.night[700] },

  messagesContenu: { padding: ESPACEMENT.md, gap: 4 },

  sepDate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ESPACEMENT.sm,
    marginVertical: ESPACEMENT.md,
  },
  sepLigne: { flex: 1, height: 1, backgroundColor: COULEURS.night[100] },
  sepTexte: { fontSize: 11, color: COULEURS.night[300], fontWeight: '600' },

  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginVertical: 2,
  },
  msgRowMoi: { justifyContent: 'flex-end' },
  msgRowAutre: { justifyContent: 'flex-start' },

  avatar: {
    width: 30,
    height: 30,
    borderRadius: RAYONS.full,
    backgroundColor: COULEURS.legend[100],
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarTexte: { fontSize: 11, fontWeight: '700', color: COULEURS.legend[600] },

  msgCorps: { maxWidth: '72%', gap: 2 },
  msgNom: { fontSize: 11, fontWeight: '600', color: COULEURS.night[400], marginLeft: 4 },

  bulle: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9 },
  bulleMoi: { backgroundColor: COULEURS.legend[500], borderBottomRightRadius: 4 },
  bulleAutre: { backgroundColor: COULEURS.night[50], borderBottomLeftRadius: 4 },
  bulleTexte: { fontSize: 15, lineHeight: 21 },
  bulleTexteMoi: { color: '#fff' },
  bulleTexteAutre: { color: COULEURS.night[700] },

  heure: { fontSize: 10, color: COULEURS.night[300] },
  heureMoi: { textAlign: 'right', marginRight: 4 },
  heureAutre: { marginLeft: 4 },

  barreEnvoi: {
    gap: 8,
    paddingHorizontal: ESPACEMENT.md,
    paddingTop: ESPACEMENT.sm,
    borderTopWidth: 1,
    borderTopColor: COULEURS.night[100],
    backgroundColor: '#fff',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: ESPACEMENT.sm,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderWidth: 1.5,
    borderColor: COULEURS.night[200],
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: COULEURS.night[700],
    backgroundColor: COULEURS.night[50],
  },
  boutonEnvoi: {
    width: 40,
    height: 40,
    borderRadius: RAYONS.full,
    backgroundColor: COULEURS.legend[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  boutonEnvoiOff: { opacity: 0.4 },

  // ── Chip @Kipper ──
  kipperChip: {
    alignSelf: 'flex-start',
    backgroundColor: COULEURS.legend[50],
    borderWidth: 1.5,
    borderColor: COULEURS.legend[200],
    borderRadius: RAYONS.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  kipperChipTexte: {
    fontSize: 13,
    fontWeight: '600',
    color: COULEURS.legend[600],
  },

  // ── Avatar et bulles Kipper ──
  avatarKipper: {
    width: 30,
    height: 30,
    borderRadius: RAYONS.full,
    backgroundColor: COULEURS.legend[100],
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarKipperTexte: { fontSize: 14 },

  kipperNomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 4,
    marginBottom: 1,
  },
  msgNomKipper: {
    fontSize: 11,
    fontWeight: '700',
    color: COULEURS.legend[500],
  },
  kipperBadge: {
    backgroundColor: COULEURS.legend[500],
    borderRadius: RAYONS.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  kipperBadgeTexte: {
    fontSize: 9,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },
  bulleKipper: {
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: COULEURS.legend[50],
    borderWidth: 1.5,
    borderColor: COULEURS.legend[200],
    maxWidth: '100%',
  },
  bulleTexteKipper: {
    fontSize: 15,
    lineHeight: 22,
    color: COULEURS.night[700],
  },

  // Typing indicator
  bulleKipperTyping: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: COULEURS.legend[50],
    borderWidth: 1.5,
    borderColor: COULEURS.legend[200],
  },
  kipperTypingTexte: {
    fontSize: 14,
    color: COULEURS.legend[400],
    fontStyle: 'italic',
  },
});
