import { PlanAbonnement } from './base';

export type Profil = {
  id: string;
  nom_utilisateur: string;
  nom_affichage: string;
  bio: string | null;
  ville: string | null;
  allure_footing: string | null;
  total_sorties: number;
  total_km: number;
  plan: PlanAbonnement;
  strava_id: string | null;
  cree_le: string;
  modifie_le: string;
};