import { HttpStatus, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';

/**
 * Error handling for streamed downloads. Nest's default handler ends the response normally when
 * the stream fails after the first bytes (the client receives a truncated file that looks
 * complete) and echoes the internal error message when it fails before them. Here:
 *  - after the headers were sent, the connection is destroyed, so the client sees an aborted
 *    transfer (incomplete chunked encoding) instead of a short file;
 *  - before that, a generic 500 envelope is returned (details stay in the server log).
 */
export function abortOnStreamError(file: StreamableFile, requestId: string | undefined): StreamableFile {
  return file.setErrorHandler((error, response) => {
    const res = response as unknown as Response;
    if (res.destroyed) return;
    if (res.headersSent) {
      res.destroy(error);
      return;
    }
    res.removeHeader('Content-Disposition');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    res.end(
      JSON.stringify({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Falha ao gerar o arquivo de exportação.', requestId: requestId ?? null },
      }),
    );
  });
}
