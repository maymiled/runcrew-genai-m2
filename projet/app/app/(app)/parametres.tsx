import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { annulerTousLesRappels, setPrefNotifChatCache } from '../../src/lib/notifications';
import { COULEURS, ESPACEMENT, RAYONS } from '../../src/lib/constantes';
import { supabase } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { useProfilStore } from '../../src/stores/useProfilStore';

const VERSION_APP = '1.0.0';
const TROIS_MOIS_MS = 90 * 24 * 60 * 60 * 1000;

type ModalType = 'pseudo' | 'email' | 'motdepasse' | null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function joursRestants(ts: string | null): number {
  if (!ts) return 0;
  return Math.max(0, Math.ceil((TROIS_MOIS_MS - (Date.now() - new Date(ts).getTime())) / 86400000));
}

function initialesNom(nom: string): string {
  return nom.split(' ').slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('');
}

// ─── Champ texte stylé ────────────────────────────────────────────────────────

function ChampTexte({
  icone,
  placeholder,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  autoFocus,
  hint,
}: {
  icone: string;
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: any;
  autoCapitalize?: any;
  autoFocus?: boolean;
  hint?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <View style={[champStyles.wrapper, focused && champStyles.wrapperFocus]}>
        <Ionicons name={icone as any} size={17} color={focused ? COULEURS.legend[500] : COULEURS.night[300]} />
        <TextInput
          style={[champStyles.input, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={COULEURS.night[300]}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize ?? 'sentences'}
          autoFocus={autoFocus}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      </View>
      {hint ? <Text style={champStyles.hint}>{hint}</Text> : null}
    </View>
  );
}

const champStyles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COULEURS.night[50],
    borderRadius: RAYONS.lg,
    borderWidth: 1.5,
    borderColor: COULEURS.night[100],
    paddingHorizontal: ESPACEMENT.md,
    paddingVertical: 13,
  },
  wrapperFocus: {
    borderColor: COULEURS.legend[400],
    backgroundColor: COULEURS.legend[50],
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: COULEURS.night[700],
  },
  hint: {
    fontSize: 12,
    color: COULEURS.night[300],
    paddingHorizontal: 4,
  },
});

// ─── Ligne de paramètre ───────────────────────────────────────────────────────

