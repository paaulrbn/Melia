import { ChangelogRelease } from '../types';

export const LATEST_CHANGELOG: ChangelogRelease = {
  version: '0.3.2',
  groups: [
    {
      title: 'Améliorations',
      items: [
        'Changement de qualité d’un film en attente, avec relance de la recherche',
        'Indicateur « Manquant » sur les films et les épisodes absents du serveur',
        'Messages d’erreur lorsque Radarr ou Sonarr est injoignable',
        'Clés et mot de passe stockés dans le trousseau du système',
      ],
    },
    {
      title: 'Corrections de bugs',
      items: [
        'Téléchargements plus fiables : pause, annulation et reprise',
        'Synchronisation allégée en arrière-plan',
      ],
    },
  ],
};
