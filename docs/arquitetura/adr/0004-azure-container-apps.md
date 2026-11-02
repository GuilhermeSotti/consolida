# ADR-0004 — Azure Container Apps em vez de AKS para o MVP

**Status:** proposta — requer confirmação da equipe de plataforma · **Data:** 2026-10-23

## Contexto
O provedor de nuvem não está formalmente registrado nos requisitos; o repositório herdado tinha
Terraform `azurerm` e o login é Microsoft Entra ID, o que indica Azure (inferência registrada, não
decisão de negócio). Os manifestos Kubernetes herdados estavam quebrados (overlay inexistente,
`Role` inválido, NetworkPolicy que bloqueava o Entra ID, `Secret` versionado). O MVP tem três
cargas de trabalho sem estado (API, worker, web) e um job de migração.

## Decisão
Azure Container Apps (perfil Consumption) em ambiente integrado a VNet; PostgreSQL Flexible
Server com acesso privado; Key Vault lido por identidade gerenciada; ACR sem usuário admin;
deploy por GitHub Actions com OIDC. Descrito em `infra/terraform` (não provisionado). Os
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
