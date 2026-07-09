// URL du backend Coach Kipper (Flask). Sur macOS le port 5000 est souvent pris par
// AirPlay Receiver, donc le backend tourne ici sur 5050 (PORT=5050 python app.py).
// - Expo web dev : http://localhost:5050
// - Device physique sur le même Wi-Fi : IP LAN du poste qui fait tourner le backend, ex http://192.168.1.X:5050
// - Démo (Wi-Fi isolé) : URL ngrok (`ngrok http 5050`)
export const COACH_API_URL = 'http://localhost:5050';

export type InsightRunner = {
  utilisateur_id: string;
  nom: string;
  statut: 'progresse' | 'bon' | 'stagne' | 'surintensité' | 'sous_intensite';
  commentaire: string;
};

export type AjustementGroupe = {
  runner_nom: string;
  suggestion: string;
  raison: string;
};

export type AnalyseResultat = {
  synthese: string;
  insights_runners: InsightRunner[];
  ajustements_groupes: AjustementGroupe[];
};

export async function questionnerKipper(
  crewId: string,
  question: string,
  utilisateurId: string,
  jwt: string,
): Promise<string> {
  const res = await fetch(`${COACH_API_URL}/coach/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ crew_id: crewId, question, utilisateur_id: utilisateurId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message || `Erreur serveur ${res.status}`);
  }
  return ((await res.json()) as { reponse: string }).reponse;
}

export async function analyserSeance(
  sessionId: string,
  crewId: string,
  jwt: string,
): Promise<AnalyseResultat> {
  const res = await fetch(`${COACH_API_URL}/coach/analyse`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ session_id: sessionId, crew_id: crewId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message || `Erreur serveur ${res.status}`);
  }
  return ((await res.json()) as { analyse: AnalyseResultat }).analyse;
}
