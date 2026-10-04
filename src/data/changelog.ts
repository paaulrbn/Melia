import { ChangelogRelease } from '../types';

export const LATEST_CHANGELOG: ChangelogRelease = {
  version: '0.3.0',
  groups: [
    {
      title: 'Fonctionnalités',
      items: [
        'Nouvel onglet dédié aux séries',
        'Recherche et ajout de séries',
        'Lecture et téléchargement par saison ou par épisode',
        'Lecture en streaming ou en local',
        'Amélioration globale de l’interface',
      ],
    },
    {
      title: 'Corrections de bugs',
      items: [
        'Optimisation de la file d’attente et de la synchronisation',
        'Amélioration de la stabilité des téléchargements et des reprises',
      ],
    },
  ],
};
