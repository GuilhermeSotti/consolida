/**
 * Desenvolvimento local da API ou do worker, sem dependências além do TypeScript do projeto:
 *   1. limpa dist/ e compila uma vez com tsconfig.build.json;
 *   2. mantém `tsc --watch` recompilando para dist/;
 *   3. executa o processo com `node --watch`, que reinicia quando os arquivos compilados mudam.
 * Variáveis de ambiente: o próprio processo carrega `.env` fora de produção (src/config/env-file.ts).
 *
 * Uso: node scripts/dev.mjs api|worker
 */
import { spawn, spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import process from 'node:process';

const entries = { api: 'dist/main.js', worker: 'dist/worker.js' };
const target = process.argv[2];
if (!Object.hasOwn(entries, target)) {
  console.error('Uso: node scripts/dev.mjs api|worker');
  process.exit(2);
}

const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
const project = ['-p', 'tsconfig.build.json'];

rmSync('dist', { recursive: true, force: true });
const initial = spawnSync(process.execPath, [tsc, ...project], { stdio: 'inherit' });
if (initial.status !== 0) process.exit(initial.status ?? 1);

const compiler = spawn(process.execPath, [tsc, ...project, '--watch', '--preserveWatchOutput'], { stdio: 'inherit' });
const app = spawn(process.execPath, ['--watch', '--enable-source-maps', entries[target]], { stdio: 'inherit' });

function stop(signal) {
  compiler.kill(signal);
  app.kill(signal);
}
process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
app.on('exit', (code) => {
  compiler.kill();
  process.exit(code ?? 0);
});
