# Implantação (Azure Container Apps)

> **Situação (02/11/2026):** a **fase 1 do ambiente dev** foi provisionada em `brazilsouth` (rede,
> PostgreSQL, ACR, Key Vault, Log Analytics e ambiente Container Apps), com *state* remoto em
> `stconshubtfstate`. Registro, evidências e pendências em
> [auditoria/09](../auditoria/09-execucao-azure-dev.md). A fase 2 (imagens, apps e job de
> migração), os ambientes hml/prod e o workflow **Deploy** ainda **não** foram executados. Azure
> Container Apps foi aceito para dev
> ([ADR-0004](../arquitetura/adr/0004-azure-container-apps.md)); para hml/prod e para a política
> de rede, a confirmação da equipe de plataforma continua pendente.

## 1. Componentes por ambiente (dev, hml, prod)

Resource group `rg-conshub-<env>` com: VNet (sub-redes delegadas ao Container Apps e ao
PostgreSQL), PostgreSQL Flexible Server 16 **sem acesso público** (zona DNS privada), Key Vault
(RBAC, *purge protection*), ACR (sem usuário admin), três identidades gerenciadas — `apps`
(API/worker: AcrPull + leitura **apenas** do segredo `database-url-app`), `migrator` (job: AcrPull +
leitura **apenas** de `database-url-migrator`) e `web` (só AcrPull) —, Log Analytics, ambiente
Container Apps, apps `api` (ingress externo HTTPS), `worker` (sem ingress, probe HTTP interno),
`web` (ingress externo) e job manual `migrate`. Banco e banco de dados têm `prevent_destroy`.

## 2. Pré-requisitos

1. Registros do Entra ID do ambiente (API + SPA) — [autenticacao.md](../arquitetura/autenticacao.md).
   Redirect URI do SPA = origem pública do web com `/` final.
2. Conta de armazenamento para o *state* do Terraform (copie
   `infra/terraform/environments/<env>.backend.hcl.example` para `<env>.backend.hcl`, ignorado pelo Git).
   Dev (02/11/2026): `rg-conshub-tfstate`/`stconshubtfstate` em `eastus2`, contêiner `tfstate`,
   chave `consolidahub-dev.tfstate`; acesso só por Entra ID (`use_azuread_auth = true`, chave
   compartilhada desabilitada) — quem roda o Terraform precisa de *Storage Blob Data Contributor*
   nessa conta.
3. Revisar `environments/<env>.tfvars`: `location` (dev: `brazilsouth` desde 02/11/2026, porque
   `eastus2` recusou o PostgreSQL Flexible nesta assinatura; hml/prod ainda com `eastus2` —
   **confirmar e testar a capacidade antes**), SKUs, IDs do Entra, `web_public_origin`. A região
   precisa suportar zonas de disponibilidade se `postgres_high_availability = true` (*standby* na
   zona `2`; a zona do servidor vem de `postgres_zone`, padrão `1`, ou `null` para o Azure
   escolher). Em dev, os IDs reais e os ajustes locais estão em `environments/dev.auto.tfvars`
   (ignorado pelo Git); informe-o com `-var-file`, porque fora do diretório raiz ele não é carregado
   automaticamente. Opcionais: `key_vault_name` e `log_analytics_name` (seção 8).
