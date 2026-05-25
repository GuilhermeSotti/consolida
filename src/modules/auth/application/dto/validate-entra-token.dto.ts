export class ValidateEntraTokenDto {
  token: string;
  issuer: string;
  audience: string;
  jwksUri: string;
}
