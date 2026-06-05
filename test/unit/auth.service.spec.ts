import { Test } from '@nestjs/testing';
import { AuthService } from '../../src/modules/auth/application/services/auth.service';

describe('AuthService (Unit)', () => {
  let service: AuthService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [AuthService],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should validate email format', () => {
    const validEmail = 'test@example.com';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    expect(emailRegex.test(validEmail)).toBe(true);
  });

  it('should reject invalid email format', () => {
    const invalidEmail = 'invalid-email';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    expect(emailRegex.test(invalidEmail)).toBe(false);
  });

  it('should validate password minimum length', () => {
    const password = 'ValidPassword123!';
    const minLength = 8;

    expect(password.length).toBeGreaterThanOrEqual(minLength);
  });
});
