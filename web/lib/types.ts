/**
 * Types mirrored from contracts/openapi.yaml (the API contract is the source of truth; keep in
 * sync when the contract changes — see docs/guias/contrato-openapi.md).
 */
export type Scalar = string | number | boolean | null;
export type Row = Record<string, Scalar>;

export interface PageMetadata {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface Page<T> {
  items: T[];
  metadata: PageMetadata;
}

export interface ErrorDetail {
  field?: string;
  message: string;
  code?: string;
}

export interface Principal {
  userId: string;
  displayName: string;
  email: string | null;
  roles: string[];
  permissions: string[];
}

export interface User {
  id: string;
  displayName: string;
  email: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  roles: string[];
  lastSeenAt: string | null;
  createdAt: string;
}

export interface Role {
  code: string;
  name: string;
  description: string | null;
  permissions: string[];
}

export type FileFormat = 'CSV' | 'XLSX';

export interface ExpectedColumn {
  name: string;
  required: boolean;
}

export interface Source {
  id: string;
  code: string;
  name: string;
  description: string | null;
  origin: 'FILE_UPLOAD';
  fileFormat: FileFormat;
  sheetName: string | null;
  csvDelimiter: string | null;
  expectedColumns: ExpectedColumn[];
  metadata: Record<string, string>;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

export type ImportStatus = 'RECEIVED' | 'PROCESSING' | 'VALIDATED' | 'REJECTED' | 'FAILED';

export interface DataImport {
  id: string;
  sourceId: string;
  status: ImportStatus;
  fileName: string;
  fileFormat: FileFormat;
  fileSizeBytes: number;
  checksumSha256: string;
  rowCount: number | null;
  columns: Array<{ original: string | null; name: string }> | null;
  validationErrors: ErrorDetail[] | null;
  errorMessage: string | null;
  uploadedById: string;
  createdAt: string;
  processedAt: string | null;
}

export const RULE_TYPES = ['FILTER', 'CONDITIONAL_ASSIGNMENT', 'ARITHMETIC', 'STANDARDIZATION', 'LOOKUP', 'PROJECTION'] as const;
export type RuleType = (typeof RULE_TYPES)[number];

export interface RuleVersion {
  id: string;
  ruleId: string;
  version: number;
  name: string;
  description: string | null;
  phase: string | null;
  executionOrder: number;
  definition: unknown;
  changeReason: string | null;
  createdById: string;
  createdAt: string;
}

export interface Rule {
  id: string;
  type: RuleType;
  targetSourceId: string;
  status: 'ACTIVE' | 'INACTIVE';
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
  current: RuleVersion;
}

export type ExecutionStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

export interface Execution {
  id: string;
  sourceId: string;
  status: ExecutionStatus;
  phase: string | null;
  requestedById: string;
  engineVersion: string;
  inputSnapshot: {
    primaryImportId: string;
    referenceImports: Array<{ sourceId: string; importId: string }>;
    rules: Array<{ ruleId: string; ruleVersionId: string; version: number }>;
  };
  reproducedFromId: string | null;
  cancelRequested: boolean;
  rowsIn: number | null;
  rowsOut: number | null;
  progress: { stage: string; rulesApplied: number; totalRules: number } | null;
  errorCode: string | null;
  errorMessage: string | null;
  reportId: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface ExecutionLog {
  id: string;
  occurredAt: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  step: string;
  message: string;
  details: unknown;
}

export interface Report {
  id: string;
  executionId: string;
  sourceId: string;
  name: string;
  columns: string[];
  rowCount: number;
  createdAt: string;
  availableAt: string | null;
  execution: {
    phase: string | null;
    requestedById: string;
    engineVersion: string;
    reproducedFromId: string | null;
    primaryImportId: string;
    rules: Array<{ ruleId: string; ruleVersionId: string; version: number }>;
  };
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  occurredAt: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  outcome: 'SUCCESS' | 'FAILURE' | 'DENIED';
  requestId: string | null;
  details: unknown;
}
