---

slug: congregation-data
title: Como exporto ou importo os dados da congregação?
summary: Um arquivo .unitae com todos os dados, para os guardar ou levar para outro lado.
module: settings
permission: CanExportCongregationData, CanImportCongregationData
keywords: exportar, exportação, importar, importação, arquivo, cópia de segurança, dados, unitae, transferência, migração, registo de auditoria
related: audit-log
order: 4
---

**Definições › Importar e exportar** cria um arquivo `.unitae` com todos os dados da congregação, e recebe um arquivo criado pelo Unitae, por exemplo para passar de uma instância para outra.

## Exportar

1. Em **Definições › Importar e exportar**, escolha o que o arquivo inclui além dos dados: **Incluir os documentos do quadro de anúncios (PDF)** e **Incluir o registo de auditoria**. Ambos podem tornar o arquivo muito mais pesado.
2. Clique em **Iniciar exportação**. O arquivo é preparado em segundo plano.

   ![A secção Exportar: os documentos do quadro, o registo de auditoria e Iniciar exportação](capture:settings-data-export)

3. Quando estiver pronto, clique em **Transferir arquivo**.

Os arquivos anteriores ficam em **Exportações anteriores**, para os transferir de novo.

## Importar

1. Em **Importar**, largue o arquivo `.unitae` e clique em **Ler o arquivo**.
2. A aplicação mostra o que ele contém: os dados a importar, os elementos que já existem, atualizados ou ignorados, e os avisos.
3. Se estiver tudo bem, clique em **Iniciar importação**.

Se a importação falhar, os dados da congregação não são alterados. Importar exige ser administrador.
