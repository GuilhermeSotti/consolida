export class ReportEntity {
  id!: string;
  name!: string;
  description?: string;
  type!: string;
  status!: string;
  data?: unknown;
  createdBy!: string;
  createdAt!: Date;
  updatedAt!: Date;
}
