// URL du backend Coach IA (Flask). Adapter selon le contexte de test :
// - Expo web dev : http://localhost:5000 (ou le port choisi côté backend)
// - Device physique sur le même Wi-Fi : IP LAN du poste qui fait tourner le backend
// - Démo (Wi-Fi isolé) : URL ngrok (`ngrok http 5000`)
export const COACH_API_URL = 'http://localhost:5000';
