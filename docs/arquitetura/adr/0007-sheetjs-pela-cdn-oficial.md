# ADR-0007 — SheetJS CE 0.20.3 pela CDN oficial

**Status:** aceita · **Data:** 2026-10-23

## Contexto
A leitura/escrita de XLSX usava `xlsx@0.18.5` do registro npm, afetada por CVE-2023-30533
(prototype pollution, corrigida em 0.19.3) e CVE-2024-22363 (ReDoS, corrigida em 0.20.2). A
SheetJS não publica versões corrigidas no registro npm; a distribuição oficial é
`https://cdn.sheetjs.com`.

## Decisão
Declarar `"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"`; o `package-lock.json`
registra a URL e o hash de integridade (sha512) após `npm install`. Leitura sem fórmulas, HTML,
estilos ou VBA e com limite de linhas.

## Alternativas
* `exceljs` — API diferente e outra cadeia de dependências; troca maior sem ganho funcional.
* Vendorizar o `.tgz` no repositório (`file:vendor/…`) — recomendado se a CI/ambiente corporativo
  não puder acessar a CDN.

## Consequências
* `npm ci` precisa alcançar `cdn.sheetjs.com` (ou o `.tgz` vendorizado).
* `npm audit`/Dependabot não acompanham pacotes de URL: atualizações devem ser verificadas
  manualmente nas notas de versão da SheetJS.
