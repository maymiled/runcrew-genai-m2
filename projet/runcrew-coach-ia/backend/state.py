"""État en mémoire du POC — pas de base de données de conversations.

CONVERSATIONS: historique des messages Claude par conversation_id.
PENDING_DRAFTS: brouillon de séance en attente de confirmation humaine,
                par conversation_id (voir agent.py: interception de create_session).
"""

CONVERSATIONS: dict[str, list] = {}
PENDING_DRAFTS: dict[str, dict] = {}
