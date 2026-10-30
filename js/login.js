import {
  auth,
  entrarComGoogle,
  limparSessaoSebo,
  mensagemErroFirebase,
  requisicaoSebo,
  salvarSessaoSebo,
  sendPasswordResetEmail,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signOut
} from './firebase.js';

const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('loginEmail');
const passwordInput = document.getElementById('loginPassword');
const loginButton = document.getElementById('loginSubmit');
const googleButton = document.getElementById('googleLogin');
const resetButton = document.getElementById('forgotPassword');
const feedback = document.getElementById('loginFeedback');

const mostrarFeedback = (mensagem, tipo = '') => {
  feedback.textContent = mensagem;
  feedback.classList.toggle('erro', tipo === 'erro');
  feedback.classList.toggle('sucesso', tipo === 'sucesso');
};

const atualizarBotoes = (desabilitado) => {
  loginButton.disabled = desabilitado;
  googleButton.disabled = desabilitado;
  resetButton.disabled = desabilitado;
};

const entrarNoApp = async (usuario) => {
  const token = await usuario.getIdToken();
  const perfil = await requisicaoSebo('sebos/me', { token });
  await salvarSessaoSebo(usuario, perfil);
  window.location.replace('../index.html');
};

const entrarComoColaborador = async (identificador, senha) => {
  const { customToken, subconta } = await requisicaoSebo('sebos/subcontas/login', {
    method: 'POST',
    body: JSON.stringify({ identificador, senha })
  });
  const credencial = await signInWithCustomToken(auth, customToken);
  const perfil = {
    ...subconta,
    tipoConta: 'subconta',
    email: subconta.login
  };
  await salvarSessaoSebo(credencial.user, perfil);
  window.location.replace('../index.html');
};

const tratarErroLogin = async (erro) => {
  console.error('Erro ao entrar na área do sebo:', erro);
  if (erro.status === 404) {
    limparSessaoSebo();
    await signOut(auth);
    mostrarFeedback('Esta conta ainda não tem cadastro de sebo. Solicite seu cadastro para continuar.', 'erro');
    return;
  }
  if (erro.status === 401) {
    limparSessaoSebo();
    mostrarFeedback('Sua sessão expirou. Entre novamente.', 'erro');
    return;
  }
  mostrarFeedback(mensagemErroFirebase(erro), 'erro');
};

loginForm.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (!loginForm.reportValidity()) return;

  atualizarBotoes(true);
  mostrarFeedback('Entrando na sua conta...');
  try {
    const identificador = emailInput.value.trim();
    if (identificador.includes('@')) {
      const resultado = await signInWithEmailAndPassword(
        auth,
        identificador,
        passwordInput.value
      );
      await entrarNoApp(resultado.user);
    } else {
      await entrarComoColaborador(identificador, passwordInput.value);
    }
  } catch (erro) {
    await tratarErroLogin(erro);
    atualizarBotoes(false);
  }
});

googleButton.addEventListener('click', async () => {
  atualizarBotoes(true);
  mostrarFeedback('Conectando à sua conta Google...');
  try {
    const usuario = await entrarComGoogle();
    await entrarNoApp(usuario);
  } catch (erro) {
    await tratarErroLogin(erro);
    atualizarBotoes(false);
  }
});

resetButton.addEventListener('click', async () => {
  const email = emailInput.value.trim();
  if (!email.includes('@')) {
    mostrarFeedback('Para redefinir a senha de colaborador, solicite uma nova senha temporária ao gestor do sebo.', 'erro');
    return;
  }

  atualizarBotoes(true);
  mostrarFeedback('Enviando o link de redefinição...');
  try {
    await sendPasswordResetEmail(auth, email);
    mostrarFeedback('Se houver uma conta com este e-mail, você receberá as instruções de redefinição.', 'sucesso');
  } catch (erro) {
    console.error('Erro ao solicitar redefinição de senha:', erro);
    mostrarFeedback(mensagemErroFirebase(erro), 'erro');
  } finally {
    atualizarBotoes(false);
  }
});

if (new URLSearchParams(window.location.search).has('cadastro')) {
  mostrarFeedback('Cadastro concluído. Entre com sua conta para continuar.', 'sucesso');
}
