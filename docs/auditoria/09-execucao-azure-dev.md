# Execução das pendências de Azure em dev (27/10 a 02/11/2026)

> Registro gerado em 02/11/2026 21:25 por `gerar_docs_execucao.py` (pasta de operações
> `consolidahub-ops-2026-10-27`, fora do repositório) a partir das saídas `out/*.json` dos
> scripts, que só guardam dados não secretos. Não contém senhas, tokens, chaves de acesso nem
> connection strings; identificadores (tenant, assinatura, appId, IDs de recursos) não são
> segredos. Marcadores: **[planejamento]** decisão ou plano · **[execução]** operação feita no
> Azure, no Entra ID ou em arquivos · **[validação]** conferência posterior, somente leitura.
> Evidência ausente é declarada como ausente.

## Resumo

| Item | Situação | Onde |
| --- | --- | --- |
| B6 — registros do Entra ID | **Concluída em dev:** registros API e SPA criados e conferidos por configuração (sem segredos, sem consentimento administrativo). Login real depende de B10; hml/prod pendentes | §5, §10 |
| B7 — plataforma e região | Azure Container Apps aceito pelo responsável para dev; região de dev `brazilsouth`; política de rede e hml/prod em aberto | §1, §11 |
| B8 — infraestrutura | **Fase 1 de dev aplicada** (9 recursos ARM no grupo; 18 endereços no *state*); plano de conferência sem diferenças. Faltam a fase 2 (imagens, apps, job) e hml/prod | §4, §10 |
| `.env` local | 8 variável(is) em `.env` e 3 em `web/.env.local` (só nomes no §8) | §8 |
| Usuários e grupos | Nenhum criado: a documentação não define nenhum | §6 |
| Domínio e DNS | Nenhuma alteração: a documentação não define domínio; só zona DNS privada do banco | §7 |
| AI-Harness | Maestro com `analyst` e `reviewer` reais (provider Anthropic) | §9 |
| B9, B10, fase 2, hml/prod | Pendentes (dependem de ação externa) | §13 |

## 1. Escopo, método e aprovações

* **[planejamento] Pedido (27/10/2026):** executar as pendências de Azure documentadas — registros
  do Entra ID (B6), confirmação de plataforma e região (B7) e provisionamento de dev (B8) — e
  preencher o `.env` local ([06](06-pendencias-para-producao.md), [deploy.md](../guias/deploy.md),
  [autenticacao.md](../arquitetura/autenticacao.md),
  [ambiente-local.md](../guias/ambiente-local.md)). A documentação não define usuários, grupos nem
  domínio próprio para o ConsolidaHub; por isso nada disso foi criado.
* **Método:** scripts PowerShell da pasta de operações, executados pelo responsável no próprio
  computador com a sessão do Azure CLI já autenticada. O Claude preparou e corrigiu os scripts e
  analisou as saídas compartilhadas; não teve acesso direto ao Azure, ao Entra ID nem a credenciais.
  Mudanças no Azure só com `-Apply` e confirmação [S/N], depois de simulação ou de plano salvo e
  revisado.
* **AI-Harness:** o Maestro coordenou `analyst` (pendências × estado real) e `reviewer` (plano e
  resultados) com provider real (§9). Os agentes só leem evidências; não executam operações.

| Data | Decisão explícita do responsável |
| --- | --- |
| 27/10/2026 | Executar os scripts no próprio computador; rodar o harness com limite de tempo maior |
| 02/11/2026 | Usar o provider Anthropic no harness (inclui instalar o extra `.[anthropic]` no venv do harness) |
| 02/11/2026 | B7: Azure Container Apps (ADR-0004) com a região documentada, `eastus2`; aplicar a fase 1 em dev com custo recorrente |
| 02/11/2026 | Após 4 recusas do PostgreSQL em `eastus2`: testar outras regiões (grupo temporário, custo de centavos) |
| 02/11/2026 | Região de dev `brazilsouth`; excluir os recursos de dev em `eastus2` com plano revisado antes e recriá-los, com as alterações versionadas no Terraform |

## 2. Estado inicial [validação]

Inventário somente leitura de 02/11/2026 15:54 (`00-inventario.ps1`), antes de qualquer criação no
Entra ID ou no Azure.

* Ferramentas: Azure CLI 2.91.0; Terraform ausente (instalado depois, via winget); Docker ausente;
  Git presente; Node ausente; Python do harness 3.15.2.
* Conta: tenant `35b34481-97a6-48db-a197-5506a81633fe`; assinatura
  `489067a9-c3bb-420b-917b-3c77330b2971` (ConsolidaHub-Development, Enabled; oferta
  `PayAsYouGo_2014-09-01`, limite de gasto `Off`).
* Permissões do executor: Owner (assinatura), User Access Administrator (raiz); funções no
  diretório: Global Administrator; usuários comuns podem registrar aplicativos: sim.
* Entra ID: 0 registro(s) e 0 service principal(s) `ConsolidaHub*`; 2 domínio(s) no tenant, 1
  personalizado(s).
* Azure: 0 grupo(s) de recursos; 0 recurso(s) com `conshub`/`consolida` no nome ou na tag;
  provedores sem registro: `Microsoft.App`, `Microsoft.ContainerRegistry`,
  `Microsoft.DBforPostgreSQL`, `Microsoft.KeyVault`, `Microsoft.ManagedIdentity`,
  `Microsoft.Network`, `Microsoft.OperationalInsights`, `Microsoft.Storage`; 0 atribuição(ões) de
  política.
* Cofres em exclusão reversível `kv-conshub*`: nenhum.
* Capacidade do PostgreSQL Flexible segundo a API de capacidades: eastus2: B1ms listado, restrições
  Disabled; brazilsouth: B1ms listado, restrições Disabled.
* AI-Harness: Ollama acessível; testes do harness (pytest) exit 0 — `83 passed in 11.97s`.
* Repositório: branch `refactor/consolidahub-fundacao` @ `dec6959`, 0 alteração(ões) locais
  pendentes.

## 3. Linha do tempo

1. **27/10 a 02/11 [planejamento]** Inventário somente leitura, leitura da documentação e preparo
   dos scripts. O Maestro com o modelo local (Ollama, `qwen3.8:27b` em CPU) não concluiu as tarefas:
   a CLI e o MCP do harness limitam cada tarefa a 30 s, e mesmo pelo executor com limite maior as
   execuções expiraram.
2. **02/11 [planejamento]** Decisões do responsável (§1). Antes de cada execução do Maestro,
   diagnóstico do provider Anthropic (lista de modelos e chamada mínima).
3. **02/11 [planejamento]** Maestro `a59fa23d-20c7-42a3-bea9-a6fcf84d8d24`: `analyst` comparou
   pendências e estado real, `reviewer` revisou o plano (§9.1). O responsável decidiu prosseguir com
   1 achado *high* (caminho de acesso à rede privada do banco para B9), que continua pendente.
4. **02/11 [execução]** Registros do Entra ID, com simulação antes e verificação depois (§5); `.env`
   e `web/.env.local` (§8); Terraform 1.16.6 instalado via winget e preparado (`dev.backend.hcl` e
   `dev.auto.tfvars`, ignorados pelo Git; `init -backend=false`; `validate`).
5. **02/11 [execução]** Registro dos provedores de recursos na assinatura (a checagem de nome da
   conta de armazenamento respondia `SubscriptionNotFound`) e criação do *state* remoto (§4.1).
6. **02/11 [execução]** Fase 1 em `eastus2`: o PostgreSQL Flexible foi recusado 4 vezes com
   `SkuNotAvailable` (B1ms, B2s e sem zona fixa — a zona passou a ser configurável); 14 recursos de
   dev chegaram a ser criados nessa região.
