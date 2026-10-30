import { cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const raiz = process.cwd();
const destino = resolve(raiz, 'dist');

await mkdir(destino, { recursive: true });
await cp(resolve(raiz, 'index.html'), resolve(destino, 'index.html'));
await cp(resolve(raiz, 'css'), resolve(destino, 'css'), { recursive: true });
await cp(resolve(raiz, 'html'), resolve(destino, 'html'), { recursive: true });
await cp(resolve(raiz, 'js'), resolve(destino, 'js'), { recursive: true });

console.log('Frontend preparado em dist/.');
