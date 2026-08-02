import { ExcelLoaderService } from '../../src/modules/loaders/services/excel-loader.service';
import * as XLSX from 'xlsx';

describe('ExcelLoaderService', () => {
  it('parses a simple sheet from buffer', async () => {
    const wb = XLSX.utils.book_new();
    const data = [{ a: 1, b: 'x' }, { a: 2, b: 'y' }];
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const svc = new ExcelLoaderService();
    const parsed = await svc.load(buf as Buffer);

    expect(parsed).toHaveLength(2);
    expect(parsed[0].a).toBe(1);
    expect(parsed[1].b).toBe('y');
  });
});
