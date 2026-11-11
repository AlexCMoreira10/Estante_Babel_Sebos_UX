import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  criarBlobPng,
  MIME_PNG,
  MIME_XLSX,
  salvarArquivo,
  validarPlanilhaXlsx
} from '../dist/js/arquivo-download.js';
import { criarTransferenciaNativa } from '../scripts/arquivo-download-native-entry.js';

const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x00
]);

test('validates XLSX signature, MIME type and original bytes', async () => {
  const bytes = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x01, 0x02]);
  const arquivo = await validarPlanilhaXlsx(new Blob([bytes]));

  assert.equal(arquivo.type, MIME_XLSX);
  assert.deepEqual(new Uint8Array(await arquivo.arrayBuffer()), bytes);
});

test('rejects empty or non-XLSX responses', async () => {
  await assert.rejects(validarPlanilhaXlsx(new Blob([])), /XLSX válida|vazio/);
  await assert.rejects(validarPlanilhaXlsx(new Blob(['resposta HTML'])), /XLSX válida/);
});

test('preserves the reference XLSX bytes', async () => {
  const bytes = await readFile(new URL('../modelo-anuncios-livros.xlsx', import.meta.url));
  const arquivo = await validarPlanilhaXlsx(new Blob([bytes]));

  assert.equal(arquivo.type, MIME_XLSX);
  assert.deepEqual(new Uint8Array(await arquivo.arrayBuffer()), new Uint8Array(bytes));
});

test('converts the backend PNG data URI without changing its bytes', async () => {
  const dataUri = `data:image/png;base64,${btoa(String.fromCharCode(...PNG_BYTES))}`;
  const arquivo = await criarBlobPng(dataUri);

  assert.equal(arquivo.type, MIME_PNG);
  assert.deepEqual(new Uint8Array(await arquivo.arrayBuffer()), PNG_BYTES);
});

test('rejects invalid QR data URIs and invalid PNG payloads', async () => {
  await assert.rejects(criarBlobPng('https://example.test/qr.png'), /formato PNG válido/);
  await assert.rejects(
    criarBlobPng(`data:image/png;base64,${btoa('not a PNG')}`),
    /não contém um PNG válido/
  );
});

test('uses a browser download URL and delays revocation', async () => {
  const chamadas = [];
  const links = [];
  const arquivo = new Blob(['workbook'], { type: MIME_XLSX });
  const documento = {
    body: { append: (link) => links.push(link) },
    createElement: () => ({
      style: {},
      setAttribute: (...args) => chamadas.push(['attribute', ...args]),
      click: () => chamadas.push(['click']),
      remove: () => chamadas.push(['remove'])
    })
  };
  const urlApi = {
    createObjectURL: (blob) => {
      assert.equal(blob, arquivo);
      return 'blob:workbook';
    },
    revokeObjectURL: (url) => chamadas.push(['revoke', url])
  };
  let revogar;
  let atraso;

  const resultado = await salvarArquivo(arquivo, 'modelo.xlsx', MIME_XLSX, {
    platform: 'web',
    documentRef: documento,
    urlApi,
    setTimeoutFn: (callback, delay) => {
      revogar = callback;
      atraso = delay;
    }
  });

  assert.equal(resultado.canal, 'web');
  assert.equal(links[0].href, 'blob:workbook');
  assert.equal(links[0].download, 'modelo.xlsx');
  assert.deepEqual(chamadas.map(([nome]) => nome), ['attribute', 'click', 'remove']);
  assert.equal(atraso, 60_000);
  revogar();
  assert.deepEqual(chamadas.at(-1), ['revoke', 'blob:workbook']);
});

test('reports when browser download APIs are unavailable', async () => {
  await assert.rejects(
    salvarArquivo(new Blob(['data']), 'arquivo.xlsx', MIME_XLSX, {
      platform: 'web',
      documentRef: {},
      urlApi: {}
    }),
    /navegador não oferece suporte/
  );
});

test('writes native files to cache and shares the returned URI', async () => {
  const arquivosGravados = [];
  const compartilhamentos = [];
  const filesystemApi = {
    Filesystem: {
      writeFile: async (opcoes) => {
        arquivosGravados.push(opcoes);
        return { uri: 'file:///cache/qrcode-livro-42.png' };
      }
    },
    Directory: { Cache: 'CACHE' }
  };
  const shareApi = {
    Share: {
      canShare: async () => ({ value: true }),
      share: async (opcoes) => compartilhamentos.push(opcoes)
    }
  };

  const resultado = await salvarArquivo(
    new Blob([PNG_BYTES]),
    'qrcode-livro-42.png',
    MIME_PNG,
    {
      platform: 'android',
      nativeAdapter: {
        salvarArquivoNativo: criarTransferenciaNativa({
          filesystem: filesystemApi.Filesystem,
          directory: filesystemApi.Directory,
          share: shareApi.Share
        })
      }
    }
  );

  assert.equal(resultado.canal, 'nativo');
  assert.equal(arquivosGravados[0].directory, 'CACHE');
  assert.equal('encoding' in arquivosGravados[0], false);
  assert.equal(arquivosGravados[0].path, 'qrcode-livro-42.png');
  assert.deepEqual(
    Uint8Array.from(atob(arquivosGravados[0].data), (caractere) => caractere.charCodeAt(0)),
    PNG_BYTES
  );
  assert.deepEqual(compartilhamentos[0].files, ['file:///cache/qrcode-livro-42.png']);
});

test('reports when native file sharing is unavailable', async () => {
  let gravouArquivo = false;
  const filesystemApi = {
    Filesystem: { writeFile: async () => { gravouArquivo = true; return { uri: 'file://cache/file' }; } },
    Directory: { Cache: 'CACHE' }
  };
  const shareApi = { Share: { canShare: async () => ({ value: false }) } };

  await assert.rejects(
    salvarArquivo(new Blob(['data']), 'arquivo.xlsx', MIME_XLSX, {
      platform: 'android',
      nativeAdapter: {
        salvarArquivoNativo: criarTransferenciaNativa({
          filesystem: filesystemApi.Filesystem,
          directory: filesystemApi.Directory,
          share: shareApi.Share
        })
      }
    }),
    /aplicativo compatível/
  );
  assert.equal(gravouArquivo, false);
});

test('surfaces native share cancellation or target errors', async () => {
  const filesystemApi = {
    Filesystem: {
      writeFile: async () => ({ uri: 'file:///cache/arquivo.xlsx' })
    },
    Directory: { Cache: 'CACHE' }
  };
  const shareApi = {
    Share: {
      canShare: async () => ({ value: true }),
      share: async () => {
        throw new Error('Share dismissed');
      }
    }
  };

  await assert.rejects(
    salvarArquivo(new Blob(['data']), 'arquivo.xlsx', MIME_XLSX, {
      platform: 'android',
      nativeAdapter: {
        salvarArquivoNativo: criarTransferenciaNativa({
          filesystem: filesystemApi.Filesystem,
          directory: filesystemApi.Directory,
          share: shareApi.Share
        })
      }
    }),
    /cancelada ou não há aplicativo compatível/
  );
});

test('served native bundle contains no bare Filesystem or Share imports', async () => {
  const bundle = await readFile(
    new URL('../dist/js/arquivo-download.native.js', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(bundle, /from\s*["']@capacitor\/(filesystem|share)["']/);
  assert.match(bundle, /from\s*["']@capacitor\/core["']/);
});
