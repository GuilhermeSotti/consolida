import { Controller, Post, Body, Res, Get, UseGuards } from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { LoginDto } from '../application/dto/login.dto';
import { MsalCallbackDto } from '../application/dto/msal-callback.dto';
import { ValidateEntraTokenUseCase } from '../application/use-cases/validate-entra-token.use-case';
import { SyncLocalUserUseCase } from '../application/use-cases/sync-local-user.use-case';
import { BuildSessionUseCase } from '../application/use-cases/build-session.use-case';
import { EntraTokenClaims } from '../infrastructure/providers/entra-token-validator.provider';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly validateEntraToken: ValidateEntraTokenUseCase,
    private readonly syncLocalUser: SyncLocalUserUseCase,
    private readonly buildSession: BuildSessionUseCase,
  ) {}

  @Throttle({ auth: { limit: 5, ttl: 60000 } })
  @Post('login')
  async login(@Body() loginDto: LoginDto, @Res() res: Response) {
    // This endpoint would typically redirect to Entra ID
    // In a production scenario, the frontend handles MSAL flow
    // and sends back the token to this endpoint
    res.json({
      message: 'Redirect to Entra ID for authentication',
      entraLoginUrl: process.env.ENTRA_LOGIN_URL,
    });
  }

  @Throttle({ auth: { limit: 5, ttl: 60000 } })
  @Post('callback')
  async handleMsalCallback(
    @Body() callbackDto: MsalCallbackDto,
    @Res() res: Response,
  ) {
    // Handle the MSAL callback
    // This would typically exchange the code for tokens
    res.json({
      message: 'Callback received',
      code: callbackDto.code,
    });
  }

  @Throttle({ auth: { limit: 5, ttl: 60000 } })
  @Post('validate-token')
  async validateToken(@Body('token') token: string) {
    const claims = await this.validateEntraToken.execute(token);
    return claims;
  }

  @SkipThrottle()
  @Post('sync-user')
  async syncUser(
    @Body()
    data: {
      email: string;
      displayName: string;
      entraSub: string;
    },
  ) {
    const user = await this.syncLocalUser.execute(
      data.email,
      data.displayName,
      data.entraSub,
    );
    return user;
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getCurrentUser(@CurrentUser() user: EntraTokenClaims) {
    return user;
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@CurrentUser() user: EntraTokenClaims, @Res() res: Response) {
    // In a stateless scenario, the frontend would simply discard the token
    res.json({
      message: 'Logout successful',
      user: user.email,
    });
  }
}
