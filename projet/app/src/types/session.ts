import { StatutConfirmation, TypeEntrainement } from './base';

export type EtapeDeroulement = {
  ordre: number;
  titre: string;
  duree_min: number;
  description: string;
};

export type Session = {
  id: string;
  crew_id: string;
  cree_par: string;
  titre: string;
  description: string | null;
  type_entrainement: TypeEntrainement;
  heure_rdv: string;
  duree_entrainement_min: number | null;
  distance_km: number | null;
  point_rdv: string | null;
  deroulement: EtapeDeroulement[] | { format: 'workout_v2'; blocs: any[] } | null;
  nb_presents: number;
  validee?: boolean;
  cree_le: string;
  modifie_le: string;
};

export type GroupeAllure = {
  id: string;
  session_id: string;
  nom: string;
  allure_basse: number;
  allure_haute: number;
  consignes: string | null;
  ordre: number;
  cree_le: string;
};

export type Confirmation = {
  id: string;
  session_id: string;
  utilisateur_id: string;
  statut: StatutConfirmation;
  cree_le: string;
  modifie_le: string;
};