7. **02/11 [execução]** Teste de criação do PostgreSQL B1ms em 5 regiões, em grupo temporário
   excluído no fim (§4.3).
8. **02/11 [execução]** Exclusão dos recursos de dev em `eastus2` a partir de plano salvo e revisado
   (aprovação explícita) e ajuste versionado do Terraform para a nova região (§11).
9. **02/11 [execução]** Fase 1 em `brazilsouth`: plano com 17 criações; a primeira aplicação parou
   em dois erros transitórios (sub-rede do PostgreSQL dada como inexistente logo após criada; 404 ao
   consultar o Log Analytics recém-criado). Reconciliação do *state* sem excluir nada (untaint
   `azurerm_log_analytics_workspace.main`; exit 0) e nova aplicação (exit 0).
10. **02/11 [validação]** Validação somente leitura (`09`) e revisão dos resultados pelo `reviewer`
    (Maestro `36222849-6fea-4e22-ac3d-7d6a23343852`, §9.2).
11. **02/11 [validação]** Revalidação, conferência do Terraform (*state* × Azure) e esta atualização
    da documentação (script `15`).

Última execução do orquestrador `executar-pendencias.ps1` (registro de 02/11/2026 20:39):

| Passo | Nome | Exit |
| --- | --- | --- |
| 7 | Plano da fase 1 | 0 |
| 8 | Aplicar fase 1 | 0 |
| 9 | Validação final (somente leitura) | 0 |
| 10 | Maestro: reviewer dos resultados | 0 |

## 4. Recursos criados [execução]

### 4.1 State remoto do Terraform

* Grupo `rg-conshub-tfstate`, conta `stconshubtfstate` (região `eastus2`), contêiner `tfstate`,
  chave `consolidahub-dev.tfstate` (`dev.backend.hcl`, ignorado pelo Git).
* Configuração aplicada pelo script `05`: StorageV2/LRS, TLS 1.2, chave compartilhada desabilitada,
  sem acesso público a blobs, versionamento e exclusão reversível de blobs (30 dias); papel *Storage
  Blob Data Contributor* só nessa conta para quem executa o Terraform. Conferência no §10.
* Ações registradas: criar grupo de recursos rg-conshub-tfstate em eastus2, criar conta
  stconshubtfstate (StorageV2, Standard_LRS, TLS1_2, sem chave compartilhada, sem acesso público),
  ativar versionamento e exclusão reversível (30 dias) dos blobs do state, atribuir 'Storage Blob
  Data Contributor' ao usuário logado, somente no escopo da conta stconshubtfstate, criar contêiner
  tfstate.

### 4.2 Ambiente dev — fase 1 (brazilsouth)

Última aplicação: exit 0 em 02/11/2026 20:38; recursos ARM no grupo `rg-conshub-dev`:

| Nome | Tipo | Região |
| --- | --- | --- |
| `conshub-dev.private.postgres.database.azure.com` | Microsoft.Network/privateDnsZones | global |
| `acrconshubdev` | Microsoft.ContainerRegistry/registries | brazilsouth |
| `id-conshub-dev-apps` | Microsoft.ManagedIdentity/userAssignedIdentities | brazilsouth |
| `kv-conshub-dev-brs` | Microsoft.KeyVault/vaults | brazilsouth |
| `log-conshub-dev-brs` | Microsoft.OperationalInsights/workspaces | brazilsouth |
| `vnet-conshub-dev` | Microsoft.Network/virtualNetworks | brazilsouth |
| `conshub-dev.private.postgres.database.azure.com/link-conshub-dev` | Microsoft.Network/privateDnsZones/virtualNetworkLinks | global |
| `psql-conshub-dev` | Microsoft.DBforPostgreSQL/flexibleServers | brazilsouth |
| `cae-conshub-dev` | Microsoft.App/managedEnvironments | brazilsouth |

Endereços no *state* (`terraform state list`, 02/11/2026 21:20):
`data.azurerm_client_config.current`, `azurerm_container_app_environment.main`,
`azurerm_container_registry.main`, `azurerm_key_vault.main`,
`azurerm_key_vault_secret.database_url_app`, `azurerm_log_analytics_workspace.main`,
`azurerm_postgresql_flexible_server.main`, `azurerm_postgresql_flexible_server_database.app`,
`azurerm_private_dns_zone.postgres`, `azurerm_private_dns_zone_virtual_network_link.postgres`,
`azurerm_resource_group.main`, `azurerm_role_assignment.apps_acr_pull`,
`azurerm_role_assignment.deployer_kv_secrets_officer`, `azurerm_subnet.aca`,
`azurerm_subnet.postgres`, `azurerm_user_assigned_identity.apps`, `azurerm_virtual_network.main`,
`random_password.postgres_admin`.

Também fazem parte da fase 1, sem aparecer como recurso de topo: as sub-redes `snet-aca` e
`snet-postgres`, o banco `consolidahub`, as atribuições de papel (AcrPull da identidade `apps`; *Key
Vault Secrets Officer* do executor no cofre) e o segredo `database-url-app`, criado com valor
inválido de propósito (falha fechada até B9).

### 4.3 Recursos temporários e excluídos

Teste de regiões (02/11/2026 19:16): grupo temporário `rg-conshub-probe-202611021910`, servidores
Standard_B1ms sem acesso de rede; o grupo foi excluído no fim (o responsável conferiu `az group
exists` = `false`).

| Região | Resultado | Código |
| --- | --- | --- |
| `eastus` | recusado na criação | ParameterOutOfRange |
| `centralus` | OK (Ready) | — |
| `westus3` | falhou no provisionamento | SkuNotAvailable |
| `southcentralus` | OK (Ready) | — |
| `brazilsouth` | OK (Ready) | — |

Exclusão do dev em `eastus2` (02/11/2026 20:00, modo aplicado, exit 0):
`azurerm_container_app_environment.main`, `azurerm_container_registry.main`,
`azurerm_key_vault.main`, `azurerm_log_analytics_workspace.main`,
`azurerm_private_dns_zone.postgres`, `azurerm_private_dns_zone_virtual_network_link.postgres`,
`azurerm_resource_group.main`, `azurerm_role_assignment.apps_acr_pull`,
`azurerm_role_assignment.deployer_kv_secrets_officer`, `azurerm_subnet.aca`,
`azurerm_subnet.postgres`, `azurerm_user_assigned_identity.apps`, `azurerm_virtual_network.main`,
`random_password.postgres_admin`.

Em exclusão reversível com *purge protection* (nome retido até a purga): `kv-conshub-dev` (purga
31/01/2027).

## 5. Registros de aplicativo no Entra ID [execução]

| Registro | Finalidade | appId (client ID) | objectId | Service principal |
| --- | --- | --- | --- | --- |
| ConsolidaHub API (dev) | API: valida access tokens v2 do escopo `access_as_user` | `e1396da9-b5d8-4365-a27c-23c37ab0fe35` | `b9881a64-08be-46c1-a3e9-61d834381c4f` | `ff9b1c74-08be-4107-9547-1c8bf7353e50` |
| ConsolidaHub Web (dev) | SPA (Next.js): login com Authorization Code + PKCE, sem segredo | `29163ffc-63d3-40ee-a163-b7ee9c9c2117` | `0ea90f2f-6614-48a7-9e45-0def60579ecd` | `d6a3b0ab-280a-4ebf-a1cf-62387ae3344c` |

* API: single tenant; Application ID URI `api://e1396da9-b5d8-4365-a27c-23c37ab0fe35`; escopo
  `access_as_user` (id `f7b5d18d-2f7e-432c-8023-5026fb09918d`); `requestedAccessTokenVersion = 2`;
  sem app roles; sem segredos ou certificados; SPA pré-autorizado só nesse escopo.
