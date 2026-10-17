import { ChangelogRelease } from '../types';

export const LATEST_CHANGELOG: ChangelogRelease = {
  version: '0.3.3',
  groups: [
    {
      title: 'Améliorations',
      items: [
        'Mot de passe et clés masqués dans les paramètres, avec un bouton pour les afficher',
      ],
    },
    {
      title: 'Corrections de bugs',
      items: [
        'Les valeurs secrètes ne s’affichent plus au survol de la souris',
      ],
    },
  ],
};
