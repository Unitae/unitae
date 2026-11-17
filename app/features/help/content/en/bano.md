---

slug: bano
title: How do I set the address source (BANO)?
summary: The source of the building addresses, in Settings.
module: settings
permission: CanConfigureTerritorySettings
keywords: BANO, address, addresses, CSV, department, postal codes, source, sync, survey, file
related: prospection, phone-territories
order: 1
---

BANO, the French national open address base, provides the addresses of the buildings in the building survey. Each congregation gives the CSV file of its department.

## Set the source

1. In the sidebar, open **Settings**, then **Territories**, and go to the **Building survey** section.
2. Paste the `https` address of the CSV file of your department into **BANO file**. That address must come from a site your instance allows.
3. Fill in the **Postal codes**: only the addresses of these codes are imported.
4. Click **Save**.
5. In **Building survey**, click **Sync…**, then **Start the sync**. The button appears only once the BANO file is saved.

Clearing the **BANO file** field stops the sync. Setting the source requires the right to configure territories; starting the sync requires the right to manage the buildings.
