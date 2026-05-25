import { Injectable } from '@nestjs/common';
import { EntraTokenValidatorProvider } from '../../infrastructure/providers/entra-token-validator.provider';

@Injectable()
export class ValidateEntraTokenUseCase {
  constructor(
    private readonly entraTokenValidator: EntraTokenValidatorProvider,
  ) {}

  async execute(token: string) {
    return this.entraTokenValidator.validateToken(token);
  }
}