* SPA: plataforma *single-page application*; redirect URIs `http://localhost:3001/`; implicit grant
  desligado; permissão delegada `access_as_user` da API; sem segredos ou certificados.
* Nenhum consentimento administrativo foi concedido e nenhum client secret foi gerado. Redirect URI
  da origem publicada do web: pendente (depende da fase 2).
* Verificação do script `02` (02/11/2026 16:04): apiSingleTenant OK, apiIdentifierUri OK, apiTokenV2
  OK, apiScopeEnabled OK, apiNoSecrets OK, apiNoAppRoles OK, spaSingleTenant OK, spaRedirectUris OK,
  spaImplicitGrantOff OK, spaNoSecrets OK, spaHasApiScope OK, spaPreAuthorized OK.

## 6. Usuários e grupos

Nenhum usuário, grupo, licença ou função de diretório foi criado ou atribuído: a documentação não
prevê nenhum (os papéis do ConsolidaHub são locais,
[ADR-0005](../arquitetura/adr/0005-identidade-entra-id-e-rbac-local.md)). O primeiro administrador é
concedido na aplicação após o primeiro login ([deploy.md
§6](../guias/deploy.md#6-primeiro-administrador)), ainda pendente. As únicas atribuições RBAC novas
estão no §4.

## 7. Domínio e DNS

Nenhum domínio foi comprado, verificado ou alterado e nenhum registro DNS público (NS, MX, CNAME)
foi tocado: a documentação não define domínio próprio. O único DNS criado é a zona privada
`conshub-dev.private.postgres.database.azure.com`, vinculada à VNet, para resolver o PostgreSQL. A
origem pública do web (`web_public_origin`, hoje `https://consolidahub-dev.example.invalid` em
`dev.tfvars`) só existirá na fase 2.

## 8. Variáveis de ambiente configuradas (somente nomes) [execução]

* `.env` (raiz, ignorado pelo Git): `ENTRA_TENANT_ID`, `ENTRA_API_CLIENT_ID`,
  `ENTRA_ALLOWED_CLIENT_IDS`, `NEXT_PUBLIC_ENTRA_CLIENT_ID`, `NEXT_PUBLIC_API_SCOPE`,
  `POSTGRES_PASSWORD`, `DATABASE_URL`, `SHADOW_DATABASE_URL`.
* `web/.env.local` (ignorado pelo Git): `NEXT_PUBLIC_ENTRA_TENANT_ID`,
  `NEXT_PUBLIC_ENTRA_CLIENT_ID`, `NEXT_PUBLIC_API_SCOPE`.
* `POSTGRES_PASSWORD` foi gerada aleatoriamente (32 caracteres) sem ser exibida, e a senha de
  `DATABASE_URL`/`SHADOW_DATABASE_URL` foi alinhada a ela. Os valores ficam só nesses arquivos, para
  desenvolvimento local.
* Verificação do script `03` (02/11/2026 16:04): ENTRA_TENANT_ID e GUID OK, ENTRA_API_CLIENT_ID e
  GUID OK, ENTRA_ALLOWED_CLIENT_IDS = SPA OK, NEXT_PUBLIC_API_SCOPE = api://<API>/access_as_user OK,
  DATABASE_URL postgresql:// OK, POSTGRES_PASSWORD sem placeholder OK, senha de DATABASE_URL =
  POSTGRES_PASSWORD OK, web: NEXT_PUBLIC_ENTRA_TENANT_ID OK, web: NEXT_PUBLIC_ENTRA_CLIENT_ID OK,
  web: NEXT_PUBLIC_API_SCOPE OK.

## 9. AI-Harness — execuções reais do Maestro

Executor `harness/executar_maestro.py` (pasta de operações): API de biblioteca do harness (`Maestro`
e registro de agentes reais), plano explícito (`analyst → reviewer`, ou só `reviewer`), limite por
tarefa configurável e leitura restrita a uma pasta de evidências sem segredos. Provider Anthropic
com adaptador no executor (`max_tokens` 16000, sem raciocínio estendido, extração do JSON, metadados
de cada chamada), porque o provider do harness usa `max_tokens` 4096 e não informa o motivo das
falhas. O código do harness não foi alterado; o extra `.[anthropic]` foi instalado no venv dele. Os
textos abaixo são dos agentes.

### 9.1 Plano (analyst + reviewer)

Run `a59fa23d-20c7-42a3-bea9-a6fcf84d8d24` — estado **completed**; plano explícito `analyst →
reviewer`; tempo-limite por tarefa 3600 s.

| Agente | Situação | Provider / modelo | Duração | Tokens | Erro |
| --- | --- | --- | --- | --- | --- |
| `analyst` | completed | anthropic / claude-sonnet-5-5 | 91 s | 58759 | — |
| `reviewer` | completed | anthropic / claude-sonnet-5-5 | 125 s | 69770 | — |

**analyst — resumo (texto do agente, sem edição):** Para o dev, nada existe ainda no Azure nem no
Entra ID. O usuário tem Owner na assinatura e é Global Administrator (E2). Os scripts 02 a 07 cobrem
B6, o .env local, o state remoto e o plano e aplicação da fase 1, mas não cobrem o restante do
deploy.md. Há três bloqueios: Terraform ausente, os oito provedores de recursos não registrados e a
disponibilidade do nome da conta do state sem confirmação. Segundo o pedido, B7 foi confirmada
(Container Apps, eastus2) e o custo recorrente da fase 1 foi aprovado. O ADR-0004 continua como
"proposta" (E1).

**analyst — recomendações** (10):

* Passo 1 (Plataforma/repositório): marcar o ADR-0004 como aprovado e registrar eastus2 como
  confirmada. Conferir que a política de rede (WAF, private endpoints) do B7 está tratada ou adiada.
* Passo 2: registrar os 8 provedores com a conta Owner. Verificar RegistrationState=Registered em
  cada um antes de seguir.
* Passo 3: repetir a checagem de nome de stconshubtfstate. Se estiver indisponível, escolher outro e
  usar o mesmo em 05 (-StorageAccount) e 04 (-TfStateStorageAccount).
* Passo 4: rodar o 02 sem -Apply e revisar; depois com -Apply. Exigir allChecksPassed=true em
  out\02-entra.json. O usuário já tem permissão (Global Administrator).
* Passo 5: rodar o 03 sem -Apply e conferir a política de senha e URLs; depois com -Apply. Verificar
  validações OK e .env e web/.env.local ignorados e não versionados. Decidir o destino do web/.env
  com placeholders.
* Passo 6 (exige sua aprovação para instalar): rodar o 04 com -Location eastus2 -InstallTerraform.
  Verificar init, validate e fmt com exit 0, e que dev.backend.hcl e dev.auto.tfvars estão
  ignorados. Versionar o .terraform.lock.hcl.
* Passo 7: rodar o 05 com -Location eastus2 sem -Apply e depois com -Apply. Verificar
  containerReady=true; se houver erro de propagação do RBAC, repetir após alguns minutos.
* Passo 8: rodar o 06 e revisar out\06-terraform-plano.json: sem destrutivos (exit 2 bloqueia) e
  custos conferidos com o aprovado. Revisar também os SKUs e a web_public_origin placeholder antes
  de aplicar.
* Passo 9: rodar o 07 -Apply só após aprovar o plano. Se o Key Vault responder 403, aguardar e
  repetir 06 e 07. Conferir os recursos listados em out\07-terraform-aplicar.json no rg-conshub-dev.
* Passo 10 (depende de ação externa/Plataforma): instalar docker e node e publicar as imagens no ACR
  com o SHA, e aplicar a fase 2. Executar o app-role.sql de uma máquina na rede privada e criar a
  identidade OIDC do GitHub e os GitHub Environments. Só então fazer o B10.

| Severidade | Achado | Detalhe (resumido) |
| --- | --- | --- |
| high | Provedores de recursos não registrados | Os 8 provedores usados pelo 05 e pelo Terraform estão NotRegistered e nenhum script os registra. É pré-requisito para o 05, o 06 e o 07. |
| medium | Terraform, docker e node ausentes | Sem Terraform, os scripts 04, 06 e 07 não rodam. O 04 só instala com -InstallTerraform e aprovação. Docker e node ausentes bloqueiam o build de imagens e o ambiente local para o B10. |
| medium | Disponibilidade de stconshubtfstate desconhecida | A checagem retornou erro, não disponível nem indisponível. Os demais nomes globais estão livres. |
| medium | Caminho do auto.tfvars divergente do inventário | O 04 grava em environments\dev.auto.tfvars e aborta se não for ignorado. O inventário verificou infra/terraform/dev.auto.tfvars. |
| medium | Itens documentados sem script | Faltam OIDC do GitHub, GitHub Environments, publicação de imagens e fase 2, app-role.sql, web_public_origin real e teste B10. Dependem de outras equipes ou de ações posteriores à fase 1. |
| low | ADR-0004 ainda como proposta | O B7 exige ADR aprovada e tfvars revisados. O dev.tfvars versionado ainda tem placeholders e a observação "confirmar". |

**analyst — limitações declaradas:** O estado é um instantâneo de 2026-11-02T15:54 (E2); nada foi
executado nem verificado de novo. · Os scripts lib/common.ps1 e lib/terraform.ps1 foram enviados
como scripts/common.ps1 e scripts/terraform.ps1; assume-se que são os mesmos arquivos de lib. · Não
foram fornecidos 00-inventario.ps1, o ADR, o app-role.sql, o deploy.yml, o outputs.tf nem estimativa
de custo. · Valores sensíveis estão redigidos no inventário, então a classe de POSTGRES_PASSWORD é
desconhecida. · A decisão de 02/11/2026 vem do pedido do usuário, e não de uma evidência documental.

**reviewer — resumo (texto do agente, sem edição):** O resultado do analyst é, em geral, coerente
com o estado real (nada existe no Azure ou no Entra, Terraform ausente, provedores não registrados),
mas tem falhas de rastreabilidade e lacunas relevantes. Os IDs de evidência que ele cita não
correspondem aos arquivos enviados: o script 02 é E4, não E3; o 07 é E2; o 03 é E11; o 04 é E5; o 05
é E12; o 06 é E6. Ele também deixa passar um bloqueio de execução (acesso à rede privada do banco),
a cobertura de custo da fase 2, a fragilidade do portão de aprovação do 07, o ciclo
web_public_origin/redirect URI e a persistência de privilégios elevados. A ordem 02→04→05→06→07
respeita as dependências verificáveis nos scripts (o 04 exige o 02-entra.json; o 06 exige 04 e 05; o
07 exige o 06). As ressalvas são as dependências ocultas sobre B9 e sobre a web_public_origin. Pelo
que se vê nos scripts, a fase 1 não é destrutiva, e o 06 bloqueia planos com delete.

| Severidade | Achado | Detalhe (resumido) |
| --- | --- | --- |
| high | Acesso ao PostgreSQL privado para B9 não tem caminho de execução | O banco não tem acesso público e não há bastion, VPN nem job no Terraform ou nos scripts. As apps rodam com NODE_ENV=production e a doc diz que API/worker recusam credencial de DDL, então o dev também depende do papel restrito (B9, listado só para hml/prod). Sem o app-role.sql e sem o segredo real, api e worker (min_replicas ≥1) ficam em falha. O analyst cita a necessidade de 'máquina com acesso', mas não trata a la… |
| medium | Evidências do analyst desalinhadas com os arquivos enviados | Quase todas as citações do analyst apontam para o ID errado. Script 02 é E4, e o analyst cita E3, que é o inventário. Script 07 é E2, e o analyst cita E4. O 03 é E11, o 04 é E5, o 05 é E12, o 06 é E6, e E10 é um tfvars, não o 05. As conclusões batem com o conteúdo, mas as citações não permitem auditoria e podem esconder erro. Afirmações como 'custos conferidos com o aprovado' não têm base: nenhuma estimativa foi for… |
| medium | Aprovação de custo cobre só a fase 1; faltam estimativa e teto | A decisão aprova a fase 1 (PostgreSQL, ACR Standard, Log Analytics, ambiente Container Apps, Key Vault, DNS privado). Na fase 2, api, worker (1 vCPU/2Gi) e web ficam com mínimo de 1 réplica, e o job de migração agrega mais custo recorrente. Nenhum script estima custo (o 06 só lista tipos). A assinatura é PayAsYouGo com spendingLimit Off e nenhum orçamento foi previsto. |
| medium | Portão de aprovação do 07 é fraco e o plano salvo pode vazar segredos | O único 'consentimento' é o switch -Apply. O script lê o resumo JSON do 06 em vez de inspecionar o plano a aplicar, sem hash nem timestamp que os vincule. O .tfplan contém valores sensíveis (random_password, URLs de conexão), e o script 06 afirma que ele é ignorado pelo Git sem verificar; o inventário não confirma isso. O 07 remove o plano incondicionalmente após o apply, inclusive em caso de falha. |
| medium | web_public_origin e redirect URI do SPA: dependência circular não resolvida | O CORS da API usa web_public_origin, que é example.invalid, e o 04 não o grava no auto.tfvars. O 02 só registra localhost:3001 como redirect. O FQDN real do web só existe após o ambiente Container Apps (fase 1), então é preciso atualizar tfvars e Entra antes da fase 2. Nenhum script cobre isso e o analyst só aponta como hipótese. |
| medium | Provedores NotRegistered: bloqueio provável, mas não demonstrado | Os 8 provedores estão NotRegistered e nenhum script os registra. É o primeiro passo da ordem, mas o analyst o classifica como bloqueio 'high' sem checar se az CLI ou azurerm 4.x registram automaticamente. A causa do SubscriptionNotFound é só hipótese. |
| medium | Risco de abortar no 04 por caminho do .gitignore não verificado | O 04 grava environments/dev.auto.tfvars e dev.backend.hcl e, se o Git não os ignorar, apaga os arquivos e lança erro. O inventário verificou outro caminho (infra/terraform/dev.auto.tfvars). O 04 também sobrescreve esses arquivos sem backup. Rode `git check-ignore` antes. |
| medium | Privilégios elevados e persistentes no bootstrap | A execução usa Global Administrator, Owner na assinatura e User Access Administrator em '/' (provavelmente uma elevação que não é necessária ao bootstrap). O Terraform concede 'Key Vault Secrets Officer' no cofre inteiro ao usuário executor, e essa role fica no state e no Azure. A identidade OIDC do GitHub 'sem Owner/Contributor' não existe nem tem script. O 02 pré-autoriza o SPA, o que na prática dispensa o consent… |
| medium | B7 só parcialmente resolvida: rede e ADR continuam abertos | A decisão confirma plataforma e região, mas B7 também exige ADR aprovada, tfvars revisados e política de rede (WAF, private endpoints). Os ingress de api e web são externos e Key Vault e ACR não têm restrição de rede declarada. O ADR segue como 'proposta'. A fase 1 pode prosseguir, mas a exposição pública na fase 2 não foi decidida. |
| low | Recursos de difícil reversão: sem plano de limpeza | Key Vault tem purge protection e 90 dias de soft delete (o nome kv-conshub-dev fica bloqueado após exclusão). O PostgreSQL e o banco têm prevent_destroy, e o grupo de recursos tem prevent_deletion_if_contains_resources. Se a fase 1 for desfeita ou refeita, o destroy exigirá passos manuais. Os scripts dizem 'não destrói nada', e o analyst não menciona o custo da irreversibilidade. |
| low | State e segredos locais: exposição limitada, mas real | O state guarda a senha do admin do PostgreSQL e a URL de migração em claro. O backend usa Entra ID e chave compartilhada desabilitada (bom), mas qualquer Owner pode conceder a si acesso de dados. O 07 imprime a saída do terraform e os scripts dizem não ler segredos. O código de tratamento da senha no 03 está redigido e não pôde ser verificado. |
| low | Recomendação de docker/node do analyst é parcialmente imprecisa | A ausência de docker não bloqueia a publicação de imagens se for usado `az acr build` (build no ACR). node/npm só importam para o ambiente local e para o B10. O analyst trata como bloqueio sem examinar alternativas. Ele também recomenda decidir o destino do web/.env, mas o Next.js carrega .env e .env.local, com precedência do .env.local, então o impacto é menor. |
| info | Consolidado: nenhum script destrutivo ou fora do escopo da fase 1 | Os scripts 02, 05, 06 e 07 são idempotentes e não destroem. O 02 pára em caso de duplicidade. O 06 bloqueia plano com delete. O 07 só roda com -Apply. O 05 cria RG e storage com tags e role limitada à conta. Não há exclusão em nenhum deles. |

**reviewer — limitações declaradas:** Revisão estática de texto: nada foi executado nem consultado
no Azure; o estado é o de 2026-11-02T15:54. · O código de partes sensíveis do 03 e o
enable_rbac_authorization do Key Vault estão redigidos nas evidências e não puderam ser verificados.
· Não foram fornecidos o ADR, deploy.yml, app-role.sql, outputs.tf, .gitignore nem
00-inventario.ps1; os scripts common/terraform vieram sem o prefixo lib\, assumido como equivalente.
· Não há estimativa de custo, política de rede nem estado do GitHub (OIDC/Environments); a decisão
de 02/11/2026 vem apenas do pedido do usuário. · A evidência Fonte H em E1 é constatação do Claude,
não documento, e não foi usada como base de fato.

### 9.2 Resultados (reviewer)

Run `36222849-6fea-4e22-ac3d-7d6a23343852` — estado **completed**; plano explícito `reviewer`;
tempo-limite por tarefa 3600 s.

| Agente | Situação | Provider / modelo | Duração | Tokens | Erro |
| --- | --- | --- | --- | --- | --- |
| `reviewer` | completed | anthropic / claude-sonnet-5-5 | 51 s | 13640 | — |

**reviewer — resumo (texto do agente, sem edição):** Os resultados executados confirmam os itens
documentados do Entra ID (B6), do .env local e do state do Terraform. Os dois registros foram
criados com escopo access_as_user, tokens v2, redirect URI localhost:3001, sem segredos e sem
implicit grant. O .env e o web/.env.local não estão versionados, e a fase 1 foi aplicada em dev com
exit 0. Há ressalvas: a validação é de metadados e não de um login real (B10 segue aberto), a
plataforma e a região continuam não confirmadas (B7), e o conjunto de recursos criado e a contagem
do plano (4 create, 13 no-op) não batem de forma clara com a fase 1 documentada. Também permanecem
sem evidência a verificação do uso do Entra ID no state, o controle de custos, o papel DML (B9) e a
identidade de deploy OIDC. O resumo em E2 é gerado por script a partir de out/*.json, que não foram
inspecionados diretamente.

| Severidade | Achado | Detalhe (resumido) |
| --- | --- | --- |
| medium | Tokens v2 e escopo validados só por metadados, sem login real | As checagens (apiTokenV2, apiScopeEnabled, spaPreAutorizado) inspecionam a configuração do registro, não um token emitido. A pré-autorização dispensa consentimento apenas do access_as_user. Não há evidência de que o fluxo Authorization Code + PKCE funcione de ponta a ponta, nem de que os escopos OIDC básicos funcionem sem consentimento. B10 (teste ponta a ponta real) continua pendente. |
| medium | State endurecido, mas uso de Entra ID no backend e rede não evidenciados | A conta tem TLS 1.2, sem chave compartilhada, sem acesso público a blobs, versionamento e soft delete. O papel é mínimo e restrito ao escopo da conta. O backend com use_azuread_auth está só no .example e o init=0 não prova a configuração real. Não há informação sobre firewall ou rede da conta. O state conterá valores sensíveis (por exemplo database-url-app), e a atribuição de papel ao usuário interativo não é uma id… |
| medium | Fase 1 aplicada extrapola a descrição documentada e há ambiguidade no plano | O deploy.md descreve a fase 1 como ACR, AcrPull, segredo database-url-app e ambiente Container Apps. O inventário contém também VNet, DNS privado, PostgreSQL, Key Vault, Log Analytics e a identidade apps. As identidades migrator e web não aparecem. O plano mostrou só 4 create e 13 no-op, o que não bate com o B8 ('nada foi provisionado'). O AcrPull e o segredo no Key Vault não aparecem na lista de recursos. |
| medium | Custos recorrentes criados sem estimativa nem orçamento | O plano marcou como com custo o PostgreSQL Flexible Server (B_Standard_B1ms) e o ambiente Container Apps. Existem ainda Log Analytics, ACR e Key Vault. Não há evidência de estimativa, orçamento, alerta ou rotina de desligamento em dev. Os custos começam a correr antes de existir qualquer app implantado. |
| medium | B7 não resolvido: infraestrutura criada com plataforma e região ainda propostas | A ADR-0004 está como 'proposta' e a região eastus2 está marcada como 'confirmar'. A região foi usada para state e recursos de dev. Os tfvars e a política de rede (WAF, private endpoints) não constam como revisados. Se a região mudar, o PostgreSQL e a VNet precisarão ser recriados. |
| medium | B9 e o acesso ao banco privado continuam pendentes | O segredo database-url-app nasce inválido. Liberá-lo exige aplicar app-role.sql a partir de uma máquina com acesso à rede privada. O PostgreSQL está sem acesso público e não há evidência de VPN, jump host ou runner. Sem isso, a fase 2 e o job migrate ficam bloqueados. |
| low | .env fora do Git confirmado; alcance da checagem é limitado | .env e web/.env.local estão ignorados e não rastreados, e as variáveis foram validadas sem expor segredos. Ainda assim, a checagem de padrões de segredo cobre apenas o índice, não o histórico do Git. Não há evidência de que o POSTGRES_PASSWORD local seja diferente das credenciais do PostgreSQL do Azure. O resumo apenas lista os nomes das variáveis alteradas, o que é adequado. |
| low | Itens ainda pendentes: fase 2, identidade de deploy e ambientes | Ainda faltam publicar as imagens no ACR com o SHA do commit, aplicar o restante do Terraform (apps api/worker/web, job migrate, identidades migrator/web) e criar a identidade OIDC do GitHub sem Owner/Contributor. Faltam também os GitHub Environments e os registros e parâmetros de hml/prod. A configuração real de dev depende de arquivos locais ignorados (dev.auto.tfvars, dev.backend.hcl); o dev.tfvars versionado tem… |
| info | Registros do Entra ID (API e SPA) atendidos em dev | Os itens da Fonte B estão cumpridos: single tenant, URI api://<client-id>, escopo access_as_user, token v2, SPA com redirect localhost:3001, sem segredos, sem app roles e sem implicit grant. O resultado foi validado duas vezes (apply e validação final 09). O B6 está atendido apenas para dev. Os redirects de hml/prod seguem pendentes e web_public_origin ainda é um placeholder. |

**reviewer — limitações declaradas:** A revisão se baseia em resumos (E1 e E2); out/*.json, o plano
do Terraform e os arquivos reais não foram inspecionados. · Não há dados de custo, SKU do ACR/Log
Analytics, configuração do Key Vault ou dos subnets, nem evidência da conta e do papel usados no
apply. · Não foi possível verificar o histórico do Git nem se o login real funciona.

### 9.3 Tentativas anteriores

| Arquivo | Run | Estado | Provider | Tarefas |
| --- | --- | --- | --- | --- |
| `01-harness-plano.anterior-20261027-205858.json` | `bebd8c6d-181f-4bda-830b-f10b84be66d4` | failed | — | analyst: failed (TimeoutError); reviewer: blocked (Dependency did not complete.) |
| `01-harness-plano.anterior-20261102-152445.json` | `41078367-ac86-4820-a085-6f7b69522be1` | failed | — | analyst: failed (ProviderOutputError); reviewer: blocked (Dependency did not complete.) |

### 9.4 Revisão desta documentação (reviewer)

Run `defab499-d7cd-43b2-b476-466f903be6bb` — estado **completed**; plano explícito `reviewer`;
tempo-limite por tarefa 3600 s.

| Agente | Situação | Provider / modelo | Duração | Tokens | Erro |
| --- | --- | --- | --- | --- | --- |
| `reviewer` | completed | anthropic / claude-sonnet-5-5 | 92 s | 49961 | — |

**reviewer — resumo (texto do agente, sem edição):** A atualização é, no geral, bem alinhada à
execução em E3: registros do Entra ID, `.env` ignorado pelo Git, fase 1 aplicada em `brazilsouth` e
pendências B9/B10/fase 2 mantidas abertas. Não encontrei segredo, senha, token ou connection string
com valor nos trechos revisados. Os problemas são outros: (1) B6 aparece como "Concluída" com
validação só por metadados; (2) a documentação versionada descreve código Terraform ainda não
commitado; (3) IDs reais de tenant, assinatura e apps entram em documentos versionados, contra a
convenção de placeholders do repositório; (4) afirmações de conferência e de endurecimento são mais
fortes do que a evidência executada; (5) pendências do registro 09 não chegaram ao 06 e ao README;
(6) há mistura de planejamento, execução e validação.

| Severidade | Achado | Detalhe (resumido) |
| --- | --- | --- |
| medium | B6 marcada como "Concluída em dev" apenas por checagens de metadados | O 06 e o resumo do registro 09 dizem "Concluída em dev". As checagens (`apiTokenV2`, `spaPreAutorizado` etc.) só inspecionam a configuração dos registros, e o próprio registro admite que login real e emissão de token não foram validados (§10.3). O redirect URI da origem publicada também está pendente, e o reviewer apontou a mesma limitação (E5). O estado correto é "configurada e conferida", não "concluída". Isso mis… |
| medium | Documentação versionada descreve código Terraform ainda não commitado | O deploy.md e o registro citam as variáveis `postgres_zone`, `key_vault_name` e `log_analytics_name`, a região `brazilsouth` em `dev.tfvars` e o uso de `-var-file`. Mas `git status` mostra `database.tf`, `main.tf`, `platform.tf`, `variables.tf` e `dev.tfvars` modificados, `.terraform.lock.hcl` não rastreado e "nada foi commitado". O `dev.tfvars` versionado ainda traz `eastus2`. Se a documentação for commitada isolad… |
| medium | IDs reais de tenant, assinatura, apps e service principals em documentos versionados | O `autenticacao.md` e o registro 09 trazem o tenant, a assinatura, appIds, objectIds, service principals e o id do escopo. O repositório mantém IDs reais fora do Git, usando placeholders `0000…` em `dev.tfvars` e `dev.auto.tfvars` ignorado. Os IDs não são segredos, como o registro afirma, mas revelam a topologia do tenant e quebram a convenção. Também ficam expostos o caminho local `C:\Users\Particular\…` e o nome d… |
| medium | Aceite da ADR-0004 por quem não é a equipe de plataforma | O B7 exige "ADR-0004 aprovada" com dono Plataforma, e a ADR dizia "requer confirmação da equipe de plataforma". A nova ADR é "aceita para o ambiente dev" pela confirmação do "responsável do projeto", sem evidência de que a plataforma ou a segurança tenham opinado. O 06 corretamente chama o B7 de "Parcial", mas a ADR e o deploy.md podem ser lidos como aprovação. A escolha de `brazilsouth` (residência de dados, latênc… |
| medium | Afirmações da ADR e do 06 apoiadas só em narrativa, não nos resultados executados | A evidência 03 não contém o teste em 5 regiões, as 4 recusas `SkuNotAvailable`, a exclusão em `eastus2`, o untaint/import nem o plano de conferência com exit 0. Esses itens vêm apenas do texto do registro (E4/E6). Mesmo assim, a ADR e o 06 os apresentam como fatos ("plano de conferência sem diferenças", "recusado em eastus e westus3"). Há também inconsistências: o registro mostra `eastus` como `ParameterOutOfRange`… |
| medium | "Risco mitigado" do state e do acesso à conta exagera frente à evidência | O registro e o deploy.md descrevem o acesso ao state como "só por Entra ID" e o risco da senha do admin do PostgreSQL no state como "avaliado e mitigado". A validação mostra `publicNetworkAccess=` vazio e `defaultAction=Allow`, isto é, a conta aceita qualquer rede. O executor é Owner e pode se conceder acesso a dados, e o reviewer já sinalizava isso (E5). O risco de rede e de privilégios amplos (Global Admin, Owner,… |
| medium | Pendências do registro 09 não foram levadas ao 06, ao README e ao deploy.md | O registro 09 §13 lista pendências que as tabelas do 06 e o README não trazem: orçamento e alerta de custo e estimativa para `brazilsouth`; redirect URI do SPA para a origem publicada (o B6 diz só "hml/prod pendentes"); identidade OIDC e GitHub Environments; `rbac_authorization_enabled` obsoleto; senha do admin fora do state; revisão dos privilégios do executor; commit do Terraform. O deploy.md cita o custo recorren… |
| low | Plano salvo com valores sensíveis sem prova de que seja ignorado pelo Git | O deploy.md passa a recomendar `-out dev-fase1.tfplan` e avisa que ele contém valores sensíveis, mas nenhuma checagem mostra que `*.tfplan` está no `.gitignore`. As verificações de Git cobrem `.env`, `dev.auto.tfvars` e `dev.backend.hcl`, não o plano. O reviewer já havia levantado esse ponto para o script 06. |
| low | Guias e ADR misturam registro de execução com instrução permanente | O `ambiente-local.md` ganha uma nota sobre "esta máquina" (script, volume `postgres-data`), embora o inventário diga que o Docker estava ausente; a nota é, portanto, hipotética. O deploy.md e o `autenticacao.md` ganham notas datadas "Dev (02/11/2026)" no meio de instruções. O passo 11 da linha do tempo rotula como [validação] a própria atualização da documentação. O §9.4 declara a revisão desta documentação como pen… |
| low | Resultados do Maestro copiados sem reconciliação com decisões posteriores | O §9 reproduz o analyst e o reviewer com achados já superados. Entre eles: "B7 não resolvido, região `eastus2` propostas"; "nada existe"; citações de evidência com IDs errados; e a ambiguidade "4 create/13 no-op". Não há marcação do que foi resolvido (região mudou, B7 parcial) nem do que segue aberto. O AGENTS.md reforça que o harness produz "relatórios reais", mas o próprio reviewer registrou erros de rastreabilida… |

**reviewer — limitações declaradas:** O registro 09 foi recebido em três partes e o início da parte
3 corta uma tabela do reviewer; não vi o arquivo completo nem a numeração final das seções. · Os
`out/*.json`, os scripts, o `.gitignore`, o `git status` real e os documentos completos (ADR,
deploy.md, 06) não foram fornecidos, apenas os trechos antes → depois. Não verifiquei links nem a
ausência de segredos fora dos trechos. · A evidência 03 é um resumo gerado, e não prova as etapas de
região, exclusão e reconciliação. · A revisão é estática e não consultou o Azure nem o Entra ID.

A revisão leu a versão deste registro gerada antes desta seção 9.4 e os trechos alterados nos demais
documentos; os achados não foram aplicados automaticamente.

## 10. Validação [validação]

### 10.1 Checagens somente leitura (`09-validacao.ps1`)

Executada em 02/11/2026 21:20. Falhas: **nenhuma**.

| Checagem | Resultado |
| --- | --- |
| `entra.api.existeUmUnico` | OK |
| `entra.spa.existeUmUnico` | OK |
| `entra.api.singleTenant` | OK |
| `entra.api.applicationIdUri` | OK |
| `entra.api.tokenV2` | OK |
| `entra.api.escopoAtivo` | OK |
| `entra.api.semSegredosNemCertificados` | OK |
| `entra.api.semAppRoles` | OK |
| `entra.api.servicePrincipal` | OK |
| `entra.spa.singleTenant` | OK |
| `entra.spa.redirectLocalhost3001` | OK |
| `entra.spa.implicitGrantDesligado` | OK |
| `entra.spa.semSegredosNemCertificados` | OK |
| `entra.spa.servicePrincipal` | OK |
| `entra.spa.permissaoAccessAsUser` | OK |
| `entra.api.spaPreAutorizado` | OK |
| `env.raiz.existe` | OK |
| `env.web.envLocalExiste` | OK |
| `env.ENTRA_TENANT_ID=tenant` | OK |
| `env.ENTRA_API_CLIENT_ID=API` | OK |
| `env.ENTRA_ALLOWED_CLIENT_IDS=SPA` | OK |
| `env.NEXT_PUBLIC_ENTRA_CLIENT_ID=SPA` | OK |
| `env.NEXT_PUBLIC_API_SCOPE` | OK |
| `env.web.NEXT_PUBLIC_ENTRA_TENANT_ID` | OK |
| `env.web.NEXT_PUBLIC_ENTRA_CLIENT_ID` | OK |
| `env.web.NEXT_PUBLIC_API_SCOPE` | OK |
| `env.POSTGRES_PASSWORD.semPlaceholder` | OK |
| `env.DATABASE_URL.usaPOSTGRES_PASSWORD` | OK |
| `env.SHADOW_DATABASE_URL.usaPOSTGRES_PASSWORD` | OK |
| `git..env.ignorado` | OK |
| `git..env.naoVersionado` | OK |
| `git.web/.env.local.ignorado` | OK |
| `git.web/.env.local.naoVersionado` | OK |
| `git.infra/terraform/environments/dev.auto.tfvars.ignorado` | OK |
| `git.infra/terraform/environments/dev.auto.tfvars.naoVersionado` | OK |
| `git.infra/terraform/environments/dev.backend.hcl.ignorado` | OK |
| `git.infra/terraform/environments/dev.backend.hcl.naoVersionado` | OK |
| `git.semPadroesDeSegredoNoIndice` | OK |
| `tfstate.regiao` | eastus2 |
| `tfstate.semChaveCompartilhada` | OK |
| `tfstate.semAcessoPublicoABlobs` | OK |
| `tfstate.tls12` | OK |
| `tfstate.acessoDeRede` | publicNetworkAccess=; defaultAction=Allow |
| `tfstate.versionamento` | OK |
| `tfstate.exclusaoReversivelDeBlobs` | OK |
| `tfstate.blobDoStateLidoComEntraId` | OK |
| `tfstate.papelDeDadosDoExecutorNaConta` | OK |
| `tfstate.backendUsaEntraId` | OK |
| `dev.grupo.regiao` | brazilsouth |
| `dev.recursos` | Microsoft.Network/privateDnsZones/conshub-dev.private.postgres.database.azure.com, Microsoft.ContainerRegistry/registries/acrconshubdev, Microsoft.ManagedIdentity/userAssignedIdentities/id-conshub-dev-apps, Microsoft.KeyVault/vaults/kv-conshub-dev-brs, Microsoft.OperationalInsights/workspaces/log-conshub-dev-brs, Microsoft.Network/virtualNetworks/vnet-conshub-dev, Microsoft.Network/privateDnsZones/virtualNetworkLinks/conshub-dev.private.postgres.database.azure.com/link-conshub-dev, Microsoft.DBforPostgreSQL/flexibleServers/psql-conshub-dev, Microsoft.App/managedEnvironments/cae-conshub-dev |
| `dev.recursosForaDaRegiaoDoGrupo` | (nenhum) |
| `dev.postgres.semAcessoPublico` | OK |
| `dev.postgres.estado` | Ready |
| `dev.postgres.pronto` | OK |
| `dev.postgres.skuEVersao` | Standard_B1ms / 16 |
| `dev.postgres.subRedeDelegada` | OK |
| `dev.postgres.zonaDnsPrivada` | OK |
| `dev.acr.semUsuarioAdmin` | OK |
| `dev.acr.sku` | Standard |
| `dev.acr.acrPullDaIdentidadeApps` | OK |
| `dev.keyvault.nome` | kv-conshub-dev-brs |
| `dev.keyvault.rbac` | OK |
| `dev.keyvault.purgeProtection` | OK |
| `dev.keyvault.secretsOfficerDoExecutor` | OK |
| `dev.keyvault.nomesDeSegredos` | database-url-app |
| `dev.logAnalytics.estado` | log-conshub-dev-brs: Succeeded |
| `dev.logAnalytics.provisionado` | OK |
| `dev.containerAppsEnvironment.estado` | cae-conshub-dev: Succeeded |
| `dev.containerAppsEnvironment.provisionado` | OK |

### 10.2 Terraform: *state* × Azure

* Conferência de 02/11/2026 21:20: Terraform `1.16.6`; `init` com o backend remoto (Entra ID): exit
  0; `state list`: 18 endereço(s).
* Plano da fase 1 sem salvar (`-detailed-exitcode`): exit 0 — sem diferenças entre o *state*, a
  configuração e o Azure (resumo do Terraform: `No changes. Your infrastructure matches the
  configuration.`)

Último plano aplicado (`06`, 02/11/2026 20:31): create 4, no-op 13; exclusões ou substituições:
(nenhum).

### 10.3 O que não foi validado

* Login real, emissão e validação de token pela API (B10): exige o ambiente local com Docker e
  PostgreSQL, ou a fase 2.
* Conexão ao PostgreSQL: o servidor só aceita a rede privada e não há ponto de acesso a ela (B9).
* Valores de segredos: não foram lidos de propósito (só nomes e metadados).
* Apps, job de migração e workflow **Deploy**: não existem ainda (fase 2).

## 11. Configurações e decisões técnicas

* **[planejamento] Região:** dev em `brazilsouth` — `eastus2` recusou o PostgreSQL Flexible
  (`SkuNotAvailable`) nesta assinatura, embora a API de capacidades não indicasse restrição.
  `environments/dev.tfvars` registra a região e o motivo. O *state* continua em `eastus2`.
  `hml.tfvars` e `prod.tfvars` seguem com `eastus2`.
* **[execução] Terraform (versionado, não commitado):** variáveis novas `postgres_zone` (padrão
  `"1"`, aceita `null` para o Azure escolher a zona), `key_vault_name` e `log_analytics_name`
  (padrão `null` = nomes `kv-`/`log-<prefixo>-<env>`); `database.tf`, `platform.tf` e `main.tf`
  passaram a usá-las.
* **[execução] `dev.auto.tfvars` (ignorado pelo Git):** IDs de assinatura, tenant e registros;
  `location`; `key_vault_name = kv-conshub-dev-brs` e `log_analytics_name = log-conshub-dev-brs` (o
  nome padrão do cofre ficou retido pela *purge protection* do cofre excluído); `postgres_zone =
  null`; SKU do PostgreSQL de volta ao documentado (B1ms).
* **PostgreSQL:** B1ms, 32 GB, versão 16, backup de 7 dias, sem HA nem backup geo-redundante; só
  acesso privado (sub-rede delegada e zona DNS privada; `public_network_access_enabled = false`).
* **Segredos:** Key Vault com RBAC e *purge protection* (90 dias); `database-url-app` com valor
  inválido de propósito; `database-url-migrator` só na fase 2. A senha do administrador do
  PostgreSQL (`random_password`) fica no *state* remoto — risco avaliado e mitigado pelo acesso só
  por Entra ID, sem chave compartilhada, com versionamento e exclusão reversível. Redução possível:
  atributos *write-only* do azurerm 4.81 (`administrator_password_wo`, `value_wo`) com `ephemeral
  "random_password"` (Terraform ≥ 1.11) ou autenticação Entra no PostgreSQL.
* **Rede:** ACR (Standard, sem usuário admin), Key Vault e Log Analytics aceitam acesso público
  autenticado, como na configuração atual; *private endpoints* e WAF dependem da política de rede
  (B7).
* **Privilégios:** quem roda o Terraform recebeu *Storage Blob Data Contributor* na conta do *state*
  e *Key Vault Secrets Officer* no cofre de dev. Rever quando houver identidade de deploy.
* **Custo:** recorrente desde a fase 1 (PostgreSQL B1ms, ACR Standard, Log Analytics, ambiente
  Container Apps, zona DNS privada e armazenamento). A estimativa apresentada antes da aprovação
  (US$ 37–110/mês) era de `eastus2`; a de `brazilsouth` não foi calculada e não há orçamento ou
  alerta de custo configurado.

## 12. Erros, limitações e tratamento

| Ocorrência | Causa | Tratamento |
| --- | --- | --- |
| Maestro com Ollama (`qwen3.8:27b`, CPU) não concluía tarefas | Modelo grande em CPU; limite de 30 s por tarefa na CLI/MCP | Executor com limite maior; depois provider Anthropic (decisão de 02/11) |
| Health check do provider com `BadRequestError`, sem motivo | O harness só informa o tipo do erro | Diagnóstico próprio (lista de modelos e chamada mínima) antes de cada execução |
| `analyst` com `ProviderOutputError` (sem texto utilizável) | Provider do harness com `max_tokens` 4096 e sem detalhe da falha | Adaptador no executor (`max_tokens` 16000, sem raciocínio estendido, extração do JSON) |
| Chave da API chegou incompleta ao script | Colagem no prompt oculto do PowerShell | Leitura da área de transferência, limpa em seguida; prompt sem eco |
| `az`: token ausente no cache do MSAL | Sessão do Azure CLI sem token válido para o Microsoft Graph | `az login --tenant <tenant>` pelo responsável; checagem de token ARM e Graph antes de executar |
| `SubscriptionNotFound` ao checar o nome da conta do *state* | Provedores de recursos não registrados na assinatura | Registro de `Microsoft.App`, `ContainerRegistry`, `DBforPostgreSQL`, `KeyVault`, `ManagedIdentity`, `Network`, `OperationalInsights` e `Storage` |
| Script `07`: erro de conversão para `SwitchParameter` | Variável com o mesmo nome do parâmetro `-Apply` | Variável renomeada |
| PostgreSQL `SkuNotAvailable` em `eastus2` (4 vezes) | Restrição de capacidade da região para esta assinatura | Teste em 5 regiões e mudança do dev para `brazilsouth` |
| Nome `kv-conshub-dev` indisponível após a exclusão | Cofre em exclusão reversível com *purge protection* | `key_vault_name = kv-conshub-dev-brs` |
| "Subnet 'snet-postgres' doesn't exist" ao criar o PostgreSQL | Erro transitório logo após criar a sub-rede | Novo plano e nova aplicação |
| 404 ao consultar o Log Analytics recém-criado | Recurso criado, mas fora do *state* | `terraform import` (script `14`), sem excluir nada |
| Aviso `enable_rbac_authorization` obsoleto | Renomeado para `rbac_authorization_enabled` (removido no azurerm 5) | Pendente (§13) |

## 13. Pendências que exigem ação externa

| Pendência | Por que não foi feita | Responsável |
| --- | --- | --- |
| Fase 2 de dev (B8): imagens `consolidahub-api`, `-migrator` e `-web` no ACR com o SHA de um commit e plano completo | Exige commit das alterações, Docker (ou `az acr build`) e aprovação do custo dos apps | Dev + Plataforma |
| Papel DML `consolidahub_app` e segredo `database-url-app` (B9) | Exige acesso à rede privada do banco (Cloud Shell com VNet, *jump host* ou job no ambiente) | Plataforma/DBA |
| Login real e fluxo ponta a ponta (B10); primeiro administrador | Dependem do ambiente local com Docker e PostgreSQL ou da fase 2 | Dev + Negócio |
| Redirect URI do SPA para a origem publicada (`web_public_origin`) | O FQDN do web só existe depois da fase 2 | Identidade/TI |
| Identidade de deploy (OIDC) e GitHub Environments | Não pedidos nesta etapa; exigem decisão de permissões | Plataforma |
| hml e prod: registros, *state*, infraestrutura e região | Fora do escopo aprovado; `eastus2` pode ter a mesma restrição | Plataforma |
| Política de rede (B7): *private endpoints*/WAF | Depende da política corporativa | Plataforma/Segurança |
| Orçamento e alerta de custo; estimativa para `brazilsouth` | Não configurados | Responsável |
| Terraform: `rbac_authorization_enabled`; senha do admin fora do *state*; revisar privilégios do executor | Melhorias identificadas, não aprovadas | Dev + Plataforma |
| Commit de `infra/terraform` (variáveis, região, `.terraform.lock.hcl`) e desta documentação | Nada foi commitado sem pedido explícito | Dev |

## 14. Arquivos do repositório nesta etapa

`git status` antes desta atualização (02/11/2026 21:21, branch `refactor/consolidahub-fundacao` @
`dec6959`):

```text
 M infra/terraform/database.tf
 M infra/terraform/environments/dev.tfvars
 M infra/terraform/main.tf
 M infra/terraform/platform.tf
 M infra/terraform/variables.tf
?? infra/terraform/.terraform.lock.hcl
```

A atualização da documentação (script `15`) altera `README.md`, `AGENTS.md`,
`docs/auditoria/README.md`, `docs/auditoria/06-pendencias-para-producao.md`,
`docs/arquitetura/adr/0004-azure-container-apps.md`, `docs/arquitetura/autenticacao.md`,
`docs/guias/deploy.md` e `docs/guias/ambiente-local.md`, e cria este arquivo. Arquivos locais
ignorados pelo Git (conferidos no §10): `.env`, `web/.env.local`,
`infra/terraform/environments/dev.auto.tfvars` e `dev.backend.hcl`. Nada foi commitado.
