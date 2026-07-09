FINALIZE_CHAT_SCHEMA = {
    "name": "finaliser_reponse_chat",
    "description": (
        "Capture la réponse finale de Kipper à poster dans le chat du crew. "
        "Appelle ce tool une seule fois, en dernier absolu. La réponse doit être "
        "directement lisible dans un chat — pas de markdown, pas de listes à puces."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "reponse": {
                "type": "string",
                "description": (
                    "Réponse de Kipper (3-6 phrases max). En français, tutoiement, "
                    "ton direct et bienveillant. Actionnable et sans markdown."
                ),
            }
        },
        "required": ["reponse"],
    },
}
