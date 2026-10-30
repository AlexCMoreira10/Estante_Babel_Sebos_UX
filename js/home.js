import { auth, limparSessaoSebo, signOut } from './firebase.js';

const painel = document.getElementById('partnerPanel');
const sessao = localStorage.getItem('sebo');

if (sessao) {
  try {
    const sebo = JSON.parse(sessao);
    const titulo = document.createElement('h2');
    titulo.textContent = `Olá, ${sebo.nome || 'parceiro'}!`;
    const descricao = document.createElement('p');
    descricao.textContent = sebo.email || 'Seu cadastro de sebo está ativo.';
    const acao = document.createElement('button');
    acao.type = 'button';
    acao.className = 'button button-secondary button-small';
    acao.textContent = 'Sair da conta';
    acao.addEventListener('click', async () => {
      acao.disabled = true;
      try {
        await signOut(auth);
        limparSessaoSebo();
        window.location.reload();
      } catch (erro) {
        console.error('Erro ao encerrar sessão:', erro);
        acao.disabled = false;
      }
    });
    painel.replaceChildren();
    painel.append(titulo, descricao, acao);
    painel.classList.add('signed-in-panel');
  } catch (erro) {
    console.error('Não foi possível ler a sessão do sebo:', erro);
    limparSessaoSebo();
  }
}

if (new URLSearchParams(window.location.search).get('cadastro') === 'concluido') {
  const aviso = document.createElement('p');
  aviso.className = 'feedback sucesso';
  aviso.textContent = 'Cadastro concluído. Sua conta de parceiro já está pronta.';
  painel.prepend(aviso);
  window.history.replaceState({}, '', window.location.pathname);
}
