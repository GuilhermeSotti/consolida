output "resource_group" {
  value = azurerm_resource_group.main.name
}

output "container_registry" {
  value = azurerm_container_registry.main.login_server
}

output "api_url" {
  value = "https://${azurerm_container_app.api.ingress[0].fqdn}/api/v1"
}

output "web_url" {
  value = "https://${azurerm_container_app.web.ingress[0].fqdn}"
}

output "migration_job" {
  value = azurerm_container_app_job.migrate.name
}

output "key_vault" {
  value = azurerm_key_vault.main.name
}
