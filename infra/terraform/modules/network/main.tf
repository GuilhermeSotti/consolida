# Terraform module for networking infrastructure
# Creates VPC, subnets, security groups, and network policies

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
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "location" {
  description = "Azure region"
  type        = string
  default     = "eastus2"
}

variable "resource_group_name" {
  description = "Resource group name"
  type        = string
}

variable "vnet_cidr" {
  description = "CIDR block for VNet"
  type        = string
  default     = "10.0.0.0/16"
}

variable "subnet_cidrs" {
  description = "CIDR blocks for subnets"
  type        = map(string)
  default = {
    app_subnet  = "10.0.1.0/24"
    db_subnet   = "10.0.2.0/24"
    cache_subnet = "10.0.3.0/24"
  }
}

# Create Virtual Network
resource "azurerm_virtual_network" "consolidahub" {
  name                = "consolidahub-vnet-${var.environment}"
  address_space       = [var.vnet_cidr]
  location            = var.location
  resource_group_name = var.resource_group_name

  tags = {
    environment = var.environment
    project     = "consolidahub"
  }
}

# Create subnets
resource "azurerm_subnet" "app" {
  name                 = "consolidahub-app-subnet-${var.environment}"
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.consolidahub.name
  address_prefixes     = [var.subnet_cidrs["app_subnet"]]

  delegation {
    name = "app-delegation"

    service_delegation {
      name = "Microsoft.ContainerInstance/containerGroups"
    }
  }
}

resource "azurerm_subnet" "database" {
  name                 = "consolidahub-db-subnet-${var.environment}"
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.consolidahub.name
  address_prefixes     = [var.subnet_cidrs["db_subnet"]]
}

resource "azurerm_subnet" "cache" {
  name                 = "consolidahub-cache-subnet-${var.environment}"
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.consolidahub.name
  address_prefixes     = [var.subnet_cidrs["cache_subnet"]]
}

# Application Security Group
resource "azurerm_application_security_group" "app" {
  name                = "consolidahub-app-asg-${var.environment}"
  location            = var.location
  resource_group_name = var.resource_group_name

  tags = {
    environment = var.environment
    project     = "consolidahub"
  }
}

# Network Security Group
resource "azurerm_network_security_group" "app" {
  name                = "consolidahub-app-nsg-${var.environment}"
  location            = var.location
  resource_group_name = var.resource_group_name

  security_rule {
    name                       = "AllowHTTP"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "80"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "AllowHTTPS"
    priority                   = 101
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "443"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "AllowAppPort"
    priority                   = 102
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "3000"
    source_address_prefix      = var.vnet_cidr
    destination_address_prefix = "*"
  }

  tags = {
    environment = var.environment
    project     = "consolidahub"
  }
}

output "vnet_id" {
  value       = azurerm_virtual_network.consolidahub.id
  description = "VNet ID"
}

output "app_subnet_id" {
  value       = azurerm_subnet.app.id
  description = "App subnet ID"
}

output "db_subnet_id" {
  value       = azurerm_subnet.database.id
  description = "Database subnet ID"
}

output "cache_subnet_id" {
  value       = azurerm_subnet.cache.id
  description = "Cache subnet ID"
}

output "app_nsg_id" {
  value       = azurerm_network_security_group.app.id
  description = "Application NSG ID"
}
