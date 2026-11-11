import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const buildNativeDownload = () => build({
  entryPoints: [resolve(raiz, 'scripts/arquivo-download-native-entry.js')],
  outfile: resolve(raiz, 'dist/js/arquivo-download.native.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  external: ['@capacitor/core'],
  minify: true,
  legalComments: 'none'
});

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildNativeDownload();
}
