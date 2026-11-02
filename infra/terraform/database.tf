# PostgreSQL Flexible Server (the Single Server used by the previous code was retired in 2025).
# Private access only (VNet integration); TLS enforced by default (require_secure_transport).
resource "random_password" "postgres_admin" {
  length           = 32
  special          = true
  override_special = "-_.~"
}

resource "azurerm_postgresql_flexible_server" "main" {
  name                          = "psql-${local.name}"
  resource_group_name           = azurerm_resource_group.main.name
  location                      = azurerm_resource_group.main.location
  version                       = "16"
  sku_name                      = var.postgres_sku
  storage_mb                    = var.postgres_storage_mb
  backup_retention_days         = var.postgres_backup_retention_days
  geo_redundant_backup_enabled  = var.postgres_geo_redundant_backup
  delegated_subnet_id           = azurerm_subnet.postgres.id
  private_dns_zone_id           = azurerm_private_dns_zone.postgres.id
  public_network_access_enabled = false
  administrator_login           = "consolidahub_admin"
  administrator_password        = random_password.postgres_admin.result
  zone                          = "1"
  tags                          = local.tags

  dynamic "high_availability" {
    for_each = var.postgres_high_availability ? [1] : []
    content {
      mode                      = "ZoneRedundant"
      standby_availability_zone = "2"
    }
  }

  lifecycle {
    prevent_destroy = true
    ignore_changes  = [zone, high_availability[0].standby_availability_zone]
  }

  depends_on = [azurerm_private_dns_zone_virtual_network_link.postgres]
}

resource "azurerm_postgresql_flexible_server_database" "app" {
  name      = "consolidahub"
  server_id = azurerm_postgresql_flexible_server.main.id
  charset   = "UTF8"
  collation = "en_US.utf8"

  lifecycle {
    prevent_destroy = true
  }
}
