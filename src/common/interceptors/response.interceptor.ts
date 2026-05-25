import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data: unknown) => {
        // Se o serviço retorna um objeto com estrutura já definida, retornar como está
        if (data && typeof data === 'object' && 'success' in (data as Record<string, unknown>)) {
          return data;
        }

        // Caso contrário, envolver em resposta padrão
        return {
          success: true,
          data: data || {},
        };
      }),
    );
  }
}