function LigneParam({
  icone,
  label,
  valeur,
  onPress,
  danger,
  disabled,
  badge,
  droite,
}: {
  icone: string;
  label: string;
  valeur?: string;
  onPress?: () => void;
  danger?: boolean;
  disabled?: boolean;
  badge?: string;
  droite?: React.ReactNode;
}) {
  const coulLabel = danger ? COULEURS.danger : disabled ? COULEURS.night[300] : COULEURS.night[700];
  const coulIcone = danger ? COULEURS.danger : disabled ? COULEURS.night[200] : COULEURS.legend[500];

  const inner = (
    <View style={[styles.ligne, disabled && { opacity: 0.45 }]}>
      <View style={[styles.ligneIcone, { backgroundColor: danger ? '#FEE2E2' : COULEURS.legend[50] }]}>
        <Ionicons name={icone as any} size={17} color={coulIcone} />
      </View>
      <View style={styles.ligneCorps}>
        <Text style={[styles.ligneLabel, { color: coulLabel }]}>{label}</Text>
        {valeur ? <Text style={styles.ligneValeur} numberOfLines={1}>{valeur}</Text> : null}
      </View>
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeTexte}>{badge}</Text>
        </View>
      ) : droite ? droite : onPress && !disabled ? (
        <Ionicons name="chevron-forward" size={15} color={COULEURS.night[200]} />
      ) : null}
    </View>
  );

  if (!onPress || disabled) return inner;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.65}>
      {inner}
    </TouchableOpacity>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function Parametres() {
  const authSession = useAuthStore(s => s.session);
  const seDeconnecter = useAuthStore(s => s.seDeconnecter);
  const mettreAJourStore = useProfilStore(s => s.mettreAJour);
  const userId = authSession?.user?.id ?? '';

  const [nomAffichage, setNomAffichage] = useState('');
  const [email, setEmail] = useState('');
  const [pseudoModifieLe, setPseudoModifieLe] = useState<string | null>(null);
  const [planActuel, setPlanActuel] = useState<'gratuit' | 'capitaine' | 'pro'>('gratuit');
  const [chargement, setChargement] = useState(true);

  const [modalOuvert, setModalOuvert] = useState<ModalType>(null);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState('');

  // Champs modals
  const [champPseudo, setChampPseudo] = useState('');
  const [champEmail, setChampEmail] = useState('');
  const [champMdpActuel, setChampMdpActuel] = useState('');
  const [champMdpNouveau, setChampMdpNouveau] = useState('');
  const [champMdpConfirm, setChampMdpConfirm] = useState('');
  const [reinitEnvoi, setReinitEnvoi] = useState(false);

  // Préférences
  const [unites, setUnites] = useState<'km' | 'miles'>('km');
  const [notifChat, setNotifChat] = useState(true);
  const [notifSession, setNotifSession] = useState(true);

  useEffect(() => {
    if (!userId) return;
    charger();
    chargerPreferences();
  }, [userId]);

  async function chargerPreferences() {
    try {
      const chat = await SecureStore.getItemAsync('pref_notif_chat');
      const session = await SecureStore.getItemAsync('pref_notif_session');
      if (chat !== null) setNotifChat(chat === 'true');
      if (session !== null) setNotifSession(session === 'true');
    } catch {}
  }

  async function toggleNotifChat(val: boolean) {
    setNotifChat(val);
    setPrefNotifChatCache(val);
    try { await SecureStore.setItemAsync('pref_notif_chat', String(val)); } catch {}
  }

  async function toggleNotifSession(val: boolean) {
    setNotifSession(val);
    try {
      await SecureStore.setItemAsync('pref_notif_session', String(val));
      if (!val) await annulerTousLesRappels();
    } catch {}
  }

  async function charger() {
    setChargement(true);
    const [{ data: profil }, { data: user }] = await Promise.all([
      supabase.from('profils').select('nom_affichage, pseudo_modifie_le, plan').eq('id', userId).single(),
      supabase.auth.getUser(),
    ]);
    setNomAffichage(profil?.nom_affichage ?? '');
    setPseudoModifieLe(profil?.pseudo_modifie_le ?? null);
    setPlanActuel((profil as any)?.plan ?? 'gratuit');
    setEmail(user?.user?.email ?? '');
    setChargement(false);
  }

  // ── Ouverture modals ───────────────────────────────────────────────────────

  function ouvrir(type: ModalType) {
    setErreur('');
    setReinitEnvoi(false);
    if (type === 'pseudo') setChampPseudo(nomAffichage);
    if (type === 'email') setChampEmail(email);
    if (type === 'motdepasse') { setChampMdpActuel(''); setChampMdpNouveau(''); setChampMdpConfirm(''); }
    setModalOuvert(type);
  }

  function fermer() { setModalOuvert(null); setErreur(''); }

  function ok(msg: string) {
    fermer();
    Platform.OS === 'web' ? window.alert(msg) : Alert.alert('✓', msg);
  }

  // ── Sauvegarde pseudo ──────────────────────────────────────────────────────

  async function sauvegarderPseudo() {
    const val = champPseudo.trim();
    if (val.length < 2) { setErreur('Minimum 2 caractères.'); return; }
    if (val.length > 30) { setErreur('Maximum 30 caractères.'); return; }
    setEnregistrement(true); setErreur('');
    const { error } = await supabase
      .from('profils')
      .update({ nom_affichage: val, pseudo_modifie_le: new Date().toISOString() })
      .eq('id', userId);
    setEnregistrement(false);
    if (error) { setErreur('Impossible de modifier le pseudo.'); return; }
    setNomAffichage(val);
    setPseudoModifieLe(new Date().toISOString());
    mettreAJourStore({ nom_affichage: val });
    ok('Pseudo mis à jour !');
  }

  // ── Sauvegarde email ───────────────────────────────────────────────────────

  async function sauvegarderEmail() {
    const val = champEmail.trim().toLowerCase();
    if (!val.includes('@')) { setErreur('Adresse email invalide.'); return; }
    setEnregistrement(true); setErreur('');
    const { error } = await supabase.auth.updateUser({ email: val });
    setEnregistrement(false);
    if (error) { setErreur(error.message || 'Impossible de modifier l\'email.'); return; }
    setEmail(val);
    ok('Un email de confirmation a été envoyé à ta nouvelle adresse.');
  }

  // ── Sauvegarde mot de passe ────────────────────────────────────────────────

  async function sauvegarderMotDePasse() {
    if (!champMdpActuel) { setErreur('Entre ton mot de passe actuel.'); return; }
    if (champMdpNouveau.length < 8) { setErreur('Le nouveau mot de passe doit faire au moins 8 caractères.'); return; }
    if (champMdpNouveau !== champMdpConfirm) { setErreur('Les mots de passe ne correspondent pas.'); return; }

    setEnregistrement(true); setErreur('');

    // Vérifier l'ancien mot de passe en re-signant
    const { error: errConn } = await supabase.auth.signInWithPassword({ email, password: champMdpActuel });
    if (errConn) {
      setEnregistrement(false);
      setErreur('Mot de passe actuel incorrect.');
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: champMdpNouveau });
    setEnregistrement(false);
    if (error) { setErreur(error.message || 'Impossible de modifier le mot de passe.'); return; }
    ok('Mot de passe mis à jour !');
  }

  // ── Réinitialisation mot de passe ──────────────────────────────────────────

  async function reinitialiserMotDePasse() {
    setReinitEnvoi(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'runcrew://reset-password',
    });
    setReinitEnvoi(false);
    if (error) { setErreur('Impossible d\'envoyer l\'email de réinitialisation.'); return; }
    fermer();
    Platform.OS === 'web'
      ? window.alert(`Un lien de réinitialisation a été envoyé à ${email}.`)
      : Alert.alert('Email envoyé', `Un lien de réinitialisation a été envoyé à ${email}.`);
  }

  // ── Déconnexion / Suppression ──────────────────────────────────────────────

  function confirmerDeconnexion() {
    Platform.OS === 'web'
      ? window.confirm('Se déconnecter ?') && seDeconnecter()
      : Alert.alert('Se déconnecter', '', [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Déconnecter', style: 'destructive', onPress: seDeconnecter },
        ]);
  }

  function confirmerSuppression() {
    const exec = async () => {
      const { error } = await supabase.rpc('supprimer_mon_compte');
      if (error) {
        const msg = 'Impossible de supprimer le compte. Contacte le support.';
        Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Erreur', msg);
        return;
      }
      await seDeconnecter();
    };
    Platform.OS === 'web'
      ? window.confirm('Supprimer définitivement ton compte ?') && exec()
      : Alert.alert('Supprimer le compte', 'Cette action est irréversible. Toutes tes données seront effacées.', [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Supprimer', style: 'destructive', onPress: exec },
        ]);
  }

  const joursAvant = joursRestants(pseudoModifieLe);
  const pseudoBloque = joursAvant > 0;

  if (chargement) return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.retour} onPress={() => router.canDismiss() ? router.dismiss() : router.replace('/(app)/(tabs)/profil' as any)}>
          <Ionicons name="arrow-back" size={22} color={COULEURS.night[700]} />
        </TouchableOpacity>
        <Text style={styles.headerTitre}>Paramètres</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={COULEURS.legend[500]} />
      </View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.retour} onPress={() => router.canDismiss() ? router.dismiss() : router.replace('/(app)/(tabs)/profil' as any)}>
          <Ionicons name="arrow-back" size={22} color={COULEURS.night[700]} />
        </TouchableOpacity>
        <Text style={styles.headerTitre}>Paramètres</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* ── Carte profil ─────────────────────────────────────────────────── */}
        <View style={styles.profilCard}>
          <View style={styles.profilAvatar}>
            <Text style={styles.profilAvatarLettre}>{initialesNom(nomAffichage)}</Text>
          </View>
          <View style={styles.profilInfo}>
            <Text style={styles.profilNom}>{nomAffichage}</Text>
            <Text style={styles.profilEmail} numberOfLines={1}>{email}</Text>
          </View>
        </View>

        {/* ── Mon compte ───────────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Mon compte</Text>
        <View style={styles.card}>
          <LigneParam
            icone="person-outline"
            label="Pseudo"
            valeur={nomAffichage}
            onPress={pseudoBloque ? undefined : () => ouvrir('pseudo')}
            disabled={pseudoBloque}
            badge={pseudoBloque ? `${joursAvant}j` : undefined}
          />
          {pseudoBloque && (
            <View style={styles.infoLigne}>
              <Ionicons name="time-outline" size={12} color={COULEURS.night[300]} />
              <Text style={styles.infoTexte}>Modifiable dans {joursAvant} jour{joursAvant > 1 ? 's' : ''} · 1 changement / 3 mois</Text>
            </View>
          )}
          <View style={styles.sep} />
          <LigneParam icone="mail-outline" label="Email" valeur={email} onPress={() => ouvrir('email')} />
          <View style={styles.sep} />
          <LigneParam icone="lock-closed-outline" label="Mot de passe" valeur="Modifier" onPress={() => ouvrir('motdepasse')} />
        </View>

        {/* ── Préférences ──────────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Préférences</Text>
        <View style={styles.card}>
          {/* Unités : segmented control */}
          <View style={styles.ligne}>
            <View style={[styles.ligneIcone, { backgroundColor: COULEURS.legend[50] }]}>
              <Ionicons name="speedometer-outline" size={17} color={COULEURS.legend[500]} />
            </View>
            <View style={styles.ligneCorps}>
              <Text style={styles.ligneLabel}>Unités de distance</Text>
            </View>
          </View>
          <View style={styles.segmentWrapper}>
            {(['km', 'miles'] as const).map(u => (
              <TouchableOpacity
                key={u}
                style={[styles.segmentBtn, unites === u && styles.segmentBtnActif]}
                onPress={() => setUnites(u)}
                activeOpacity={0.7}
              >
                <Text style={[styles.segmentTexte, unites === u && styles.segmentTexteActif]}>
                  {u === 'km' ? 'Kilomètres (km)' : 'Miles (mi)'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.sep} />
          <LigneParam
            icone="notifications-outline"
            label="Messages du crew"
            valeur="Notifications de chat"
            droite={
              <Switch
                value={notifChat}
                onValueChange={toggleNotifChat}
                trackColor={{ false: COULEURS.night[200], true: COULEURS.legend[400] }}
                thumbColor="#fff"
                ios_backgroundColor={COULEURS.night[200]}
              />
            }
          />
          <View style={styles.sep} />
          <LigneParam
            icone="calendar-outline"
            label="Rappels de session"
            valeur="1h avant chaque séance"
            droite={
              <Switch
                value={notifSession}
                onValueChange={toggleNotifSession}
                trackColor={{ false: COULEURS.night[200], true: COULEURS.legend[400] }}
                thumbColor="#fff"
                ios_backgroundColor={COULEURS.night[200]}
              />
            }
          />
          <View style={styles.sep} />
          <LigneParam
            icone="language-outline"
            label="Langue"
            valeur="Français"
            onPress={() => {
              const msg = "D'autres langues arrivent bientôt !";
              Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Langue', msg);
            }}
          />
        </View>

        {/* ── Abonnement ───────────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Abonnement</Text>
        {planActuel === 'gratuit' ? (
          <TouchableOpacity
            style={styles.premiumBanner}
            onPress={() => {
              const msg = 'Le plan Pro arrive bientôt !\n\nAu programme : crews illimités, statistiques avancées, badge Pro, priorité support et bien plus.\n\nContacte-nous à support@runcrew.app pour être notifié en avant-première.';
              if (Platform.OS === 'web') {
                window.alert('🌟 RunCrew Pro\n\n' + msg);
              } else {
                Alert.alert('🌟 RunCrew Pro', msg, [
                  { text: 'Fermer', style: 'cancel' },
                  { text: 'Contacter', onPress: () => Linking.openURL('mailto:support@runcrew.app?subject=RunCrew Pro') },
                ]);
              }
            }}
            activeOpacity={0.85}
          >
            <View style={styles.premiumBannerLeft}>
              <Ionicons name="star" size={22} color="#F59E0B" />
              <View>
                <Text style={styles.premiumBannerTitre}>Passe à RunCrew Pro</Text>
                <Text style={styles.premiumBannerSous}>Crews illimités · Analytics · Priorité support</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#F59E0B" />
          </TouchableOpacity>
        ) : (
          <View style={styles.card}>
            <LigneParam
              icone="star"
              label="Plan actuel"
              valeur={planActuel === 'pro' ? 'RunCrew Pro 🌟' : 'Capitaine'}
            />
          </View>
        )}

        {/* ── Application ──────────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Application</Text>
        <View style={styles.card}>
          <LigneParam icone="information-circle-outline" label="Version" valeur={VERSION_APP} />
          <View style={styles.sep} />
          <LigneParam
            icone="shield-checkmark-outline"
            label="Politique de confidentialité"
            onPress={() => {
              const msg = 'La politique de confidentialité sera publiée avant le lancement officiel de l\'app.';
              Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Bientôt disponible', msg);
            }}
          />
          <View style={styles.sep} />
          <LigneParam
            icone="document-text-outline"
            label="Conditions générales"
            onPress={() => {
              const msg = 'Les conditions générales seront publiées avant le lancement officiel de l\'app.';
              Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Bientôt disponible', msg);
            }}
          />
          <View style={styles.sep} />
          <LigneParam
            icone="chatbox-ellipses-outline"
            label="Nous contacter"
            valeur="support@runcrew.app"
            onPress={() => Linking.openURL('mailto:support@runcrew.app')}
          />
        </View>

        {/* ── Déconnexion ───────────────────────────────────────────────────── */}
        <View style={styles.card}>
          <LigneParam icone="log-out-outline" label="Se déconnecter" onPress={confirmerDeconnexion} danger />
        </View>

        {/* ── Suppression ───────────────────────────────────────────────────── */}
        <TouchableOpacity style={styles.supprimerBtn} onPress={confirmerSuppression} activeOpacity={0.7}>
          <Text style={styles.supprimerTexte}>Supprimer mon compte</Text>
        </TouchableOpacity>

        <View style={{ height: ESPACEMENT.xl }} />
      </ScrollView>

      {/* ── Modal pseudo ────────────────────────────────────────────────────── */}
      <SheetModal
        visible={modalOuvert === 'pseudo'}
        titre="Changer le pseudo"
        onFermer={fermer}
        onValider={sauvegarderPseudo}
        enregistrement={enregistrement}
        erreur={erreur}
      >
        <ChampTexte
          icone="person-outline"
          placeholder="Ton pseudo"
          value={champPseudo}
          onChangeText={setChampPseudo}
          autoFocus
          hint="Entre 2 et 30 caractères · Modifiable 1 fois tous les 3 mois"
        />
      </SheetModal>

      {/* ── Modal email ─────────────────────────────────────────────────────── */}
      <SheetModal
        visible={modalOuvert === 'email'}
        titre="Changer l'email"
        onFermer={fermer}
        onValider={sauvegarderEmail}
        enregistrement={enregistrement}
        erreur={erreur}
      >
        <ChampTexte
          icone="mail-outline"
          placeholder="nouvelle@adresse.com"
          value={champEmail}
          onChangeText={setChampEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoFocus
          hint="Un lien de confirmation sera envoyé à ta nouvelle adresse."
        />
      </SheetModal>

      {/* ── Modal mot de passe ──────────────────────────────────────────────── */}
      <SheetModal
        visible={modalOuvert === 'motdepasse'}
        titre="Changer le mot de passe"
        onFermer={fermer}
        onValider={sauvegarderMotDePasse}
        enregistrement={enregistrement}
        erreur={erreur}
        piedDePage={
          <TouchableOpacity
            style={styles.oublieLien}
            onPress={reinitialiserMotDePasse}
            disabled={reinitEnvoi}
            activeOpacity={0.7}
          >
            {reinitEnvoi
              ? <ActivityIndicator size="small" color={COULEURS.legend[500]} />
              : <Text style={styles.oublieTexte}>Mot de passe oublié ? Envoyer un lien de réinitialisation</Text>
            }
          </TouchableOpacity>
        }
      >
        <ChampTexte
          icone="lock-closed-outline"
          placeholder="Mot de passe actuel"
          value={champMdpActuel}
          onChangeText={setChampMdpActuel}
          secureTextEntry
          autoFocus
        />
        <ChampTexte
          icone="lock-open-outline"
          placeholder="Nouveau mot de passe"
          value={champMdpNouveau}
          onChangeText={setChampMdpNouveau}
          secureTextEntry
          hint="Minimum 8 caractères"
        />
        <ChampTexte
          icone="checkmark-circle-outline"
          placeholder="Confirmer le nouveau mot de passe"
          value={champMdpConfirm}
          onChangeText={setChampMdpConfirm}
          secureTextEntry
        />
      </SheetModal>
    </SafeAreaView>
  );
}

// ─── Bottom sheet modal ───────────────────────────────────────────────────────

function SheetModal({
  visible,
  titre,
  children,
  onFermer,
  onValider,
  enregistrement,
  erreur,
  piedDePage,
}: {
  visible: boolean;
  titre: string;
  children: React.ReactNode;
  onFermer: () => void;
  onValider: () => void;
  enregistrement: boolean;
  erreur: string;
  piedDePage?: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onFermer}>
      <View style={modalStyles.overlay}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onFermer} />
        <View style={modalStyles.sheet}>
          <View style={modalStyles.handle} />
          <Text style={modalStyles.titre}>{titre}</Text>
          <View style={modalStyles.corps}>{children}</View>
          {erreur ? (
            <View style={modalStyles.erreurRow}>
              <Ionicons name="alert-circle-outline" size={14} color={COULEURS.danger} />
              <Text style={modalStyles.erreurTexte}>{erreur}</Text>
            </View>
          ) : null}
          {piedDePage}
          <View style={modalStyles.boutons}>
            <TouchableOpacity style={modalStyles.btnAnnuler} onPress={onFermer} activeOpacity={0.7}>
              <Text style={modalStyles.btnAnnulerTexte}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[modalStyles.btnValider, enregistrement && { opacity: 0.6 }]}
              onPress={onValider}
              disabled={enregistrement}
              activeOpacity={0.8}
            >
              {enregistrement
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={modalStyles.btnValiderTexte}>Enregistrer</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: ESPACEMENT.lg,
    paddingBottom: Platform.OS === 'ios' ? 44 : ESPACEMENT.lg,
    paddingTop: ESPACEMENT.md,
    gap: ESPACEMENT.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 20,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: COULEURS.night[200],
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: ESPACEMENT.sm,
  },
  titre: {
    fontSize: 19,
    fontWeight: '700',
    color: COULEURS.night[700],
    textAlign: 'center',
  },
  corps: { gap: ESPACEMENT.sm },
  erreurRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    borderRadius: RAYONS.md,
    padding: 10,
  },
  erreurTexte: { flex: 1, fontSize: 13, color: COULEURS.danger, lineHeight: 18 },
  boutons: { flexDirection: 'row', gap: 10 },
  btnAnnuler: {
    flex: 1,
    borderRadius: RAYONS.full,
    borderWidth: 1.5,
    borderColor: COULEURS.night[200],
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnAnnulerTexte: { fontSize: 15, fontWeight: '600', color: COULEURS.night[500] },
  btnValider: {
    flex: 2,
    borderRadius: RAYONS.full,
    backgroundColor: COULEURS.legend[500],
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnValiderTexte: { fontSize: 15, fontWeight: '700', color: '#fff' },
});

