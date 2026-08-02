import { Injectable } from '@nestjs/common';

/**
 * Rule applier scaffold. Real implementation should parse rule JSON and apply transformations.
 */
@Injectable()
export class RuleApplierService {
  applyRules(records: any[], rules: any[]): any[] {
    // No-op placeholder: return input
    return records;
  }
}
