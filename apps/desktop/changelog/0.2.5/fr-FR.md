# Nouveautés de la v0.2.5

## Nouvelles fonctionnalités

- Refonte de la traduction d'articles : traduction en flux avec mises à jour progressives, et bascule d'affichage **Bilingue** / **Traduction seule**.
- Import d'historique RSS local : récupérez les entrées disponibles dans la fenêtre actuelle du flux (importées comme lues, sans traitement IA). Les abonnements nouveaux et existants peuvent compléter l'historique lorsque le flux le permet.
- Résumé IA à la demande sur la page article : générez un résumé avec votre clé quand vous en avez besoin, sans lancer automatiquement le résumé sur tout l'historique.

## Améliorations

- Les réglages IA utilisent un vocabulaire plus clair (**modèle LLM** / **modèle Embedding**) à la place du jargon BYOK ; les états vides et les messages d'erreur expliquent le rôle de chaque modèle.
- Le traitement IA automatique (résumé, tags, score de qualité) est **désactivé par défaut** tant que vous n'avez pas configuré un modèle et activé l'option — Focal reste un lecteur RSS local discret dès l'installation.
- Mise en page et descriptions des actions IA revues pour mieux comprendre la consommation de tokens et le comportement « nouveaux non lus uniquement ».
- Navigation Discover simplifiée : suppression des routes et UI centrées sur RSSHub.
- Les tâches d'enrichissement respectent une limite de nouvelles tentatives automatiques avec suivi des échecs, pour éviter les phases bloquées en boucle.
- « Tout marquer comme lu » sur les flux intelligents gère plus fiablement les plages de dates et les limites de liste.
- Les résumés de la liste choisissent mieux les descriptions bilingues ou générées, avec une normalisation Markdown pour le clamp des lignes.

## Corrections

- Placeholders plus clairs pour le panneau de lecture vide et la liste vide (« Sélectionnez un article pour commencer à lire », « C'est calme ici pour le moment »).
- Espacement et libellés du basculeur d'affichage de traduction simplifiés.

## Remerciements

Merci d'utiliser la version v0.2.5 et de nous faire part de vos retours.
