-- ConsolidaHub — papel de banco de MENOR PRIVILÉGIO para a API e o worker.
--
-- Execute UMA VEZ por ambiente (e novamente se quiser reaplicar as permissões; o script é
-- idempotente), conectado com o MESMO papel que executa as migrations (dono das tabelas; no
-- Azure: o administrador do Flexible Server), a partir de uma máquina com acesso à rede privada
-- do banco:
--
--   psql "host=<fqdn> dbname=consolidahub user=<papel-das-migrations> sslmode=require" -f infra/database/app-role.sql
--   psql ... -c "\password consolidahub_app"    -- senha digitada de forma oculta (SCRAM no cliente)
--
-- Depois grave a URL de conexão do papel no Key Vault (segredo `database-url-app`) e reinicie a
-- API e o worker (docs/guias/deploy.md). Nenhuma senha é gravada neste arquivo.
--
-- O que o papel pode fazer: ler e gravar dados (SELECT/INSERT/UPDATE), apagar apenas onde o
-- código precisa (vínculos de papéis e blocos de carga substituídos). Não pode: alterar ou apagar
-- auditoria e versões de regra, TRUNCATE, DDL, desabilitar triggers, ler o histórico de migrations.
\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'consolidahub_app') THEN
    -- Sem senha aqui: defina-a com \password (o login falha até lá).
    CREATE ROLE consolidahub_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO consolidahub_app', current_database());
END
$$;
GRANT USAGE ON SCHEMA public TO consolidahub_app;
REVOKE CREATE ON SCHEMA public FROM consolidahub_app;

-- Tabelas existentes
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO consolidahub_app;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM consolidahub_app;
GRANT DELETE ON TABLE public.user_roles, public.import_chunks TO consolidahub_app;
-- Registros imutáveis (além dos triggers da migration de base)
REVOKE UPDATE ON TABLE public.audit_events, public.rule_versions FROM consolidahub_app;
-- Histórico de migrations é do papel das migrations
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    REVOKE ALL ON TABLE public._prisma_migrations FROM consolidahub_app;
  END IF;
END
$$;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO consolidahub_app;

-- Tabelas futuras criadas pelas migrations (executadas por este mesmo papel): leitura e escrita;
-- DELETE e restrições de imutabilidade de novas tabelas devem ser acrescentados aqui na mesma PR.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO consolidahub_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO consolidahub_app;
