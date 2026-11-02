variable "subscription_id" {
  description = "Azure subscription that hosts the environment."
  type        = string
}

variable "environment" {
  description = "dev, hml or prod."
  type        = string
  validation {
    condition     = contains(["dev", "hml", "prod"], var.environment)
    error_message = "environment must be dev, hml or prod."
  }
}

variable "location" {
  description = "Azure region (decided by the organization)."
  type        = string
}

variable "name_prefix" {
  description = "Short prefix for resource names (lowercase letters and digits)."
  type        = string
  default     = "conshub"
}

variable "vnet_address_space" {
  type    = string
  default = "10.40.0.0/16"
}

variable "aca_subnet_prefix" {
  description = "Subnet delegated to the Container Apps environment (workload profiles: /27 or larger)."
  type        = string
  default     = "10.40.0.0/23"
}

variable "postgres_subnet_prefix" {
  description = "Subnet delegated to PostgreSQL Flexible Server."
  type        = string
  default     = "10.40.4.0/24"
}

variable "postgres_sku" {
  description = "Flexible Server SKU (e.g. B_Standard_B1ms in dev, GP_Standard_D2ds_v5 in prod)."
  type        = string
}

variable "postgres_storage_mb" {
  type    = number
  default = 32768
}

variable "postgres_backup_retention_days" {
  type    = number
  default = 7
}

variable "postgres_high_availability" {
  description = "Zone-redundant HA (recommended in prod)."
  type        = bool
  default     = false
}

variable "postgres_geo_redundant_backup" {
  type    = bool
  default = false
}

variable "image_tag" {
  description = "Immutable image tag (git SHA) used when the container apps are CREATED. Later rollouts are done by the deploy workflow (Terraform ignores image changes)."
  type        = string
}

variable "entra_tenant_id" {
  type = string
}

variable "entra_api_client_id" {
  description = "Application (client) ID of the API registration."
  type        = string
}

variable "entra_spa_client_id" {
  description = "Application (client) ID of the SPA registration (allowed azp)."
  type        = string
}

variable "web_public_origin" {
  description = "Public HTTPS origin of the web app (CORS), e.g. https://consolidahub.example.org"
  type        = string
}

variable "api_min_replicas" {
  type    = number
  default = 1
}

variable "api_max_replicas" {
  type    = number
  default = 3
}

variable "log_retention_days" {
  type    = number
  default = 30
}

variable "tags" {
  type    = map(string)
  default = {}
}
