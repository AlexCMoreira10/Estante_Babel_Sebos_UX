import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  createUserWithEmailAndPassword as createUserWithEmailAndPasswordSdk,
  browserSessionPersistence,
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail as sendPasswordResetEmailSdk,
  setPersistence,
  signInWithCredential,
  signInWithCustomToken as signInWithCustomTokenSdk,
  signInWithEmailAndPassword as signInWithEmailAndPasswordSdk,
  signInWithPopup,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { Capacitor } from '@capacitor/core';
import {
  AUTH_EMULATOR_URL,
  FIREBASE_TEST_PROJECT_ID,
  API_TEST_BASE,
  criarConfiguracaoFirebaseTeste,
  obterUrlsApi,
  resolverAmbiente,
  validarTokenProjetoTeste,
  verificarServicosLocaisTeste
} from './environment.js';

const ambiente = resolverAmbiente({
  hostname: window.location.hostname,
  search: window.location.search,
  storage: window.sessionStorage
});
const sessaoStorage = ambiente.testMode ? window.sessionStorage : window.localStorage;
const chaveTokenSessao = ambiente.testMode ? ambiente.sessionTokenKey : 'seboToken';
const chavePerfilSessao = ambiente.testMode ? ambiente.sessionProfileKey : 'sebo';
const API_LOCAL = 'http://localhost:3000/api';
const isLocalWeb = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const API_REMOTE = ambiente.testMode ? null : 'https://babel-be-lovat.vercel.app/api';
const firebaseConfig = ambiente.testMode
  ? criarConfiguracaoFirebaseTeste()
  : {
      apiKey: 'AIzaSyA1GzaVBqE6BQ8QALyv6oD2uqFlUuk0S54',
      authDomain: 'babel-5dcbd.firebaseapp.com',
      projectId: 'babel-5dcbd',
      storageBucket: 'babel-5dcbd.firebasestorage.app',
      messagingSenderId: '537037438052',
      appId: '1:537037438052:web:7ae0839725eaf0bbb73371'
    };
const app = initializeApp(
  firebaseConfig,
  ambiente.testMode ? ambiente.authAppName : undefined
);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
if (ambiente.testMode) {
  connectAuthEmulator(auth, AUTH_EMULATOR_URL, { disableWarnings: true });
  await setPersistence(auth, browserSessionPersistence);
}

export const TEST_MODE = ambiente.testMode;
export const API_BASE = ambiente.testMode
  ? API_TEST_BASE
  : (isLocalWeb ? API_LOCAL : API_REMOTE);
let testServicesReady = false;

const garantirServicosTesteDisponiveis = async () => {
  if (!ambiente.testMode || testServicesReady) return;
  await verificarServicosLocaisTeste();
  testServicesReady = true;
};

const validarCabecalhoTeste = headers => {
  if (!ambiente.testMode) return;
  const autorizacao = headers.get('Authorization');
  if (!autorizacao) return;
  if (!autorizacao.startsWith('Bearer ')) {
    throw new Error('O modo de teste aceita somente Bearer tokens do Auth Emulator.');
  }
  validarTokenProjetoTeste(autorizacao.slice(7));
};

export {
  onAuthStateChanged,
  signOut
};

export const createUserWithEmailAndPassword = async (...args) => {
  await garantirServicosTesteDisponiveis();
  return createUserWithEmailAndPasswordSdk(...args);
};

export const sendPasswordResetEmail = async (...args) => {
  await garantirServicosTesteDisponiveis();
  return sendPasswordResetEmailSdk(...args);
};

export const signInWithCustomToken = async (...args) => {
  await garantirServicosTesteDisponiveis();
  return signInWithCustomTokenSdk(...args);
};

export const signInWithEmailAndPassword = async (...args) => {
  await garantirServicosTesteDisponiveis();
  return signInWithEmailAndPasswordSdk(...args);
};

export const entrarComGoogle = async () => {
  if (ambiente.testMode) {
    throw new Error('O modo de teste local aceita somente contas fictícias do Auth Emulator.');
  }
  if (Capacitor.getPlatform() === 'web') {
    return (await signInWithPopup(auth, googleProvider)).user;
  }

  const { FirebaseAuthentication } = await import(
    'https://unpkg.com/@capacitor-firebase/authentication@8.5.2/dist/esm/index.js'
  );
  const resultadoNativo = await FirebaseAuthentication.signInWithGoogle();
  const idTokenGoogle = resultadoNativo.credential?.idToken;
  if (!idTokenGoogle) {
    throw new Error('O Google não retornou um ID token para autenticação.');
  }

  const credencial = GoogleAuthProvider.credential(idTokenGoogle);
  return (await signInWithCredential(auth, credencial)).user;
};

