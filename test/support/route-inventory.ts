/**
 * Extracts the HTTP routes declared by NestJS controllers from the TypeScript sources (AST only,
 * no compilation), including the access policy decorators and explicit HTTP status codes.
 * Used by the contract test to keep contracts/openapi.yaml and the code in lockstep.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as ts from 'typescript';
import { PERMISSIONS } from '../../src/modules/auth/domain/access-control';

export type AccessPolicy = { kind: 'public' } | { kind: 'authenticated' } | { kind: 'permissions'; permissions: string[] };

export interface DeclaredRoute {
  method: string;
  /** OpenAPI-style path without the global prefix, e.g. /rules/{ruleId}. */
  path: string;
  access: AccessPolicy | null;
  httpCode: number | null;
  location: string;
}

const HTTP_DECORATORS = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete']);

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return files(full);
    return entry.name.endsWith('.controller.ts') ? [full] : [];
  });
}

function decorators(node: ts.Node): ts.Decorator[] {
  return ts.canHaveDecorators(node) ? [...(ts.getDecorators(node) ?? [])] : [];
}

function call(decorator: ts.Decorator): { name: string; args: readonly ts.Expression[] } | null {
  const expression = decorator.expression;
  if (!ts.isCallExpression(expression) || !ts.isIdentifier(expression.expression)) return null;
  return { name: expression.expression.text, args: expression.arguments };
}

function literal(argument: ts.Expression | undefined): string {
  if (!argument) return '';
  if (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) return argument.text;
  throw new Error(`Rota com caminho não literal: ${argument.getText()}`);
}

function permission(argument: ts.Expression): string {
  if (ts.isPropertyAccessExpression(argument) && ts.isIdentifier(argument.expression) && argument.expression.text === 'PERMISSIONS') {
    const value = (PERMISSIONS as Record<string, string>)[argument.name.text];
    if (value) return value;
  }
  if (ts.isStringLiteral(argument)) return argument.text;
  throw new Error(`Permissão não reconhecida: ${argument.getText()}`);
}

function policy(nodeDecorators: ts.Decorator[]): AccessPolicy | null | 'multiple' {
  const found: AccessPolicy[] = [];
  for (const decorator of nodeDecorators) {
    const info = call(decorator);
    if (!info) continue;
    if (info.name === 'Public') found.push({ kind: 'public' });
    if (info.name === 'AuthenticatedOnly') found.push({ kind: 'authenticated' });
    if (info.name === 'RequirePermissions') found.push({ kind: 'permissions', permissions: info.args.map(permission) });
  }
  if (found.length > 1) return 'multiple';
  return found[0] ?? null;
}

function toOpenApi(path: string): string {
  const joined = `/${path}`.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
  return joined.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

export function collectRoutes(sourceRoot: string): DeclaredRoute[] {
  const routes: DeclaredRoute[] = [];
  for (const file of files(sourceRoot)) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ES2022, true);
    source.forEachChild((node) => {
      if (!ts.isClassDeclaration(node)) return;
      const classDecorators = decorators(node);
      const controller = classDecorators.map(call).find((info) => info?.name === 'Controller');
      if (!controller) return;
      const base = literal(controller.args[0]);
      const classPolicy = policy(classDecorators);
      for (const member of node.members) {
        if (!ts.isMethodDeclaration(member)) continue;
        const memberDecorators = decorators(member);
        const http = memberDecorators.map(call).find((info) => info && HTTP_DECORATORS.has(info.name));
        if (!http) continue;
        const methodPolicy = policy(memberDecorators);
        const location = `${relative(sourceRoot, file)}#${member.name.getText(source)}`;
        if (methodPolicy === 'multiple' || classPolicy === 'multiple') throw new Error(`Mais de uma política de acesso em ${location}`);
        const httpCodeInfo = memberDecorators.map(call).find((info) => info?.name === 'HttpCode');
        const httpCodeArg = httpCodeInfo?.args[0];
        routes.push({
          method: http.name.toLowerCase(),
          path: toOpenApi(`${base}/${literal(http.args[0])}`),
          access: methodPolicy ?? classPolicy,
          httpCode: httpCodeArg && ts.isNumericLiteral(httpCodeArg) ? Number(httpCodeArg.text) : null,
          location,
        });
      }
    });
  }
  return routes;
}
