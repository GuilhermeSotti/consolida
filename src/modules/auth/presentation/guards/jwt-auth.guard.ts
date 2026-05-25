import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { ValidateEntraTokenUseCase } from '../../application/use-cases/validate-entra-token.use-case.ts';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly validateEntraToken: ValidateEntraTokenUseCase) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    try {
      const payload = await this.validateEntraToken.execute(token);
      request.user = payload;
    } catch (error) {
      throw new UnauthorizedException(`Invalid token: ${error.message}`);
    }

    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