// ─── Styles principaux ────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COULEURS.night[50] },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: ESPACEMENT.md,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: COULEURS.night[100],
  },
  retour: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: RAYONS.full },
  headerTitre: { fontSize: 17, fontWeight: '700', color: COULEURS.night[700] },

  scroll: { padding: ESPACEMENT.md, gap: ESPACEMENT.sm },

  // Carte profil
  profilCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ESPACEMENT.md,
    backgroundColor: '#fff',
    borderRadius: RAYONS.xl,
    padding: ESPACEMENT.md,
    borderWidth: 1,
    borderColor: COULEURS.night[100],
    marginBottom: ESPACEMENT.sm,
  },
  profilAvatar: {
    width: 52,
    height: 52,
    borderRadius: RAYONS.full,
    backgroundColor: COULEURS.legend[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  profilAvatarLettre: { fontSize: 20, fontWeight: '800', color: '#fff' },
  profilInfo: { flex: 1, gap: 2 },
  profilNom: { fontSize: 17, fontWeight: '700', color: COULEURS.night[700] },
  profilEmail: { fontSize: 13, color: COULEURS.night[400] },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COULEURS.night[400],
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    marginTop: ESPACEMENT.sm,
    marginBottom: 4,
    marginLeft: 4,
  },

  card: {
    backgroundColor: '#fff',
    borderRadius: RAYONS.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COULEURS.night[100],
  },

  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ESPACEMENT.md,
    paddingHorizontal: ESPACEMENT.md,
    paddingVertical: 14,
  },
  ligneIcone: {
    width: 34,
    height: 34,
    borderRadius: RAYONS.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  ligneCorps: { flex: 1, gap: 2 },
  ligneLabel: { fontSize: 15, fontWeight: '500', color: COULEURS.night[700] },
  ligneValeur: { fontSize: 13, color: COULEURS.night[400] },

  sep: {
    height: 1,
    backgroundColor: COULEURS.night[50],
    marginLeft: 34 + ESPACEMENT.md * 2,
  },

  badge: {
    backgroundColor: COULEURS.night[100],
    borderRadius: RAYONS.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeTexte: { fontSize: 11, fontWeight: '700', color: COULEURS.night[400] },

  infoLigne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: ESPACEMENT.md,
    paddingBottom: 12,
    marginTop: -8,
  },
  infoTexte: { fontSize: 12, color: COULEURS.night[300] },

  // Segmented control
  segmentWrapper: {
    flexDirection: 'row',
    marginHorizontal: ESPACEMENT.md,
    marginBottom: ESPACEMENT.md,
    backgroundColor: COULEURS.night[50],
    borderRadius: RAYONS.lg,
    padding: 3,
    gap: 3,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: RAYONS.md,
    alignItems: 'center',
  },
  segmentBtnActif: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  segmentTexte: { fontSize: 13, fontWeight: '500', color: COULEURS.night[400] },
  segmentTexteActif: { color: COULEURS.legend[500], fontWeight: '700' },

  // Premium banner
  premiumBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1C1917',
    borderRadius: RAYONS.xl,
    padding: ESPACEMENT.md,
    gap: ESPACEMENT.sm,
  },
  premiumBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ESPACEMENT.sm,
    flex: 1,
  },
  premiumBannerTitre: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F59E0B',
  },
  premiumBannerSous: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },

  // Déconnexion / suppression
  oublieLien: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  oublieTexte: {
    fontSize: 13,
    color: COULEURS.legend[500],
    fontWeight: '600',
    textAlign: 'center',
  },

  supprimerBtn: {
    alignItems: 'center',
    paddingVertical: ESPACEMENT.md,
    marginTop: ESPACEMENT.xs,
  },
  supprimerTexte: {
    fontSize: 14,
    color: COULEURS.danger,
    fontWeight: '600',
  },
});
