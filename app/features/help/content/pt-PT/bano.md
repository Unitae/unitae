---

slug: bano
title: Como defino a origem dos endereços (BANO)?
summary: A origem dos endereços dos edifícios, nas Definições.
module: settings
permission: CanConfigureTerritorySettings
keywords: BANO, endereço, endereços, CSV, departamento, códigos postais, origem, sincronização, levantamento, ficheiro
related: prospection, phone-territories
order: 1
---

O BANO, a base de dados nacional francesa de endereços abertos, fornece os endereços dos edifícios usados no levantamento. Cada congregação indica o ficheiro CSV do respetivo departamento.

## Definir a origem

1. Na barra lateral, abra **Definições** e depois **Territórios**. Vá à secção **Levantamento de edifícios**.
2. Cole em **Ficheiro BANO** o endereço `https` do ficheiro CSV do seu departamento. O endereço tem de pertencer a um site permitido nesta instância.
3. Preencha **Códigos postais**: só serão importados os endereços com esses códigos.

   ![Os campos “Ficheiro BANO” e “Códigos postais”, em Definições › Territórios](capture:settings-bano)

4. Clique em **Guardar**.
5. Em **Levantamento de edifícios**, clique em **Sincronizar…** e depois em **Iniciar sincronização**. O botão só aparece depois de guardar o ficheiro BANO.

Se limpar o campo **Ficheiro BANO**, a sincronização é interrompida. Para definir a origem, precisa da permissão para configurar territórios; para iniciar a sincronização, precisa da permissão para gerir edifícios.
