declare module 'uuid' {
  export function v4(): string;
  export function validate(uuid: string): boolean;
  export function version(uuid: string): number;
  export function nil(): string;
  export const NIL: string;
}
