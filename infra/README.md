# ConsolidaHub Infrastructure Guide

## Overview

This infrastructure setup provides a complete, cloud-ready deployment configuration for ConsolidaHub using:

- **Docker Compose**: Local development environment
- **Terraform**: Infrastructure as Code (IaC) for Azure
- **Kubernetes**: Container orchestration with environment-specific overlays
- **PostgreSQL**: Primary data store
- **Redis**: Cache and session management
- **Entra ID**: Azure AD integration for authentication

---

## Directory Structure

```
infra/
├── docker/
│   ├── docker-compose.yml     # Local dev environment
│   ├── .env.example            # Docker env template
│   └── Dockerfile              # Application container image
├── terraform/
│   ├── modules/                # Reusable infrastructure modules
│   │   ├── network/           # VNet, subnets, NSGs
│   │   ├── database/          # PostgreSQL managed instance
│   │   └── redis/             # Azure Cache for Redis
│   └── envs/                  # Environment-specific configs
│       ├── dev/               # Development (1 replica, minimal resources)
│       ├── staging/           # Staging (2 replicas, balanced resources)
│       └── prod/              # Production (3 replicas, full resources)
└── k8s/                        # Kubernetes manifests
    ├── base/                  # Base configuration
    └── overlays/              # Environment-specific overrides
        ├── dev/
        ├── staging/
        └── prod/
```

---

## Local Development Setup

### Prerequisites

- Docker Desktop (with Docker Compose)
- Node.js 20+
- PostgreSQL client tools (optional, for manual DB access)

### Getting Started

1. **Clone environment variables:**
   ```bash
   cp .env.example .env
   cp infra/docker/.env.example infra/docker/.env
   ```

2. **Start the full stack:**
   ```bash
   docker-compose -f infra/docker/docker-compose.yml up -d
   ```

3. **Initialize the database:**
   ```bash
   npm run prisma:migrate
   npm run prisma:generate
   ```

4. **Access the application:**
   - API: http://localhost:3000
   - Swagger Docs: http://localhost:3000/docs
   - pgAdmin: http://localhost:5050
   - Redis Commander: http://localhost:8081

### Stopping the Stack

```bash
docker-compose -f infra/docker/docker-compose.yml down
```

---

## Cloud Deployment with Terraform

### Prerequisites

- Azure CLI installed and authenticated: `az login`
- Terraform >= 1.0
- Azure subscription with Owner or Contributor role

### Initialize Environment

Replace `{env}` with `dev`, `staging`, or `prod`:

```bash
cd infra/terraform/envs/{env}
terraform init
```

### Plan and Apply

```bash
# Review infrastructure changes
terraform plan -out=tfplan

# Apply infrastructure
terraform apply tfplan
```

### Retrieve Connection Strings

```bash
terraform output -raw database_url
terraform output -raw redis_url
```

### Backend Configuration (Remote State)

To use Azure Storage for Terraform state:

```bash
# Create storage account first
az storage account create \
  --name consolidahubtfstate \
  --resource-group consolidahub-terraform \
  --location eastus2

# Configure backend in main.tf (uncomment and update values)
terraform init -backend-config="resource_group_name=consolidahub-terraform" \
               -backend-config="storage_account_name=consolidahubtfstate" \
               -backend-config="container_name=tfstate" \
               -backend-config="key={env}.tfstate"
```

---

## Kubernetes Deployment

### Prerequisites

- kubectl installed
- Access to AKS cluster
- Kustomize >= 4.0

### Deploy Base Configuration

```bash
kubectl create namespace production
kustomize build infra/k8s/overlays/prod | kubectl apply -f -
```

### Deploy Specific Environment

```bash
# Development
kustomize build infra/k8s/overlays/dev | kubectl apply -f -

# Staging
kustomize build infra/k8s/overlays/staging | kubectl apply -f -

# Production
kustomize build infra/k8s/overlays/prod | kubectl apply -f -
```

