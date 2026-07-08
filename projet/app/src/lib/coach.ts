// URL du backend Coach Kipper (Flask). Sur macOS le port 5000 est souvent pris par
// AirPlay Receiver, donc le backend tourne ici sur 5050 (PORT=5050 python app.py).
// - Expo web dev : http://localhost:5050
// - Device physique sur le même Wi-Fi : IP LAN du poste qui fait tourner le backend, ex http://192.168.1.X:5050
// - Démo (Wi-Fi isolé) : URL ngrok (`ngrok http 5050`)
export const COACH_API_URL = 'http://localhost:5050';
