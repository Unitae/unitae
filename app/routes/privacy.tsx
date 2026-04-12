import { Link } from 'react-router'

import type { Route } from './+types/privacy'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Politique de confidentialité - Unitae' }]
}

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <Link to="/" className="mb-8 inline-block text-blue-600 text-sm hover:text-blue-800">
        &larr; Retour
      </Link>

      <h1 className="mb-8 font-bold text-3xl text-gray-900">Politique de confidentialité</h1>
      <p className="mb-6 text-gray-500 text-sm">Dernière mise à jour : 11 avril 2026</p>

      <div className="space-y-8 text-gray-700 leading-relaxed">
        <section>
          <h2 className="mb-3 font-semibold text-gray-900 text-xl">1. Responsable du traitement</h2>
          <p>
            Chaque assemblée locale (congrégation) utilisant Unitae est <strong>responsable du traitement</strong> de
            ses propres données au sens du Règlement Général sur la Protection des Données (RGPD).
          </p>
          <p className="mt-2">
            MindsersIT, éditeur de la plateforme hébergée unitae.app, agit en qualité de <strong>sous-traitant</strong>{' '}
            (data processor) conformément à l'article 28 du RGPD. Un accord de traitement des données (DPA) est établi
            entre MindsersIT et chaque assemblée locale cliente.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-gray-900 text-xl">2. Données collectées</h2>
          <p>Unitae collecte et traite les catégories de données personnelles suivantes :</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>
              <strong>Données d'identification</strong> : nom, prénom, adresse e-mail
            </li>
            <li>
              <strong>Coordonnées</strong> : numéro de téléphone, adresse postale
            </li>
            <li>
              <strong>Données démographiques</strong> : date de naissance, genre
            </li>
            <li>
              <strong>Données religieuses (catégorie spéciale, article 9)</strong> : date de baptême, statut de
              proclamateur, responsabilités dans l'assemblée (ancien, assistant, oint), activités de service
            </li>
            <li>
              <strong>Données d'activité</strong> : rapports mensuels de service, attributions de territoires
            </li>
            <li>
              <strong>Données techniques</strong> : adresse IP (pour les enregistrements de consentement), données de
              session
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-gray-900 text-xl">3. Données de catégorie spéciale</h2>
          <p>
            La simple présence d'un utilisateur dans Unitae révèle son affiliation religieuse en tant que Témoin de
            Jéhovah. Ces données sont des <strong>données de catégorie spéciale</strong> au sens de l'article 9 du RGPD.
          </p>
          <p className="mt-2">
            Le traitement est fondé sur l'article 9, paragraphe 2, point d) : traitement effectué dans le cadre des
            activités légitimes d'un organisme à but non lucratif poursuivant une finalité religieuse, à condition que
            le traitement se rapporte aux seuls membres de cet organisme et que les données ne soient pas communiquées
            en dehors de celui-ci sans le consentement des personnes concernées.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-gray-900 text-xl">4. Bases légales du traitement</h2>
          <ul className="list-inside list-disc space-y-1">
            <li>
              <strong>Exécution du contrat</strong> (art. 6.1.b) : fourniture du service de gestion d'assemblée
            </li>
            <li>
              <strong>Intérêt légitime</strong> (art. 6.1.f) : sécurité, journalisation, prévention de la fraude
            </li>
            <li>
              <strong>Obligation légale</strong> (art. 6.1.c) : conservation des données de facturation
            </li>
            <li>
              <strong>Consentement</strong> (art. 6.1.a) : cookies non essentiels, communications marketing
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-gray-900 text-xl">5. Finalités du traitement</h2>
          <ul className="list-inside list-disc space-y-1">
            <li>Gestion des membres et des responsabilités de l'assemblée</li>
            <li>Suivi de l'activité de service (rapports mensuels)</li>
            <li>Gestion des territoires et des attributions</li>
            <li>Tableau d'affichage et gestion documentaire</li>
            <li>Gestion des événements et programmes</li>
            <li>Authentification et sécurité des comptes</li>
            <li>Communications par e-mail (réinitialisation de mot de passe, notifications)</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-gray-900 text-xl">6. Durées de conservation</h2>
          <ul className="list-inside list-disc space-y-1">
            <li>Comptes utilisateurs : durée d'appartenance + 30 jours</li>
            <li>Rapports d'activité : durée d'appartenance (configurable par l'assemblée)</li>
            <li>Attributions de territoires : durée du compte de l'assemblée</li>
            <li>Documents du tableau : jusqu'à suppression par l'administrateur + 30 jours</li>
            <li>Cookies de session : 1 heure</li>
            <li>Tokens de réinitialisation : 24 heures</li>
            <li>Enregistrements de consentement : 2 ans après retrait</li>
            <li>Données de facturation : 10 ans (obligation légale)</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-gray-900 text-xl">7. Sous-traitants</h2>
          <p>Les données sont traitées par les sous-traitants suivants :</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>
              <strong>OVH</strong> (France) — Hébergement cloud et infrastructure
            </li>
            <li>
              <strong>Resend</strong> (États-Unis) — Envoi d'e-mails transactionnels
            </li>
            <li>
              <strong>Stripe</strong> (États-Unis) — Traitement des paiements
            </li>
            <li>
              <strong>Google Maps Platform</strong> (États-Unis) — Affichage de cartes
            </li>
          </ul>
          <p className="mt-2">
            Les transferts vers les États-Unis sont encadrés par le Data Privacy Framework (DPF) UE-États-Unis ou des
            clauses contractuelles types.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-gray-900 text-xl">8. Vos droits</h2>
          <p>Conformément au RGPD, vous disposez des droits suivants :</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>
              <strong>Droit d'accès</strong> (art. 15) : obtenir une copie de vos données personnelles
            </li>
            <li>
              <strong>Droit de rectification</strong> (art. 16) : corriger des données inexactes
            </li>
            <li>
              <strong>Droit à l'effacement</strong> (art. 17) : demander la suppression de vos données
            </li>
            <li>
              <strong>Droit à la portabilité</strong> (art. 20) : recevoir vos données dans un format structuré
            </li>
            <li>
              <strong>Droit à la limitation</strong> (art. 18) : geler le traitement de vos données
            </li>
            <li>
              <strong>Droit d'opposition</strong> (art. 21) : vous opposer au traitement
            </li>
            <li>
              <strong>Retrait du consentement</strong> : retirer votre consentement à tout moment
            </li>
          </ul>
          <p className="mt-2">
            Pour exercer ces droits, adressez-vous à l'administrateur de votre assemblée locale. Pour la plateforme
            hébergée unitae.app, vous pouvez également contacter MindsersIT à l'adresse :{' '}
            <strong>privacy@mindsers.it</strong>
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-gray-900 text-xl">9. Sécurité</h2>
          <p>Unitae met en œuvre les mesures de sécurité suivantes :</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>Chiffrement des données en transit (TLS)</li>
            <li>Hachage des mots de passe (bcrypt)</li>
            <li>Isolation des données par assemblée (Row-Level Security)</li>
            <li>Contrôle d'accès basé sur les rôles (14 rôles)</li>
            <li>Cookies de session sécurisés (httpOnly, secure, SameSite)</li>
            <li>Limitation du nombre de tentatives de connexion</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-gray-900 text-xl">10. Cookies</h2>
          <p>
            Unitae utilise uniquement un <strong>cookie de session</strong> strictement nécessaire au fonctionnement de
            l'authentification. Ce cookie ne nécessite pas de consentement.
          </p>
          <p className="mt-2">
            L'intégration optionnelle de Google Maps peut charger des cookies tiers. Dans ce cas, votre consentement
            explicite est demandé avant tout chargement.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-gray-900 text-xl">11. Réclamation</h2>
          <p>
            Si vous estimez que le traitement de vos données personnelles constitue une violation du RGPD, vous avez le
            droit d'introduire une réclamation auprès de la{' '}
            <strong>Commission Nationale de l'Informatique et des Libertés (CNIL)</strong> — www.cnil.fr.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-gray-900 text-xl">12. Auto-hébergement</h2>
          <p>
            Unitae est un logiciel open source (AGPL-3.0). Les instances auto-hébergées sont sous la seule
            responsabilité de l'entité qui les déploie. MindsersIT n'a aucun rôle de sous-traitant dans ce cas, car
            aucune donnée ne transite par ses systèmes.
          </p>
        </section>
      </div>
    </div>
  )
}
