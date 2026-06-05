# Staging Environment Configuration

terraform {
  required_version = ">= 1.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }

  # backend "azurerm" {
  #   resource_group_name  = "consolidahub-terraform"
  #   storage_account_name = "consolidahubtfstate"
  #   container_name       = "tfstate"
  #   key                  = "staging.tfstate"
  # }
}

provider "azurerm" {
  features {
    virtual_machine {
      delete_os_disk_on_deletion            = true
      graceful_shutdown                     = false
      skip_shutdown_and_force_delete        = false
    }
  }
}

variable "environment" {
  default = "staging"
}

variable "location" {
  default = "eastus2"
}

variable "resource_group_name" {
  default = "consolidahub-staging"
}

# Create Resource Group
resource "azurerm_resource_group" "consolidahub" {
  name     = var.resource_group_name
  location = var.location

  tags = {
    environment = var.environment
    project     = "consolidahub"
  }
}

# Network Module
module "network" {
  source = "../../modules/network"

  environment         = var.environment
  location            = var.location
  resource_group_name = azurerm_resource_group.consolidahub.name
  vnet_cidr           = "10.1.0.0/16"
}

# Database Module
module "database" {
  source = "../../modules/database"

  environment         = var.environment
  location            = var.location
  resource_group_name = azurerm_resource_group.consolidahub.name
  subnet_id           = module.network.db_subnet_id
  sku_name            = "B_Gen5_2"
  backup_retention_days = 14
}

# Redis Module
module "redis" {
  source = "../../modules/redis"

  environment         = var.environment
  location            = var.location
  resource_group_name = azurerm_resource_group.consolidahub.name
  capacity            = 1
  sku_name            = "Standard"
  family              = "C"
}

output "database_url" {
  value       = module.database.postgres_connection_string
  sensitive   = true
}

output "redis_url" {
  value       = module.redis.redis_connection_string
  sensitive   = true
}
