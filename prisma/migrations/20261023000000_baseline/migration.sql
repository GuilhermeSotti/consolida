-- ConsolidaHub — migration de base (substitui a migration 001_create_audit_logs, que não aplicava
-- em banco vazio). Gerada a partir de prisma/schema.prisma seguindo as convenções de DDL do Prisma 5.
-- A CI confirma ausência de divergência com `prisma migrate diff --exit-code`.

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "AuditOutcome" AS ENUM ('SUCCESS', 'FAILURE', 'DENIED');

-- CreateEnum
CREATE TYPE "SourceStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "SourceOrigin" AS ENUM ('FILE_UPLOAD');

-- CreateEnum
CREATE TYPE "FileFormat" AS ENUM ('CSV', 'XLSX');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'VALIDATED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "RuleStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "RuleType" AS ENUM ('FILTER', 'CONDITIONAL_ASSIGNMENT', 'ARITHMETIC', 'STANDARDIZATION', 'LOOKUP', 'PROJECTION');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('INFO', 'WARN', 'ERROR');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('GENERATING', 'AVAILABLE');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('PROCESS_IMPORT', 'RUN_EXECUTION');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('IMPORT_VALIDATED', 'IMPORT_REJECTED', 'EXECUTION_SUCCEEDED', 'EXECUTION_FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(320),
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_seen_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_identities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "tenant_id" VARCHAR(64) NOT NULL,
    "subject" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "assigned_by_id" UUID,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_user_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" VARCHAR(64),
    "outcome" "AuditOutcome" NOT NULL,
    "request_id" VARCHAR(64),
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(512),
    "details" JSONB,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sources" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "origin" "SourceOrigin" NOT NULL,
    "file_format" "FileFormat" NOT NULL,
    "sheet_name" VARCHAR(100),
    "csv_delimiter" VARCHAR(1),
    "expected_columns" JSONB NOT NULL,
    "metadata" JSONB NOT NULL,
    "status" "SourceStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by_id" UUID NOT NULL,
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_imports" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'RECEIVED',
    "file_name" VARCHAR(255) NOT NULL,
    "file_format" "FileFormat" NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "checksum_sha256" CHAR(64) NOT NULL,
    "row_count" INTEGER,
    "columns" JSONB,
    "validation_errors" JSONB,
    "error_message" VARCHAR(1000),
    "uploaded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(3),

    CONSTRAINT "data_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_files" (
    "import_id" UUID NOT NULL,
    "content" BYTEA NOT NULL,

    CONSTRAINT "import_files_pkey" PRIMARY KEY ("import_id")
);

-- CreateTable
CREATE TABLE "import_chunks" (
    "import_id" UUID NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "rows" JSONB NOT NULL,

    CONSTRAINT "import_chunks_pkey" PRIMARY KEY ("import_id","chunk_index")
);

-- CreateTable
CREATE TABLE "rules" (
    "id" UUID NOT NULL,
    "type" "RuleType" NOT NULL,
    "target_source_id" UUID NOT NULL,
    "status" "RuleStatus" NOT NULL DEFAULT 'INACTIVE',
    "current_version" INTEGER NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rule_versions" (
    "id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "phase" VARCHAR(100),
    "execution_order" INTEGER NOT NULL,
    "definition" JSONB NOT NULL,
    "change_reason" VARCHAR(500),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rule_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "executions" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'QUEUED',
    "phase" VARCHAR(100),
    "requested_by_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(100),
    "request_hash" CHAR(64) NOT NULL,
    "engine_version" VARCHAR(20) NOT NULL,
    "input_snapshot" JSONB NOT NULL,
    "reproduced_from_id" UUID,
    "cancel_requested" BOOLEAN NOT NULL DEFAULT false,
    "rows_in" INTEGER,
    "rows_out" INTEGER,
    "progress" JSONB,
    "error_code" VARCHAR(64),
    "error_message" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execution_logs" (
    "id" BIGSERIAL NOT NULL,
    "execution_id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" "LogLevel" NOT NULL,
    "step" VARCHAR(120) NOT NULL,
    "message" VARCHAR(1000) NOT NULL,
    "details" JSONB,

    CONSTRAINT "execution_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "execution_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'GENERATING',
    "columns" JSONB NOT NULL,
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "available_at" TIMESTAMPTZ(3),

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_chunks" (
    "report_id" UUID NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "rows" JSONB NOT NULL,

    CONSTRAINT "report_chunks_pkey" PRIMARY KEY ("report_id","chunk_index")
);