4. Identidade de deploy para o GitHub (federação OIDC, sem segredo): credencial federada com
   *subject* `repo:<org>/<repo>:environment:<env>`; **AcrPush** no ACR e, no resource group,
   permissão para ler/atualizar/iniciar Container Apps e jobs (papel interno equivalente ou
   personalizado — validar no primeiro deploy em dev). Não usar *Owner*/*Contributor* na assinatura.
5. GitHub Environments `dev`, `hml`, `prod` (aprovadores obrigatórios em hml e prod) com as
   variáveis: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`,
   `AZURE_RESOURCE_GROUP`, `ACR_NAME`, `CA_API`, `CA_WORKER`, `CA_WEB`, `CAJ_MIGRATE`,
   `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_ENTRA_TENANT_ID`, `NEXT_PUBLIC_ENTRA_CLIENT_ID`,
   `NEXT_PUBLIC_API_SCOPE` (nomes dos recursos: `terraform output`).
6. Provedores de recursos registrados na assinatura: `Microsoft.App`, `Microsoft.ContainerRegistry`,
   `Microsoft.DBforPostgreSQL`, `Microsoft.KeyVault`, `Microsoft.ManagedIdentity`,
   `Microsoft.Network`, `Microsoft.OperationalInsights` e `Microsoft.Storage` (`az provider register
   --namespace <ns>`; sem eles, até a checagem de nome da conta de armazenamento falha com
   `SubscriptionNotFound`).

## 3. Primeiro provisionamento (bootstrap em duas fases)

As Container Apps só sobem se a imagem já existir no ACR, que é criado pelo próprio Terraform.
Na primeira execução o Key Vault pode responder 403 por alguns minutos enquanto a atribuição RBAC
do executor se propaga — repita o `apply`.

```bash
cd infra/terraform
terraform init -backend-config=environments/dev.backend.hcl
# fase 1: rede, registro, identidade, cofre, banco, Log Analytics e ambiente Container Apps
terraform plan  -var-file=environments/dev.tfvars -var-file=environments/dev.auto.tfvars \
  -var image_tag=bootstrap -out dev-fase1.tfplan \
  -target=azurerm_container_registry.main -target=azurerm_role_assignment.apps_acr_pull \
  -target=azurerm_key_vault_secret.database_url_app -target=azurerm_container_app_environment.main
terraform apply dev-fase1.tfplan   # o plano revisado; apague o arquivo depois (tem valores sensíveis)
```

Os alvos trazem as dependências: em dev (02/11/2026) a fase 1 criou **17 recursos** — grupo, VNet e
duas sub-redes, zona DNS privada e vínculo, identidade `apps` com AcrPull, ACR, Key Vault com o
papel *Key Vault Secrets Officer* do executor, senha aleatória do admin, PostgreSQL e banco, segredo
`database-url-app` (placeholder), Log Analytics e o ambiente Container Apps (com custo recorrente
desde a fase 1). Ficam para a fase 2 as identidades `migrator` e `web`, o segredo
`database-url-migrator`, as permissões por segredo, os apps e o job. Se um `apply` parar por erro
transitório do Azure (ex.: sub-rede dada como inexistente logo após criada, ou 404 ao consultar um
recurso recém-criado), gere o plano de novo antes de repetir: recurso criado mas ausente do *state*
→ `terraform import`; recurso marcado como *tainted* mas saudável → `terraform untaint`. Não exclua
recursos para recriá-los sem revisar.

Depois publique as três imagens com o SHA do commit — `az acr login` + `docker build --target
runtime|migrator` / `docker push` (ou o workflow **Deploy**: o push ocorre antes da migração; nesta
fase os passos seguintes falham porque os apps ainda não existem, o que é esperado) — e aplique o
restante:

```bash
terraform plan  -var-file=environments/dev.tfvars -var image_tag=<sha-publicado> -out tfplan
terraform apply tfplan
```

As imagens dos apps são definidas **apenas na criação**; depois o Terraform ignora mudanças de
imagem (`lifecycle.ignore_changes`) e as versões passam a ser publicadas pelo workflow.

## 4. Banco de dados: papéis de menor privilégio (obrigatório antes do uso real)

O Terraform grava dois segredos no Key Vault: `database-url-migrator` (admin; lido só pela
identidade do job de migração) e `database-url-app`, criado com um valor **inválido de propósito**:
API e worker não sobem até o papel restrito existir (falha fechada). Além disso, em produção eles
recusam iniciar se a URL autenticar com o dono das tabelas. Para liberar o uso:

1. Execute a primeira migração (job `migrate`, ver seção 5).
2. A partir de uma máquina com acesso à rede privada do banco (ex.: Cloud Shell com VNet ou
   *jump host*), aplique `infra/database/app-role.sql` com o usuário admin e defina a senha com
   `\password consolidahub_app` ([banco-de-dados.md](banco-de-dados.md#4-papéis-de-banco-menor-privilégio)).
3. Atualize o segredo sem expor o valor no histórico do shell:
   `az keyvault secret set --vault-name <kv> --name database-url-app --file <arquivo-temporário>`
   com `postgresql://consolidahub_app:<senha-url-encoded>@<fqdn>:5432/consolidahub?sslmode=require`;
   apague o arquivo em seguida.
4. Reinicie as revisões ativas da API e do worker para relerem o segredo
   (`az containerapp revision restart -g <rg> -n <app> --revision <revisão>`) ou faça um novo deploy.

O Terraform não sobrescreve `database-url-app` depois de criado (`ignore_changes`).

## 5. Deploy de uma versão

Workflow **Deploy** (`workflow_dispatch`, escolha do ambiente; hml/prod exigem aprovação):

1. Login no Azure por OIDC; build e push de `consolidahub-api`, `consolidahub-migrator` e
   `consolidahub-web` com tag **imutável = SHA do commit** (o web é construído com os
   `NEXT_PUBLIC_*` do ambiente).
2. Atualiza a imagem do job `migrate`, executa e **aguarda** (`prisma migrate deploy` + seed);
   falha interrompe o deploy antes de qualquer troca de versão.
3. Atualiza API, worker e web para a nova imagem (revisão única; o tráfego vai para a nova
   revisão quando os probes passam).

Rollback de aplicação: execute o workflow com um commit anterior (as migrations precisam ser
compatíveis — expandir/contrair). Rollback de esquema: *roll forward* com nova migration ou
restauração *point-in-time* do banco.

## 6. Primeiro administrador

Após o primeiro login da pessoa responsável:

```bash
az containerapp exec -g <rg> -n <ca-api> --command "node dist/database/grant-role.js --tenant-id <tid> --object-id <oid> --role ADMIN"
```

## 7. Checklist de verificação pós-deploy

* `GET https://<api>/api/v1/health/ready` → 200; worker sem reinícios (probe `GET /health/live`).
* Login no web, `GET /auth/me` com papéis corretos; usuário sem papéis recebe 403.
* Fluxo de fumaça: cadastrar fonte, enviar carga pequena, ativar regra, executar, exportar.
* Logs no Log Analytics sem tokens/e-mails; auditoria com `requestId`.
* Conexão da aplicação usando `consolidahub_app` (não o admin).

## 8. Excluir e recriar um ambiente (lições de dev, 02/11/2026)

* Gere `terraform plan -destroy -out <arquivo>`, revise e aplique **esse** plano; confira que só há
  exclusões e só no grupo do ambiente (o *state* remoto e os registros do Entra ID ficam fora).
* PostgreSQL e banco têm `prevent_destroy`: excluí-los exige mudança deliberada e revisada no
  código.
* O Key Vault vai para exclusão reversível com *purge protection* e o nome fica retido até a purga
  (90 dias); o Log Analytics também fica em exclusão reversível. Para recriar antes disso, use
  `key_vault_name`/`log_analytics_name` em `environments/<env>.auto.tfvars` (dev usa
  `kv-conshub-dev-brs` e `log-conshub-dev-brs`).
* Antes de trocar de região, confirme a capacidade do PostgreSQL Flexible criando um servidor de
  teste sem rede num grupo temporário: a API de capacidades não revelou a restrição de `eastus2`.
