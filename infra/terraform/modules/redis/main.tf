# Terraform module for Redis Cache
# Creates managed Azure Cache for Redis

terraform {
  required_version = ">= 1.0"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
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

variable "capacity" {
  description = "Redis capacity (0-6 for C, 0-5 for P SKU)"
  type        = number
  default     = 0
}

variable "sku_name" {
  description = "Redis SKU"
  type        = string
  default     = "Basic" # Basic, Standard, Premium
}

variable "family" {
  description = "Redis family"
  type        = string
  default     = "C" # C for Basic/Standard, P for Premium
}

variable "enable_non_ssl_port" {
  description = "Enable non-SSL port"
  type        = bool
  default     = false
}

# Azure Cache for Redis
resource "azurerm_redis_cache" "consolidahub" {
  name                = "consolidahub-redis-${var.environment}"
  location            = var.location
  resource_group_name = var.resource_group_name
  capacity            = var.capacity
  sku_name            = var.sku_name
  family              = var.family
  enable_non_ssl_port = var.enable_non_ssl_port
  minimum_tls_version = "1.2"

  redis_configuration {
    maxmemory_policy = "allkeys-lru"
  }

  tags = {
    environment = var.environment
    project     = "consolidahub"
  }
}

# Firewall Rule for VNet
resource "azurerm_redis_firewall_rule" "consolidahub" {
  name                = "AllowVNet"
  redis_cache_name    = azurerm_redis_cache.consolidahub.name
  resource_group_name = var.resource_group_name
  start_ip            = "10.0.0.0"
  end_ip              = "10.0.255.255"
}

output "redis_id" {
  value       = azurerm_redis_cache.consolidahub.id
  description = "Redis Cache ID"
}

output "redis_hostname" {
  value       = azurerm_redis_cache.consolidahub.hostname
  description = "Redis Cache Hostname"
}

output "redis_port" {
  value       = azurerm_redis_cache.consolidahub.port
  description = "Redis Cache Port"
}

output "redis_primary_access_key" {
  value       = azurerm_redis_cache.consolidahub.primary_access_key
  sensitive   = true
  description = "Redis Cache Primary Access Key"
}

output "redis_connection_string" {
  value       = "redis://:${azurerm_redis_cache.consolidahub.primary_access_key}@${azurerm_redis_cache.consolidahub.hostname}:${azurerm_redis_cache.consolidahub.port}"
  sensitive   = true
  description = "Redis Cache Connection String"
}