export const requisicaoSebo = async (caminho, { token, ...opcoes } = {}) => {
  await garantirServicosTesteDisponiveis();
  const headers = new Headers(opcoes.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  validarCabecalhoTeste(headers);
  if (opcoes.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const urls = obterUrlsApi({
    testMode: ambiente.testMode,
    apiBase: API_BASE,
    apiLocal: API_LOCAL,
    apiRemote: API_REMOTE
  });
  let resposta;
  for (let indice = 0; indice < urls.length; indice += 1) {
    try {
      resposta = await fetch(`${urls[indice]}/${caminho}`, {
        ...opcoes,
        ...(ambiente.testMode ? { credentials: 'omit', redirect: 'error' } : {}),
        headers
      });
      break;
    } catch (erro) {
      if (indice === urls.length - 1) throw erro;
      console.warn('A API local não respondeu; tentando a API publicada.', erro);
    }
  }

  const texto = await resposta.text();
  let corpo = {};
  if (texto) {
    try {
      corpo = JSON.parse(texto);
    } catch {
      corpo = { erro: texto };
    }
  }

  if (!resposta.ok) {
    const erro = new Error(corpo.erro || corpo.message || `A API respondeu com HTTP ${resposta.status}.`);
    erro.status = resposta.status;
    throw erro;
  }

  return corpo;
};

export const requisicaoSeboArquivo = async (caminho, { token, ...opcoes } = {}) => {
  await garantirServicosTesteDisponiveis();
  const headers = new Headers(opcoes.headers || {});
  if (token) headers.set('Authorization', 'Bearer ' + token);

  validarCabecalhoTeste(headers);
  const urls = obterUrlsApi({
    testMode: ambiente.testMode,
    apiBase: API_BASE,
    apiLocal: API_LOCAL,
    apiRemote: API_REMOTE
  });
  let resposta;
  for (let indice = 0; indice < urls.length; indice += 1) {
    try {
      resposta = await fetch(`${urls[indice]}/${caminho}`, {
        ...opcoes,
        ...(ambiente.testMode ? { credentials: 'omit', redirect: 'error' } : {}),
        headers
      });
      break;
    } catch (erro) {
      if (indice === urls.length - 1) throw erro;
      console.warn('A API local não respondeu; tentando a API publicada.', erro);
    }
  }

  if (!resposta.ok) {
    const texto = await resposta.text();
    let corpo = {};
    if (texto) {
      try {
        corpo = JSON.parse(texto);
      } catch {
        corpo = { erro: texto };
      }
    }
    const erro = new Error(corpo.erro || corpo.message || `A API respondeu com HTTP ${resposta.status}.`);
    erro.status = resposta.status;
    throw erro;
  }

  return {
    blob: await resposta.blob(),
    headers: resposta.headers
  };
};

export const salvarSessaoSebo = async (usuario, perfil) => {
  const token = await usuario.getIdToken();
  if (ambiente.testMode) validarTokenProjetoTeste(token);
  sessaoStorage.setItem(chaveTokenSessao, token);
  sessaoStorage.setItem(chavePerfilSessao, JSON.stringify({
    uid: usuario.uid,
    nome: perfil.nome || usuario.displayName || usuario.email,
    email: perfil.email || perfil.login || usuario.email || '',
    foto: usuario.photoURL || '',
    tipoConta: perfil.tipoConta || 'gestor',
    seboId: perfil.seboId || usuario.uid,
    seboNome: perfil.seboNome || perfil.nome || '',
    login: perfil.login || '',
    telefone: perfil.telefone || '',
    cpf: perfil.cpf || '',
    tipo: perfil.tipo || '',
    permissoes: perfil.permissoes || [],
    precisaTrocarSenha: Boolean(perfil.precisaTrocarSenha)
  }));
};

export const limparSessaoSebo = () => {
  sessaoStorage.removeItem(chaveTokenSessao);
  sessaoStorage.removeItem(chavePerfilSessao);
};

export const mensagemErroFirebase = (erro) => {
  if (!erro.code && erro.name === 'TypeError') {
    return 'Não foi possível conectar ao serviço. Verifique sua internet e tente novamente.';
  }

  const mensagens = {
    'auth/email-already-in-use': 'Este e-mail já possui uma conta. Entre ou escolha outro método de acesso.',
    'auth/invalid-email': 'Informe um endereço de e-mail válido.',
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/user-not-found': 'Não encontramos uma conta com este e-mail.',
    'auth/wrong-password': 'E-mail ou senha incorretos.',
    'auth/weak-password': 'A senha precisa ter pelo menos 8 caracteres.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde um pouco e tente novamente.',
    'auth/popup-closed-by-user': 'A janela do Google foi fechada antes de concluir o acesso.',
    'auth/network-request-failed': 'Sem conexão com o serviço de autenticação. Verifique sua internet.'
  };
  return mensagens[erro.code] || erro.message || 'Não foi possível concluir a autenticação.';
};
