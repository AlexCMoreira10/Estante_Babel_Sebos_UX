import assert from 'node:assert/strict';
import test from 'node:test';
import {
  API_TEST_BASE,
  AUTH_EMULATOR_URL,
  FIREBASE_TEST_PROJECT_ID,
  TEST_MODE_KEY,
  criarConfiguracaoFirebaseTeste,
  obterUrlsApi,
  resolverAmbiente,
  validarTokenProjetoTeste,
  verificarServicosLocaisTeste
} from '../js/environment.js';

const criarStorage = () => {
  const dados = new Map();
  return {
    getItem: chave => dados.get(chave) ?? null,
    setItem: (chave, valor) => dados.set(chave, valor),
    removeItem: chave => dados.delete(chave)
  };
};

const criarToken = payload => {
  const base64 = btoa(JSON.stringify(payload))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `header.${base64}.signature`;
};

test('test mode is disabled by default and explicitly enables only local demo endpoints', () => {
  const storage = criarStorage();
  const production = resolverAmbiente({
    hostname: 'localhost',
    search: '',
    storage
  });
  assert.deepEqual(production, { testMode: false });

  const testMode = resolverAmbiente({
    hostname: '127.0.0.1',
    search: '?environment=test',
    storage
  });
  assert.equal(testMode.testMode, true);
  assert.equal(testMode.projectId, 'demo-estante-babel');
  assert.equal(testMode.apiBase, 'http://127.0.0.1:3000/api');
  assert.equal(testMode.authEmulatorUrl, 'http://127.0.0.1:9099');
  assert.notEqual(testMode.sessionTokenKey, 'seboToken');
  assert.notEqual(testMode.sessionProfileKey, 'sebo');
  assert.equal(storage.getItem(TEST_MODE_KEY), 'test');
  assert.equal(criarConfiguracaoFirebaseTeste().projectId, FIREBASE_TEST_PROJECT_ID);
  assert.deepEqual(obterUrlsApi({
    testMode: true,
    apiBase: testMode.apiBase,
    apiLocal: 'http://localhost:3000/api',
    apiRemote: 'https://production.example/api'
  }), [API_TEST_BASE]);
  assert.deepEqual(obterUrlsApi({
    testMode: false,
    apiBase: 'http://localhost:3000/api',
    apiLocal: 'http://localhost:3000/api',
    apiRemote: 'https://production.example/api'
  }), ['http://localhost:3000/api', 'https://production.example/api']);
});

test('test mode refuses non-local origins and can be explicitly disabled', () => {
  assert.throws(
    () => resolverAmbiente({
      hostname: 'app.example.com',
      search: '?environment=test',
      storage: criarStorage()
    }),
    /só pode ser ativado em localhost/
  );

  const storage = criarStorage();
  storage.setItem(TEST_MODE_KEY, 'test');
  const production = resolverAmbiente({
    hostname: 'localhost',
    search: '?environment=production',
    storage
  });
  assert.equal(production.testMode, false);
  assert.equal(storage.getItem(TEST_MODE_KEY), null);
});

test('test mode accepts only ID tokens whose audience and issuer use the demo project', () => {
  validarTokenProjetoTeste(criarToken({
    aud: FIREBASE_TEST_PROJECT_ID,
    iss: `https://securetoken.google.com/${FIREBASE_TEST_PROJECT_ID}`
  }));
  assert.throws(
    () => validarTokenProjetoTeste(criarToken({
      aud: 'babel-5dcbd',
      iss: 'https://securetoken.google.com/babel-5dcbd'
    })),
    /projeto não é demo-estante-babel/
  );
  assert.throws(
    () => validarTokenProjetoTeste('not-a-jwt'),
    /utilize somente uma sessão do Auth Emulator/
  );
});

test('local service checks use only loopback endpoints and reject unavailable services', async () => {
  const requestedUrls = [];
  await verificarServicosLocaisTeste({
    fetchImpl: async (url, options) => {
      requestedUrls.push({ url, options });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          environment: 'test',
          projectId: FIREBASE_TEST_PROJECT_ID,
          firestoreEmulator: true,
          authEmulator: true
        })
      };
    }
  });
  assert.deepEqual(
    requestedUrls.map(request => request.url).sort(),
    [
      `${API_TEST_BASE}/__test/health`,
      `http://127.0.0.1:9099/emulator/v1/projects/${FIREBASE_TEST_PROJECT_ID}/config`
    ].sort()
  );
  assert.ok(requestedUrls.every(({ options }) =>
    options.credentials === 'omit' && options.redirect === 'error'
  ));
  assert.equal(API_TEST_BASE.startsWith('http://127.0.0.1:'), true);
  assert.equal(AUTH_EMULATOR_URL.startsWith('http://127.0.0.1:'), true);

  await assert.rejects(
    verificarServicosLocaisTeste({
      fetchImpl: async () => { throw new TypeError('connection refused'); }
    }),
    /local indisponível/
  );

  await assert.rejects(
    verificarServicosLocaisTeste({
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          environment: 'production',
          projectId: 'babel-5dcbd',
          firestoreEmulator: false,
          authEmulator: false
        })
      })
    }),
    /não confirmou o projeto demo/
  );
});
