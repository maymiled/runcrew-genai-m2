FINALIZE_TOOL_SCHEMA = {
    "name": "finaliser_plan_session",
    "description": (
        "Capture le plan de séance final et structuré. À appeler exactement une "
        "fois, en dernier, une fois le plan entièrement conçu. Ce tool n'écrit "
        "RIEN en base de données — il sert uniquement à renvoyer le brouillon "
        "structuré au capitaine pour relecture avant publication."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "titre": {"type": "string"},
            "type_entrainement": {
                "type": "string",
                "enum": ["fractionne", "seuil", "tempo", "footing", "sortie_longue", "libre"],
            },
            "heure_rdv": {
                "type": "string",
                "description": "Date/heure du rendez-vous au format ISO 8601, ex. 2026-07-10T18:30:00Z",
            },
            "duree_entrainement_min": {"type": "integer"},
            "distance_km": {"type": ["number", "null"]},
            "point_rdv": {"type": ["string", "null"]},
            "deroulement": {
                "type": "array",
                "description": "Toujours un tableau plat d'étapes, jamais un objet {format: 'workout_v2'}.",
                "items": {
                    "type": "object",
                    "properties": {
                        "ordre": {"type": "integer"},
                        "titre": {"type": "string"},
                        "duree_min": {"type": "integer"},
                        "description": {"type": "string"},
                    },
                    "required": ["ordre", "titre", "duree_min", "description"],
                },
            },
            "groupes": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "nom": {"type": "string"},
                        "allure_basse": {"type": "number"},
                        "allure_haute": {"type": "number"},
                        "consignes": {"type": ["string", "null"]},
                        "ordre": {"type": "integer"},
                    },
                    "required": ["nom", "allure_basse", "allure_haute", "ordre"],
                },
            },
        },
        "required": [
            "titre",
            "type_entrainement",
            "heure_rdv",
            "duree_entrainement_min",
            "deroulement",
            "groupes",
        ],
    },
}
