/**
 * Contract guard: contracts/openapi.yaml is the single source of truth of the HTTP API.
 * Fails when routes, success status codes or required permissions drift between the contract
 * and the controllers, when a route has no explicit access policy, or when the document is
 * internally inconsistent (broken $ref, OpenAPI 3.0 keywords, duplicated operationIds).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { load } from 'js-yaml';
import { collectRoutes, type DeclaredRoute } from '../support/route-inventory';

type JsonObject = Record<string, unknown>;
const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
interface Operation {
  operationId?: string;
  security?: unknown[];
  responses: JsonObject;
  'x-required-permissions'?: string[];
}
interface OpenApiDocument {
  openapi: string;
  paths: Record<string, Partial<Record<(typeof METHODS)[number], Operation>>>;
}

// Tests run from the repository root (npm scripts / jest rootDir).
const ROOT = process.cwd();
const document = load(readFileSync(join(ROOT, 'contracts', 'openapi.yaml'), 'utf8')) as OpenApiDocument;
const routes = collectRoutes(join(ROOT, 'src'));

function operations(): Array<{ key: string; operation: Operation }> {
  return Object.entries(document.paths).flatMap(([path, item]) =>
    METHODS.flatMap((method) => {
      const operation = item[method];
      return operation ? [{ key: `${method.toUpperCase()} ${path}`, operation }] : [];
    }),
  );
}

function key(route: DeclaredRoute): string {
  return `${route.method.toUpperCase()} ${route.path}`;
}

function walk(node: unknown, visit: (value: JsonObject, path: string) => void, path = '#'): void {
  if (Array.isArray(node)) node.forEach((item, index) => walk(item, visit, `${path}/${index}`));
  else if (node && typeof node === 'object') {
    visit(node as JsonObject, path);
    for (const [name, value] of Object.entries(node)) walk(value, visit, `${path}/${name}`);
  }
}

describe('OpenAPI document', () => {
  it('is OpenAPI 3.1 with resolvable references and no 3.0-only keywords', () => {
    expect(document.openapi).toMatch(/^3\.1\./);
    const problems: string[] = [];
    walk(document, (value, path) => {
      const ref = value.$ref;
      if (typeof ref === 'string') {
        let target: unknown = document;
        for (const part of ref.replace(/^#\//, '').split('/')) target = (target as JsonObject | undefined)?.[part];
        if (!ref.startsWith('#/') || target === undefined) problems.push(`${path}: $ref inválida ${ref}`);
      }
      if ('nullable' in value && !path.includes('/properties/nullable')) problems.push(`${path}: "nullable" não existe em 3.1`);
    });
    expect(problems).toEqual([]);
  });

  it('has unique operationIds and a 4xx/401 response for every protected operation', () => {
    const ids = operations().map(({ operation }) => operation.operationId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const { key: label, operation } of operations()) {
      const isPublic = Array.isArray(operation.security) && operation.security.length === 0;
      if (!isPublic) expect([label, Object.keys(operation.responses).includes('401')]).toEqual([label, true]);
    }
  });
});

describe('contract ↔ controllers', () => {
  it('declares exactly the implemented routes', () => {
    const implemented = routes.map(key).sort();
    const documented = operations().map(({ key: label }) => label).sort();
    expect(implemented.filter((route) => !documented.includes(route))).toEqual([]);
    expect(documented.filter((route) => !implemented.includes(route))).toEqual([]);
  });

  it('gives every route an explicit access policy (deny-by-default otherwise)', () => {
    expect(routes.filter((route) => route.access === null).map((route) => route.location)).toEqual([]);
  });

  it('documents the permissions and public access enforced by the code', () => {
    const operationsByKey = new Map(operations().map(({ key: label, operation }) => [label, operation]));
    for (const route of routes) {
      const operation = operationsByKey.get(key(route));
      if (!operation || !route.access) continue;
      const expected = route.access.kind === 'permissions' ? [...route.access.permissions].sort() : [];
      expect([key(route), [...(operation['x-required-permissions'] ?? ['<ausente>'])].sort()]).toEqual([key(route), expected]);
      const documentedPublic = Array.isArray(operation.security) && operation.security.length === 0;
      expect([key(route), documentedPublic]).toEqual([key(route), route.access.kind === 'public']);
    }
  });

  it('documents the success status code produced by each handler', () => {
    const operationsByKey = new Map(operations().map(({ key: label, operation }) => [label, operation]));
    for (const route of routes) {
      const operation = operationsByKey.get(key(route));
      if (!operation) continue;
      // Handlers that set the status dynamically (202 created / 200 replayed) document both.
      const expected = route.httpCode ?? (route.method === 'post' ? 201 : 200);
      const documented = Object.keys(operation.responses).filter((status) => status.startsWith('2'));
      expect([key(route), documented.includes(String(expected)) || (documented.includes('202') && documented.includes('200'))]).toEqual([key(route), true]);
    }
  });
});
