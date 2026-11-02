# Ambiente prod — valores NÃO secretos. IDs reais são definidos pela equipe de plataforma.
environment                    = "prod"
location                       = "eastus2" # região herdada do Terraform original; confirmar com a organização
subscription_id                = "00000000-0000-0000-0000-000000000000"
postgres_sku                   = "GP_Standard_D2ds_v5"
postgres_high_availability     = true
postgres_geo_redundant_backup  = true
postgres_backup_retention_days = 35
api_min_replicas               = 2
api_max_replicas               = 5
entra_tenant_id                = "00000000-0000-0000-0000-000000000000"
entra_api_client_id            = "00000000-0000-0000-0000-000000000000"
entra_spa_client_id            = "00000000-0000-0000-0000-000000000000"
web_public_origin              = "https://consolidahub-prod.example.invalid"
# image_tag é informado pelo pipeline (-var image_tag=<git sha>)
