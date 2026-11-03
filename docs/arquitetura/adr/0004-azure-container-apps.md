# ADR-0004 — Azure Container Apps em vez de AKS para o MVP

**Status:** aceita para o ambiente dev (confirmada pelo responsável do projeto em 2026-11-02); hml/prod e política de rede ainda requerem confirmação da equipe de plataforma · **Data:** 2026-10-23 · **Revisão:** 2026-11-02

## Contexto
O provedor de nuvem não está formalmente registrado nos requisitos; o repositório herdado tinha
Terraform `azurerm` e o login é Microsoft Entra ID, o que indica Azure (inferência registrada, não
decisão de negócio). Os manifestos Kubernetes herdados estavam quebrados (overlay inexistente,
`Role` inválido, NetworkPolicy que bloqueava o Entra ID, `Secret` versionado). O MVP tem três
cargas de trabalho sem estado (API, worker, web) e um job de migração.

## Decisão
Azure Container Apps (perfil Consumption) em ambiente integrado a VNet; PostgreSQL Flexible
Server com acesso privado; Key Vault lido por identidade gerenciada; ACR sem usuário admin;
deploy por GitHub Actions com OIDC. Descrito em `infra/terraform`; a fase 1 de dev foi provisionada em 2026-11-02 (ver atualização). Os
manifestos Kubernetes foram removidos.

## Alternativas
* **AKS** — controle total, porém exige operar cluster, ingress, cert-manager, autoscaler,
  atualizações de nós e políticas de rede; desproporcional para três contêineres.
* App Service — viável para API/web, mas o worker e o job de migração ficam menos naturais.

## Consequências
* Menos superfície operacional; escala e revisões gerenciadas; probes HTTP/TCP apenas (o worker
  expõe `GET /health/live` em porta interna).
* Recursos avançados de rede (WAF, *private endpoints* para Key Vault/ACR) precisam ser
  acrescentados conforme a política corporativa.
* Se a organização padronizar AKS, as imagens e o modelo de configuração continuam válidos; só a
  camada `infra/` muda.

## Atualização 2026-11-02 — ambiente dev

* O responsável pelo projeto confirmou Azure Container Apps para o ambiente **dev** (pendência B7).
* Região de dev: `brazilsouth`. Em `eastus2` (região herdada) a assinatura recebeu `SkuNotAvailable`
  em 4 tentativas de criar o PostgreSQL Flexible (B1ms, B2s, com e sem zona fixa), embora a API de
  capacidades listasse os tamanhos sem restrição. Num teste em grupo temporário, o B1ms foi criado
  em `centralus`, `southcentralus` e `brazilsouth` e recusado em `eastus` e `westus3`.
* `environments/hml.tfvars` e `prod.tfvars` continuam com `eastus2`: confirmar a região e testar a
  capacidade antes de provisionar.
* O *state* remoto de dev ficou em `eastus2` (`rg-conshub-tfstate`), separado dos recursos.
* Rede: ACR, Key Vault e Log Analytics foram criados com acesso público autenticado, como na
  configuração atual; *private endpoints* e WAF continuam dependendo da política corporativa.
* Registro e evidências: [auditoria/09](../../auditoria/09-execucao-azure-dev.md).
