import axios from 'axios';
import * as XLSX from 'xlsx';
import { SharepointLoaderService } from '../../src/modules/loaders/services/sharepoint-loader.service';

jest.mock('axios');

describe('SharepointLoaderService (e2e mock)', () => {
  it('downloads file and returns buffer', async () => {
    const wb = XLSX.utils.book_new();
    const data = [{ a: 1 }];
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // mock axios.get to return buffer
    (axios.get as jest.Mock).mockResolvedValue({ data: buf });

    const svc = new SharepointLoaderService();
    const downloaded = await svc.fetchFile({ fileUrl: 'https://example.com/files/sample.xlsx', accessToken: 'tok' });

    expect(Buffer.isBuffer(downloaded)).toBe(true);
    const parsed = XLSX.read(downloaded, { type: 'buffer' });
    expect(parsed.SheetNames).toContain('Sheet1');
  });
});
