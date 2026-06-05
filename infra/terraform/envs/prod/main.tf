# Production Environment Configuration

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
  #   key                  = "prod.tfstate"
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
  default = "prod"
}

variable "location" {
  default = "eastus2"
}

variable "resource_group_name" {
  default = "consolidahub-prod"
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
  vnet_cidr           = "10.2.0.0/16"
}

# Database Module
module "database" {
  source = "../../modules/database"

  environment         = var.environment
  location            = var.location
  resource_group_name = azurerm_resource_group.consolidahub.name
  subnet_id           = module.network.db_subnet_id
  sku_name            = "GP_Gen5_4"
  backup_retention_days = 35
}

# Redis Module
module "redis" {
  source = "../../modules/redis"

  environment         = var.environment
  location            = var.location
  resource_group_name = azurerm_resource_group.consolidahub.name
  capacity            = 2
  sku_name            = "Premium"
  family              = "P"
}

output "database_url" {
  value       = module.database.postgres_connection_string
  sensitive   = true
}

output "redis_url" {
  value       = module.redis.redis_connection_string
  sensitive   = true
}
