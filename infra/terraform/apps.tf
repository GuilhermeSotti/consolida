locals {
  registry   = azurerm_container_registry.main.login_server
  api_image  = "${local.registry}/consolidahub-api:${var.image_tag}"
  web_image  = "${local.registry}/consolidahub-web:${var.image_tag}"
  migr_image = "${local.registry}/consolidahub-migrator:${var.image_tag}"

  common_env = {
    NODE_ENV                 = "production"
    LOG_LEVEL                = "info"
    ENTRA_TENANT_ID          = var.entra_tenant_id
    ENTRA_API_CLIENT_ID      = var.entra_api_client_id
    ENTRA_ALLOWED_CLIENT_IDS = var.entra_spa_client_id
    CORS_ALLOWED_ORIGINS     = var.web_public_origin
    TRUST_PROXY_HOPS         = "1"
  }
}

# ---------------------------------------------------------------- API (public HTTPS ingress)
resource "azurerm_container_app" "api" {
  name                         = "ca-${local.name}-api"
  resource_group_name          = azurerm_resource_group.main.name
  container_app_environment_id = azurerm_container_app_environment.main.id
  revision_mode                = "Single"
  workload_profile_name        = "Consumption"
  tags                         = local.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.apps.id]
  }

  registry {
    server   = local.registry
    identity = azurerm_user_assigned_identity.apps.id
  }

  secret {
    name                = "database-url"
    key_vault_secret_id = azurerm_key_vault_secret.database_url_app.versionless_id
    identity            = azurerm_user_assigned_identity.apps.id
  }

  ingress {
    external_enabled = true
    target_port      = 3000
    transport        = "http"
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = var.api_min_replicas
    max_replicas = var.api_max_replicas

    container {
      name    = "api"
      image   = local.api_image
      cpu     = 0.5
      memory  = "1Gi"
      command = ["node", "--enable-source-maps", "dist/main.js"]

      dynamic "env" {
        for_each = local.common_env
        content {
          name  = env.key
          value = env.value
        }
      }
      env {
        name        = "DATABASE_URL"
        secret_name = "database-url"
      }

      liveness_probe {
        transport = "HTTP"
        path      = "/api/v1/health/live"
        port      = 3000
      }
      readiness_probe {
        transport = "HTTP"
        path      = "/api/v1/health/ready"
        port      = 3000
      }
    }
  }

  # Images are rolled out by .github/workflows/deploy.yml (immutable tag = commit SHA); Terraform
  # only sets the initial image and must not roll it back on later infrastructure changes.
  lifecycle {
    ignore_changes = [template[0].container[0].image]
  }

  depends_on = [azurerm_role_assignment.apps_acr_pull, azurerm_role_assignment.apps_db_secret_user]
}

# ---------------------------------------------------------------- worker (no ingress)
resource "azurerm_container_app" "worker" {
  name                         = "ca-${local.name}-worker"
  resource_group_name          = azurerm_resource_group.main.name
  container_app_environment_id = azurerm_container_app_environment.main.id
  revision_mode                = "Single"
  workload_profile_name        = "Consumption"
  tags                         = local.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.apps.id]
  }

  registry {
    server   = local.registry
    identity = azurerm_user_assigned_identity.apps.id
  }

  secret {
    name                = "database-url"
    key_vault_secret_id = azurerm_key_vault_secret.database_url_app.versionless_id
    identity            = azurerm_user_assigned_identity.apps.id
  }

  template {
    # Several replicas are safe (FOR UPDATE SKIP LOCKED); each one holds a whole dataset in memory.
    min_replicas = 1
    max_replicas = 2

    container {
      name    = "worker"
      image   = local.api_image
      cpu     = 1
      memory  = "2Gi"
      command = ["node", "--enable-source-maps", "dist/worker.js"]

      dynamic "env" {
        for_each = merge(local.common_env, { WORKER_HEALTH_PORT = "3002" })
        content {
          name  = env.key
          value = env.value
        }
      }
      env {
        name        = "DATABASE_URL"
        secret_name = "database-url"
      }

      # Container Apps has no exec probes: the worker exposes GET /health/live on an internal
      # port (no ingress). It fails when the job loop stops making progress (src/worker/worker-health.ts).
      liveness_probe {
        transport               = "HTTP"
        path                    = "/health/live"
        port                    = 3002
        initial_delay           = 10
        interval_seconds        = 30
        timeout                 = 5
        failure_count_threshold = 3
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].container[0].image]
  }

  depends_on = [azurerm_role_assignment.apps_acr_pull, azurerm_role_assignment.apps_db_secret_user]
}

# ---------------------------------------------------------------- web (Next.js)
resource "azurerm_container_app" "web" {
  name                         = "ca-${local.name}-web"
  resource_group_name          = azurerm_resource_group.main.name
  container_app_environment_id = azurerm_container_app_environment.main.id
  revision_mode                = "Single"
  workload_profile_name        = "Consumption"
  tags                         = local.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.web.id]
  }

  registry {
    server   = local.registry
    identity = azurerm_user_assigned_identity.web.id
  }

  ingress {
    external_enabled = true
    target_port      = 3001
    transport        = "http"
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = 1
    max_replicas = 2

    container {
      name   = "web"
      image  = local.web_image
      cpu    = 0.25
      memory = "0.5Gi"
    }
  }

  lifecycle {
    ignore_changes = [template[0].container[0].image]
  }

  depends_on = [azurerm_role_assignment.web_acr_pull]
}

# ---------------------------------------------------------------- migrations (manual job)
resource "azurerm_container_app_job" "migrate" {
  name                         = "caj-${local.name}-migrate"
  location                     = azurerm_resource_group.main.location
  resource_group_name          = azurerm_resource_group.main.name
  container_app_environment_id = azurerm_container_app_environment.main.id
  workload_profile_name        = "Consumption"
  replica_timeout_in_seconds   = 1800
  replica_retry_limit          = 0
  tags                         = local.tags

  manual_trigger_config {
    parallelism              = 1
    replica_completion_count = 1
  }

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.migrator.id]
  }

  registry {
    server   = local.registry
    identity = azurerm_user_assigned_identity.migrator.id
  }

  secret {
    name                = "database-url"
    key_vault_secret_id = azurerm_key_vault_secret.database_url_migrator.versionless_id
    identity            = azurerm_user_assigned_identity.migrator.id
  }

  template {
    container {
      name   = "migrate"
      image  = local.migr_image
      cpu    = 0.5
      memory = "1Gi"
      env {
        name        = "DATABASE_URL"
        secret_name = "database-url"
      }
      env {
        name  = "NODE_ENV"
        value = "production"
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].container[0].image]
  }

  depends_on = [azurerm_role_assignment.migrator_acr_pull, azurerm_role_assignment.migrator_db_secret_user]
}
