import { ChangelogRelease } from '../types';

export const LATEST_CHANGELOG: ChangelogRelease = {
  version: '0.4.0',
  groups: [
    {
      title: 'Améliorations',
      items: [
        'Chargement de la bibliothèque plus clair',
        'Accès direct aux paramètres si Radarr ou Sonarr n’est pas configuré',
        'Icône sur les films manquants sur le serveur',
        'Textes et champs plus faciles à lire',
      ],
    },
    {
      title: 'Corrections de bugs',
      items: [
        'Sécurité de la connexion améliorée',
      ],
    },
  ],
};
