export const FIREBASE_TEST_PROJECT_ID = 'demo-estante-babel';
export const API_TEST_BASE = 'http://127.0.0.1:3000/api';
export const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099';
export const TEST_MODE_KEY = 'estante-babel-environment';

const HOSTS_LOCAIS = new Set(['localhost', '127.0.0.1']);

export const criarConfiguracaoFirebaseTeste = () => Object.freeze({
  apiKey: 'demo-estante-babel-local-only',
  authDomain: 'demo-estante-babel.local',
  projectId: FIREBASE_TEST_PROJECT_ID,
  storageBucket: 'demo-estante-babel.local',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:demo-estante-babel'
});

export const obterUrlsApi = ({
  testMode,
  apiBase,
  apiLocal,
  apiRemote
}) => testMode
  ? [API_TEST_BASE]
  : (apiBase === apiLocal ? [apiLocal, apiRemote] : [apiRemote]);

export const resolverAmbiente = ({ hostname, search, storage }) => {
  const parametros = new URLSearchParams(search);
  const modoSolicitado = parametros.get('environment');
  if (modoSolicitado === 'production') {
    storage?.removeItem(TEST_MODE_KEY);
  }

  const solicitado = modoSolicitado === 'test';
  let armazenado = false;
  try {
    armazenado = storage?.getItem(TEST_MODE_KEY) === 'test';
  } catch (error) {
    if (solicitado) {
      throw new Error('Não foi possível ativar com segurança o modo de teste local.', {
        cause: error
      });
    }
  }

  const testMode = solicitado || armazenado;
  if (!testMode) return Object.freeze({ testMode: false });

  if (!HOSTS_LOCAIS.has(hostname)) {
    throw new Error('O modo de teste só pode ser ativado em localhost ou 127.0.0.1.');
  }

  if (solicitado) {
    try {
      storage?.setItem(TEST_MODE_KEY, 'test');
    } catch (error) {
      throw new Error('Não foi possível ativar com segurança o modo de teste local.', {
        cause: error
      });
    }
  }

  return Object.freeze({
    testMode: true,
    projectId: FIREBASE_TEST_PROJECT_ID,
    apiBase: API_TEST_BASE,
    authEmulatorUrl: AUTH_EMULATOR_URL,
    authAppName: 'estante-babel-auth-emulator',
    sessionTokenKey: 'seboTokenTest',
    sessionProfileKey: 'seboTest'
  });
};

export const validarTokenProjetoTeste = token => {
  if (typeof token !== 'string') {
    throw new Error('O modo de teste exige um token do Auth Emulator.');
  }
  const partes = token.split('.');
  if (partes.length !== 3) {
    throw new Error('Token recusado: utilize somente uma sessão do Auth Emulator.');
  }

  try {
    const segmento = partes[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(segmento.padEnd(Math.ceil(segmento.length / 4) * 4, '=')));
    if (payload.aud !== FIREBASE_TEST_PROJECT_ID ||
        payload.iss !== `https://securetoken.google.com/${FIREBASE_TEST_PROJECT_ID}`) {
      throw new Error('Token recusado: o projeto não é demo-estante-babel.');
    }
  } catch (error) {
    if (error.message.startsWith('Token recusado:')) throw error;
    throw new Error('Token recusado: não foi possível validar o projeto da sessão de teste.');
  }
};

export const verificarServicosLocaisTeste = async ({
  fetchImpl = fetch,
  apiBase = API_TEST_BASE,
  authEmulatorUrl = AUTH_EMULATOR_URL
} = {}) => {
  const apiHealthUrl = `${apiBase}/__test/health`;
  const authHealthUrl =
    `${authEmulatorUrl}/emulator/v1/projects/${FIREBASE_TEST_PROJECT_ID}/config`;
  const verificarEndpoint = async (url, nome) => {
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error'
      });
    } catch (error) {
      throw new Error(`${nome} local indisponível. A operação foi interrompida.`, {
        cause: error
      });
    }
    if (!response.ok) {
      throw new Error(`${nome} local respondeu com HTTP ${response.status}.`);
    }
    return response;
  };

  const [apiResponse] = await Promise.all([
    verificarEndpoint(apiHealthUrl, 'API de teste'),
    verificarEndpoint(authHealthUrl, 'Firebase Auth Emulator')
  ]);
  let health;
  try {
    health = await apiResponse.json();
  } catch (error) {
    throw new Error('A API local não confirmou o modo de teste isolado.', { cause: error });
  }
  if (health?.environment !== 'test' ||
      health?.projectId !== FIREBASE_TEST_PROJECT_ID ||
      health?.firestoreEmulator !== true ||
      health?.authEmulator !== true) {
    throw new Error(
      'A API local não confirmou o projeto demo e os Emulators. Nenhuma operação foi enviada.'
    );
  }
};
