# Nouveautés de la v0.2.6

## Nouvelles fonctionnalités

- **Recherche dans la bibliothèque** : nouvel accès dans la barre latérale (aux côtés de Aujourd’hui / Non lus / Favoris) pour trouver des articles dans tous les abonnements. Les résultats sont classés par pertinence, date et score de qualité, y compris via les titres traduits.
- **Recherche sémantique** : avec l’Embedding activé, la recherche combine mots-clés et similarité vectorielle — synonymes et formulations multilingues peuvent ainsi apparaître. La progression de l’index sémantique s’affiche sous le titre de recherche.
- **Index sémantique sur l’historique lu** : les embeddings couvrent aussi les entrées lues et historiques (indépendamment des résumés/tags LLM — pas de coût modèle de chat supplémentaire pour l’indexation).
- **Taxonomie des tags IA (genre / domaine / sujet)** : types de contenu, domaines et sujets en trois axes. Les anciens labels sont mis à niveau hors ligne via une table de correspondance, sans forcer un re-tag LLM de toute la bibliothèque.

## Améliorations

- Les My Topics par mot-clé peuvent aussi correspondre par similarité sémantique lorsqu’un embedding existe, pas seulement par sous-chaîne dans le titre.
- Libellés de la barre latérale unifiés de « Find » vers « Browse » pour une navigation plus claire.
- L’état sans abonnement ouvre la page Discover au lieu d’une modale d’ajout provisoire.
- Progression et reconstruction des embeddings : libellés mis à jour pour toutes les entrées éligibles (y compris lues).
- Nettoyage des écouteurs d’événements et des dépendances de hooks pour une UI plus stable et moins de re-rendus inutiles.

## Corrections

- Déduplication de la file d’embedding : un même article n’est plus enfilé plusieurs fois (compteur « En file » gonflé, travail redondant, fluidité dégradée).
- Session de recherche simplifiée (champs scope/sort inutilisés retirés) pour éviter des états résiduels.
- Chaînes de localisation recherche/liste complétées et alignées (en / zh-CN / zh-TW / ja / fr-FR).

## Remerciements

Merci d’utiliser la v0.2.6 et de partager vos retours — la recherche et l’index sémantique s’améliorent surtout avec de vraies bibliothèques.
