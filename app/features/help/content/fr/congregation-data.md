---

slug: congregation-data
title: Comment exporter ou importer les données de l’assemblée ?
summary: Une archive .unitae de toutes les données, pour la garder ou la reprendre ailleurs.
module: settings
permission: CanExportCongregationData, CanImportCongregationData
keywords: export, exporter, import, importer, archive, sauvegarde, données, unitae, transfert, migration, journal d’audit
related: audit-log
order: 4
---

**Réglages › Import et export** fait une archive `.unitae` de toutes les données de l’assemblée, et reprend une archive faite par Unitae, par exemple pour passer d’une instance à une autre.

## Exporter

1. Dans **Réglages › Import et export**, choisissez ce que l’archive contient en plus des données : **Inclure les documents du tableau d’affichage (PDF)** et **Inclure le journal d’audit**. Les deux peuvent beaucoup l’alourdir.
2. Cliquez sur **Lancer l’export**. L’archive se prépare en arrière-plan.

   ![La section Exporter : les documents du tableau, le journal d’audit et Lancer l’export](capture:settings-data-export)

3. Quand elle est prête, cliquez sur **Télécharger l’archive**.

Les archives précédentes restent dans **Exports précédents**, pour les télécharger de nouveau.

## Importer

1. Dans **Importer**, déposez l’archive `.unitae`, puis cliquez sur **Lire l’archive**.
2. L’application montre ce qu’elle contient : les données à importer, les éléments qui existent déjà, mis à jour ou ignorés, et les avertissements.
3. Si tout vous convient, cliquez sur **Lancer l’import**.

Si l’import échoue, les données de l’assemblée ne sont pas modifiées. Importer demande d’être administrateur.