### Verify Deployment

```bash
kubectl get deployments -n production
kubectl get services -n production
kubectl get pods -n production -w
```

### Update Secrets

```bash
kubectl create secret generic consolidahub-secrets \
  --from-env-file=.env \
  -n production \
  --dry-run=client -o yaml | kubectl apply -f -
```

---

## Database Migrations

### Local Development

```bash
# Create new migration
npm run prisma:migrate -- --name add_new_table

# Apply migrations
npm run prisma:migrate

# View database with Prisma Studio
npm run prisma:studio
```

### Production Migrations

For production environments, run migrations before deploying:

```bash
# In your CI/CD pipeline
npm run prisma:migrate -- --skip-generate
```

Or manually with `kubectl exec`:

```bash
kubectl exec -it deployment/consolidahub-api -n production -- npm run prisma:migrate
```

---

## Environment Variables

### Required Variables

- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `JWT_SECRET`: Secret key for JWT signing
- `ENTRA_TENANT_ID`: Azure AD tenant ID
- `ENTRA_CLIENT_ID`: Azure AD application client ID
- `ENTRA_CLIENT_SECRET`: Azure AD application secret
- `ENTRA_AUTHORITY`: Azure AD authority URL

### Optional Variables

- `LOG_LEVEL`: Logging level (debug, info, warn, error)
- `SENTRY_DSN`: Sentry error tracking
- `STORAGE_TYPE`: Storage backend (local, azure, s3)
- `SECRET_MANAGER_TYPE`: Secret management (env, azure, aws)

---

## Monitoring & Observability

### Logs

```bash
# View application logs
kubectl logs deployment/consolidahub-api -n production -f

# View previous logs (if pod crashed)
kubectl logs deployment/consolidahub-api -n production --previous
```

### Health Checks

```bash
# Check application health
curl http://localhost:3000/api/v1/health

# Check pod readiness
kubectl get pods -n production --field-selector=status.phase=Running
```

### Database Monitoring

```bash
# Connect to PostgreSQL
psql postgresql://user:password@host/consolidahub

# Check active connections
SELECT datname, usename, application_name, state FROM pg_stat_activity;

# Monitor table sizes
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) 
FROM pg_tables 
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

---

## Security Best Practices

1. **Secrets Management**: Never commit `.env` files. Use Azure Key Vault or Kubernetes Secrets
2. **Network Security**: Use NSGs and Network Policies to restrict traffic
3. **HTTPS/TLS**: All traffic should be encrypted
4. **Regular Backups**: PostgreSQL backup retention configured per environment
5. **Access Control**: Use RBAC for Kubernetes and Azure resources
6. **Audit Logging**: All sensitive actions are logged in the `audit_logs` table

---

## Troubleshooting

### Docker Issues

```bash
# View logs
docker-compose -f infra/docker/docker-compose.yml logs api

# Restart services
docker-compose -f infra/docker/docker-compose.yml restart

# Clean up and rebuild
docker-compose -f infra/docker/docker-compose.yml down -v
docker-compose -f infra/docker/docker-compose.yml build --no-cache
```

### Terraform Issues

```bash
# Validate configuration
terraform validate

# Format code
terraform fmt -recursive

# Debug
TF_LOG=DEBUG terraform plan
```

### Kubernetes Issues

```bash
# Check pod events
kubectl describe pod <pod-name> -n production

# Check resource limits
kubectl top pods -n production

# Debug shell access
kubectl exec -it <pod-name> -n production -- /bin/sh
```

---

## Cost Optimization

- **Dev**: Basic/Burstable SKUs, minimal replicas
- **Staging**: Standard SKUs, balanced configuration
- **Prod**: Premium SKUs, high availability, geo-redundancy

Monitor Azure Cost Management for unexpected charges and adjust resource sizing as needed.

---

## Support & Documentation

- [Azure Terraform Provider](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Prisma Documentation](https://www.prisma.io/docs/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
