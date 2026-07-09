import { RoleMembre } from './base';

export type Crew = {
  id: string;
  nom: string;
  slug: string;
  description: string | null;
  ville: string;
  nombre_membres: number;
  total_sorties: number;
  serie_actuelle: number;
  capitaine_id: string;
  code_invitation: string;
  max_membres: number;
  photo_url: string | null;
  cree_le: string;
  modifie_le: string;
};

export type Membre = {
  id: string;
  crew_id: string;
  utilisateur_id: string;
  role: RoleMembre;
  sorties_presentes: number;
  serie_actuelle: number;
  meilleure_serie: number;
  rejoint_le: string;
};