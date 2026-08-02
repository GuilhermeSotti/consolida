import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class SharepointLoaderService {
  private readonly logger = new Logger(SharepointLoaderService.name);

  /**
   * Fetch file from SharePoint or any URL using an access token.
   * Expected config: { fileUrl: string, accessToken?: string }
   */
  async fetchFile(sharepointConfig: Record<string, unknown>, _path?: string): Promise<Buffer> {
    const cfg = sharepointConfig as Record<string, any>;

    const fileUrl = cfg.fileUrl || cfg.url;
    if (!fileUrl) throw new Error('sharepoint config must include fileUrl');

    const headers: Record<string, string> = {};
    if (cfg.accessToken) headers['Authorization'] = `Bearer ${cfg.accessToken}`;

    this.logger.debug(`Fetching file from ${fileUrl}`);

    const resp = await axios.get(fileUrl, { responseType: 'arraybuffer', headers });
    const buffer = Buffer.from(resp.data);
    return buffer;
  }
}
