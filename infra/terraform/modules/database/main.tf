# Terraform module for PostgreSQL database
# Creates managed PostgreSQL instance with backups and security

terraform {
  required_version = ">= 1.0"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "location" {
  description = "Azure region"
  type        = string
}

variable "resource_group_name" {
  description = "Resource group name"
  type        = string
}

variable "subnet_id" {
  description = "Subnet ID for database"
  type        = string
}

variable "administrator_login" {
  description = "Database administrator login"
  type        = string
  default     = "adminuser"
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "consolidahub"
}

variable "sku_name" {
  description = "Database SKU"
  type        = string
  default     = "B_Gen5_1" # Burstable, Gen5, 1 vCore
}

variable "backup_retention_days" {
  description = "Backup retention days"
  type        = number
  default     = 7
}

# Generate random password
resource "random_password" "db_admin" {
  length  = 32
  special = true
}

# PostgreSQL Server
resource "azurerm_postgresql_server" "consolidahub" {
  name                         = "consolidahub-pg-${var.environment}"
  location                     = var.location
  resource_group_name          = var.resource_group_name
  administrator_login          = var.administrator_login
  administrator_login_password = random_password.db_admin.result
  version                      = "13"
  storage_mb                   = 51200 # 50GB
  sku_name                     = var.sku_name
  backup_retention_days        = var.backup_retention_days
  geo_redundant_backup_enabled = var.environment == "prod"
  ssl_enforcement_enabled      = true
  public_network_access_enabled = false

  tags = {
    environment = var.environment
    project     = "consolidahub"
  }
}

# Database
resource "azurerm_postgresql_database" "consolidahub" {
  name                = var.db_name
  resource_group_name = var.resource_group_name
  server_name         = azurerm_postgresql_server.consolidahub.name
  charset             = "UTF8"
  collation           = "en_US.utf8"
}

# Virtual Network Rule
resource "azurerm_postgresql_virtual_network_rule" "consolidahub" {
  name                                 = "consolidahub-vnet-rule-${var.environment}"
  resource_group_name                  = var.resource_group_name
  server_name                          = azurerm_postgresql_server.consolidahub.name
  subnet_id                            = var.subnet_id
  ignore_missing_vnet_service_endpoint = false
}

# Firewall rules for specific IPs (if needed)
resource "azurerm_postgresql_firewall_rule" "example" {
  name                = "AllowAzureServices"
  resource_group_name = var.resource_group_name
  server_name         = azurerm_postgresql_server.consolidahub.name
  start_ip_address    = "0.0.0.0"
  end_ip_address      = "0.0.0.0"
}

output "postgres_fqdn" {
  value       = azurerm_postgresql_server.consolidahub.fqdn
  description = "PostgreSQL Server FQDN"
}

output "postgres_id" {
  value       = azurerm_postgresql_server.consolidahub.id
  description = "PostgreSQL Server ID"
}

output "postgres_admin_password" {
  value       = random_password.db_admin.result
  sensitive   = true
  description = "PostgreSQL Admin Password"
}

output "postgres_connection_string" {
  value       = "postgresql://${var.administrator_login}:${random_password.db_admin.result}@${azurerm_postgresql_server.consolidahub.fqdn}:5432/${var.db_name}?sslmode=require"
  sensitive   = true
  description = "PostgreSQL Connection String"
}
