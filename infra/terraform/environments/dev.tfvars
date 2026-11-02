# Ambiente dev — valores NÃO secretos. IDs reais são definidos pela equipe de plataforma.
environment                    = "dev"
location                       = "eastus2" # região herdada do Terraform original; confirmar com a organização
subscription_id                = "00000000-0000-0000-0000-000000000000"
postgres_sku                   = "B_Standard_B1ms"
postgres_high_availability     = false
postgres_geo_redundant_backup  = false
postgres_backup_retention_days = 7
api_min_replicas               = 1
api_max_replicas               = 2
entra_tenant_id                = "00000000-0000-0000-0000-000000000000"
entra_api_client_id            = "00000000-0000-0000-0000-000000000000"
entra_spa_client_id            = "00000000-0000-0000-0000-000000000000"
web_public_origin              = "https://consolidahub-dev.example.invalid"
# image_tag é informado pelo pipeline (-var image_tag=<git sha>)
