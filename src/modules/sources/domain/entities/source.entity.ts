export class SourceEntity {
  id!: string;
  name!: string;
  description?: string;
  type!: string;
  status!: string;
  config!: Record<string, unknown>;
  createdBy!: string;
  updatedBy?: string;
  createdAt!: Date;
  updatedAt!: Date;

  deactivate() {
    this.status = 'INACTIVE';
    this.updatedAt = new Date();
  }
}
