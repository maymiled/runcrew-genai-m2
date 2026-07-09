FINALIZE_ANALYSE_SCHEMA = {
    "name": "finaliser_analyse_seance",
    "description": (
        "Capture l'analyse post-séance finale et structurée. À appeler en DERNIER, "
        "impérativement APRÈS avoir appelé poster_message_chat pour publier le récap "
        "dans le chat crew. Ce tool ne modifie rien en base — il renvoie uniquement "
        "l'analyse structurée à l'app mobile pour affichage."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "synthese": {
                "type": "string",
                "description": (
                    "Synthèse globale de la séance en 2-3 phrases, "
                    "ton motivant et direct (tutoiement)."
                ),
            },
            "insights_runners": {
                "type": "array",
                "description": "Un insight par runner ayant soumis un bilan.",
                "items": {
                    "type": "object",
                    "properties": {
                        "utilisateur_id": {
                            "type": "string",
                            "description": "UUID du runner (tel que retourné par get_bilans_seance).",
                        },
                        "nom": {"type": "string"},
                        "statut": {
                            "type": "string",
                            "enum": ["progresse", "bon", "stagne", "surintensité", "sous_intensite"],
                            "description": (
                                "progresse = allure en nette amélioration vs historique. "
                                "bon = dans la zone cible, régulier. "
                                "stagne = pas d'évolution sur ≥2 séances. "
                                "surintensité = allure largement > cible (risque surmenage). "
                                "sous_intensite = allure nettement < cible (fatigue/difficulté)."
                            ),
                        },
                        "commentaire": {
                            "type": "string",
                            "description": (
                                "Observation personnalisée pour ce runner (1-2 phrases), "
                                "bienveillante et concrète."
                            ),
                        },
                    },
                    "required": ["utilisateur_id", "nom", "statut", "commentaire"],
                },
            },
            "ajustements_groupes": {
                "type": "array",
                "description": (
                    "Suggestions de changement de groupe pour la prochaine séance. "
                    "Laisse vide si pas de tendance claire sur ≥2 séances."
                ),
                "items": {
                    "type": "object",
                    "properties": {
                        "runner_nom": {"type": "string"},
                        "suggestion": {
                            "type": "string",
                            "description": "Ex: 'Passer du groupe Rythmé au groupe Ambitieux'",
                        },
                        "raison": {
                            "type": "string",
                            "description": "Justification factuelle basée sur les données.",
                        },
                    },
                    "required": ["runner_nom", "suggestion", "raison"],
                },
            },
        },
        "required": ["synthese", "insights_runners", "ajustements_groupes"],
    },
}
