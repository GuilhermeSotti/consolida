# ---------------------------------------------------------------- workload identities
# One identity per trust level (least privilege):
#   apps     → API and worker: pull images + read ONLY the runtime database secret;
#   migrator → migration job: pull images + read ONLY the migration (DDL) secret;
#   web      → Next.js: pull images only (it holds no secrets).
resource "azurerm_user_assigned_identity" "apps" {
  name                = "id-${local.name}-apps"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  tags                = local.tags
}

resource "azurerm_user_assigned_identity" "migrator" {
  name                = "id-${local.name}-migrator"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  tags                = local.tags
}

resource "azurerm_user_assigned_identity" "web" {
  name                = "id-${local.name}-web"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  tags                = local.tags
}

# ---------------------------------------------------------------- container registry
resource "azurerm_container_registry" "main" {
  name                = replace("acr${local.name}", "-", "")
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "Standard"
  admin_enabled       = false
  tags                = local.tags
}

resource "azurerm_role_assignment" "apps_acr_pull" {
  scope                = azurerm_container_registry.main.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_user_assigned_identity.apps.principal_id
}

resource "azurerm_role_assignment" "migrator_acr_pull" {
  scope                = azurerm_container_registry.main.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_user_assigned_identity.migrator.principal_id
}

resource "azurerm_role_assignment" "web_acr_pull" {
  scope                = azurerm_container_registry.main.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_user_assigned_identity.web.principal_id
}

# ---------------------------------------------------------------- secrets
resource "azurerm_key_vault" "main" {
  name                       = "kv-${local.name}"
  location                   = azurerm_resource_group.main.location
  resource_group_name        = azurerm_resource_group.main.name
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  sku_name                   = "standard"
  enable_rbac_authorization  = true
  purge_protection_enabled   = true
  soft_delete_retention_days = 90
  tags                       = local.tags
}

# The identity running Terraform writes the connection secrets; the apps only read them.
resource "azurerm_role_assignment" "deployer_kv_secrets_officer" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = data.azurerm_client_config.current.object_id
}


# Migration connection (DDL) used only by the migration job.
resource "azurerm_key_vault_secret" "database_url_migrator" {
  name         = "database-url-migrator"
  key_vault_id = azurerm_key_vault.main.id
  value        = "postgresql://consolidahub_admin:${urlencode(random_password.postgres_admin.result)}@${azurerm_postgresql_flexible_server.main.fqdn}:5432/${azurerm_postgresql_flexible_server_database.app.name}?sslmode=require"
  content_type = "text/plain"

  depends_on = [azurerm_role_assignment.deployer_kv_secrets_officer]
}

# Runtime connection of the API and worker (least-privilege role, docs/guias/deploy.md). It is
# created with a placeholder that cannot connect, so the apps fail closed until the platform team
# creates the role (infra/database/app-role.sql) and stores the real URL; Terraform never
# overwrites it afterwards. The API/worker also refuse to start in production with an owner/DDL
# credential (src/shared/infrastructure/prisma/prisma.service.ts).
resource "azurerm_key_vault_secret" "database_url_app" {
  name         = "database-url-app"
  key_vault_id = azurerm_key_vault.main.id
  value        = "postgresql://defina-o-papel-restrito@invalid.invalid:5432/${azurerm_postgresql_flexible_server_database.app.name}"
  content_type = "text/plain"

  lifecycle {
    ignore_changes = [value]
  }

  depends_on = [azurerm_role_assignment.deployer_kv_secrets_officer]
}

# Secret-scoped read access (not vault-wide): each identity reads only its own connection string.
resource "azurerm_role_assignment" "apps_db_secret_user" {
  scope                = azurerm_key_vault_secret.database_url_app.resource_versionless_id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_user_assigned_identity.apps.principal_id
}

resource "azurerm_role_assignment" "migrator_db_secret_user" {
  scope                = azurerm_key_vault_secret.database_url_migrator.resource_versionless_id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_user_assigned_identity.migrator.principal_id
}

# ---------------------------------------------------------------- container apps environment
resource "azurerm_container_app_environment" "main" {
  name                       = "cae-${local.name}"
  location                   = azurerm_resource_group.main.location
  resource_group_name        = azurerm_resource_group.main.name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id
  infrastructure_subnet_id   = azurerm_subnet.aca.id
  zone_redundancy_enabled    = var.environment == "prod"
  tags                       = local.tags

  workload_profile {
    name                  = "Consumption"
    workload_profile_type = "Consumption"
  }
}
