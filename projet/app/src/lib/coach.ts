// URL du backend Coach Kipper (Flask) -- tout tourne en local.
// Sur macOS le port 5000 est souvent pris par AirPlay Receiver, donc le backend
// tourne ici sur 5050 (PORT=5050 python app.py).
// - Expo web dev : http://localhost:5050
// - Device physique sur le même Wi-Fi : IP LAN du poste qui fait tourner le backend,
//   ex http://192.168.1.X:5050 (EXPO_PUBLIC_COACH_API_URL dans app/.env pour l'ajuster
//   sans toucher au code).
export const COACH_API_URL = process.env.EXPO_PUBLIC_COACH_API_URL || 'http://localhost:5050';

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

// ── Mode debug : même contrat d'événements que le backend (agent/*.py) ──────
export type EvenementDebug =
  | { type: 'reasoning'; text: string }
  | { type: 'tool_call'; tool: string; input: Record<string, any> }
  | { type: 'tool_result'; tool: string; output: string; is_error: boolean }
  | { type: 'final'; result: any }
  | { type: 'error'; message: string };

const POLL_INTERVAL_MS = 400;

// Polling rapide plutôt que du SSE -- même effet "live" à l'écran (la timeline
// se remplit étape par étape), fiable sur React Native (fetch n'y supporte pas
// de façon robuste la lecture d'un flux en continu). Partagé par les 3 agents
// (plan, chat, analyse) -- chacun n'a qu'à fournir ses 2 chemins et son body.
async function pollAgentEvents<T>(
  startPath: string,
  eventsPathBase: string,
  body: Record<string, any>,
  jwt: string,
  onEvents: (nouveaux: EvenementDebug[]) => void,
): Promise<T> {
  const startRes = await fetch(`${COACH_API_URL}${startPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify(body),
  });
  const startBody = await startRes.json();
  if (!startRes.ok) {
    throw new Error(startBody.message || "Kipper n'a pas pu démarrer. Réessaie.");
  }
  const runId = startBody.run_id as string;

  let since = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const evRes = await fetch(`${COACH_API_URL}${eventsPathBase}/${runId}?since=${since}`);
    const evBody = await evRes.json();
    if (!evRes.ok) {
      throw new Error(evBody.message || 'Le suivi de Kipper a été perdu. Réessaie.');
    }
    if (evBody.events?.length) onEvents(evBody.events);
    since = evBody.next_since;
    if (evBody.done) {
      if (evBody.error) throw new Error(evBody.error);
      return evBody.result as T;
    }
  }
}

export async function questionnerKipperDebug(
  crewId: string,
  question: string,
  utilisateurId: string,
  jwt: string,
  onEvents: (nouveaux: EvenementDebug[]) => void,
): Promise<string> {
  return pollAgentEvents<string>(
    '/coach/chat/start',
    '/coach/chat/events',
    { crew_id: crewId, question, utilisateur_id: utilisateurId },
    jwt,
    onEvents,
  );
}

export async function analyserSeanceDebug(
  sessionId: string,
  crewId: string,
  jwt: string,
  onEvents: (nouveaux: EvenementDebug[]) => void,
): Promise<AnalyseResultat> {
  return pollAgentEvents<AnalyseResultat>(
    '/coach/analyse/start',
    '/coach/analyse/events',
    { session_id: sessionId, crew_id: crewId },
    jwt,
    onEvents,
  );
}

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