-- CreateTable
CREATE TABLE "background_jobs" (
    "id" UUID NOT NULL,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "run_after" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_by" VARCHAR(100),
    "locked_at" TIMESTAMPTZ(3),
    "heartbeat_at" TIMESTAMPTZ(3),
    "last_error" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "background_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "message" VARCHAR(1000) NOT NULL,
    "entity_type" VARCHAR(50),
    "entity_id" UUID,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "external_identities_user_id_idx" ON "external_identities"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "external_identities_provider_tenant_id_subject_key" ON "external_identities"("provider", "tenant_id", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- CreateIndex
CREATE INDEX "audit_events_occurred_at_idx" ON "audit_events"("occurred_at");

-- CreateIndex
CREATE INDEX "audit_events_entity_type_entity_id_idx" ON "audit_events"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_events_actor_user_id_occurred_at_idx" ON "audit_events"("actor_user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_events_action_occurred_at_idx" ON "audit_events"("action", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "sources_code_key" ON "sources"("code");

-- CreateIndex
CREATE INDEX "sources_status_idx" ON "sources"("status");

-- CreateIndex
CREATE INDEX "data_imports_source_id_status_created_at_idx" ON "data_imports"("source_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "data_imports_checksum_sha256_idx" ON "data_imports"("checksum_sha256");

-- CreateIndex
CREATE INDEX "rules_target_source_id_status_idx" ON "rules"("target_source_id", "status");

-- CreateIndex
CREATE INDEX "rules_status_idx" ON "rules"("status");

-- CreateIndex
CREATE UNIQUE INDEX "rule_versions_rule_id_version_key" ON "rule_versions"("rule_id", "version");

-- CreateIndex
CREATE INDEX "executions_status_created_at_idx" ON "executions"("status", "created_at");

-- CreateIndex
CREATE INDEX "executions_source_id_created_at_idx" ON "executions"("source_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "executions_requested_by_id_idempotency_key_key" ON "executions"("requested_by_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "execution_logs_execution_id_id_idx" ON "execution_logs"("execution_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "reports_execution_id_key" ON "reports"("execution_id");

-- CreateIndex
CREATE INDEX "reports_source_id_created_at_idx" ON "reports"("source_id", "created_at");

-- CreateIndex
CREATE INDEX "reports_status_created_at_idx" ON "reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "background_jobs_status_run_after_idx" ON "background_jobs"("status", "run_after");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at");

-- AddForeignKey
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sources" ADD CONSTRAINT "sources_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sources" ADD CONSTRAINT "sources_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_imports" ADD CONSTRAINT "data_imports_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_imports" ADD CONSTRAINT "data_imports_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_files" ADD CONSTRAINT "import_files_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "data_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_chunks" ADD CONSTRAINT "import_chunks_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "data_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rules" ADD CONSTRAINT "rules_target_source_id_fkey" FOREIGN KEY ("target_source_id") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rules" ADD CONSTRAINT "rules_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_versions" ADD CONSTRAINT "rule_versions_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_versions" ADD CONSTRAINT "rule_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executions" ADD CONSTRAINT "executions_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executions" ADD CONSTRAINT "executions_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executions" ADD CONSTRAINT "executions_reproduced_from_id_fkey" FOREIGN KEY ("reproduced_from_id") REFERENCES "executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_logs" ADD CONSTRAINT "execution_logs_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_chunks" ADD CONSTRAINT "report_chunks_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Restrições de integridade não representáveis no schema Prisma
-- (ignoradas pelo `prisma migrate diff`, portanto sem divergência).
-- ---------------------------------------------------------------------------

ALTER TABLE "rules" ADD CONSTRAINT "rules_current_version_check" CHECK ("current_version" >= 1);
ALTER TABLE "rule_versions" ADD CONSTRAINT "rule_versions_version_check" CHECK ("version" >= 1);
ALTER TABLE "rule_versions" ADD CONSTRAINT "rule_versions_execution_order_check" CHECK ("execution_order" >= 0);
ALTER TABLE "data_imports" ADD CONSTRAINT "data_imports_file_size_bytes_check" CHECK ("file_size_bytes" >= 0);
ALTER TABLE "data_imports" ADD CONSTRAINT "data_imports_row_count_check" CHECK ("row_count" IS NULL OR "row_count" >= 0);
ALTER TABLE "background_jobs" ADD CONSTRAINT "background_jobs_attempts_check" CHECK ("attempts" >= 0 AND "max_attempts" >= 1);
ALTER TABLE "reports" ADD CONSTRAINT "reports_row_count_check" CHECK ("row_count" >= 0);

-- Auditoria somente-inclusão: UPDATE e DELETE são rejeitados pelo banco.
CREATE FUNCTION "audit_events_reject_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only (% blocked)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "audit_events_append_only"
BEFORE UPDATE OR DELETE ON "audit_events"
FOR EACH ROW EXECUTE FUNCTION "audit_events_reject_mutation"();

-- Versões de regra são imutáveis.
CREATE FUNCTION "rule_versions_reject_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'rule_versions is immutable (% blocked)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "rule_versions_immutable"
BEFORE UPDATE OR DELETE ON "rule_versions"
FOR EACH ROW EXECUTE FUNCTION "rule_versions_reject_mutation"();
