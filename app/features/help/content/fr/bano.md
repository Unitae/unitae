---

slug: bano
title: Comment régler la source des adresses (BANO) ?
summary: La source des adresses des bâtiments, dans Réglages.
module: settings
permission: CanConfigureTerritorySettings
keywords: BANO, adresses, adresse, CSV, département, codes postaux, source, synchronisation, prospection, fichier
related: prospection, phone-territories
order: 1
---

La BANO, la base d’adresses nationale ouverte, fournit les adresses des bâtiments de la prospection. Chaque assemblée indique le fichier CSV de son département.

## Régler la source

1. Dans la barre latérale, ouvrez **Réglages**, puis **Territoires**, et allez à la section **Prospection**.
2. Collez dans **Fichier de la BANO** l’adresse `https` du fichier CSV de votre département. Cette adresse doit venir d’un site autorisé par votre instance.
3. Renseignez les **Codes postaux** : seules les adresses de ces codes sont importées.

   ![Les champs « Fichier de la BANO » et « Codes postaux », dans Réglages › Territoires](capture:settings-bano)

4. Cliquez sur **Enregistrer**.
5. Dans **Prospection**, cliquez sur **Synchroniser…**, puis sur **Lancer la synchronisation**. Le bouton n’apparaît qu’une fois le fichier de la BANO enregistré.

Vider le champ **Fichier de la BANO** arrête la synchronisation. Régler la source demande le droit de configurer les territoires ; lancer la synchronisation demande le droit de gérer les immeubles.
