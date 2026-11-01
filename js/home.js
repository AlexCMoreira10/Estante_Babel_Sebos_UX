import {
  auth,
  limparSessaoSebo,
  onAuthStateChanged,
  requisicaoSebo,
  salvarSessaoSebo,
  signOut
} from './firebase.js';
import { adicionarAcaoAnunciosEmMassa } from './anuncio-em-massa.js';
import { adicionarSecaoLivrosPerfil } from './livros-perfil.js';

const painel = document.getElementById('partnerPanel');
const navegacao = document.querySelector('.header-actions');
const conteudoInicial = document.querySelector('.home-copy');
const paginaInicial = document.querySelector('.home-main');
const nomesPermissoes = {
  'acervo.consultar': 'Consultar acervo',
  'acervo.cadastrar': 'Cadastrar livros',
  'acervo.editar': 'Editar livros',
  'acervo.excluir': 'Excluir livros',
  'negociacoes.consultar': 'Consultar vendas e trocas',
  'negociacoes.gerenciar': 'Gerenciar vendas e trocas',
  'financeiro.consultar': 'Consultar financeiro',
  'financeiro.relatorios': 'Acessar relatórios financeiros',
  'mensagens.gerenciar': 'Consultar e responder mensagens'
};

const criar = (tag, classe = '', texto = '') => {
  const elemento = document.createElement(tag);
  if (classe) elemento.className = classe;
  if (texto) elemento.textContent = texto;
  return elemento;
};

const aguardarUsuario = () => new Promise((resolve) => {
  const cancelar = onAuthStateChanged(auth, (usuario) => {
    cancelar();
    resolve(usuario);
  });
});

const sair = async (botao) => {
  botao.disabled = true;
  try {
    await signOut(auth);
    limparSessaoSebo();
    window.location.reload();
  } catch (erro) {
    console.error('Erro ao encerrar sessão:', erro);
    botao.disabled = false;
  }
};

const criarFormularioSenhaInicial = (usuario, perfil) => {
  const formulario = criar('form', 'first-password-form');
  const texto = criar('p', 'section-help', 'Por segurança, defina uma senha pessoal antes de acessar a plataforma.');
  const novaSenha = document.createElement('input');
  novaSenha.type = 'password';
  novaSenha.minLength = 10;
  novaSenha.autocomplete = 'new-password';
  novaSenha.placeholder = 'Nova senha (mínimo de 10 caracteres)';
  novaSenha.required = true;
  const confirmar = document.createElement('input');
  confirmar.type = 'password';
  confirmar.minLength = 10;
  confirmar.autocomplete = 'new-password';
  confirmar.placeholder = 'Confirme a nova senha';
  confirmar.required = true;
  const feedback = criar('p', 'feedback');
  feedback.setAttribute('role', 'status');
  const salvar = criar('button', 'button button-primary button-full', 'Salvar nova senha');
  salvar.type = 'submit';
  formulario.append(texto, novaSenha, confirmar, feedback, salvar);

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (!formulario.reportValidity()) return;
    if (novaSenha.value !== confirmar.value) {
      feedback.textContent = 'As senhas não coincidem.';
      feedback.classList.add('erro');
      return;
    }

    salvar.disabled = true;
    feedback.textContent = 'Atualizando sua senha...';
    try {
      const resultado = await requisicaoSebo('sebos/subcontas/minha-senha', {
        method: 'PATCH',
        token: await usuario.getIdToken(),
        body: JSON.stringify({ novaSenha: novaSenha.value })
      });
      perfil.precisaTrocarSenha = resultado.subconta.precisaTrocarSenha;
      await salvarSessaoSebo(usuario, perfil);
      renderizarSessao(usuario, perfil);
    } catch (erro) {
      console.error('Erro ao trocar a senha temporária:', erro);
      feedback.textContent = erro.message || 'Não foi possível trocar sua senha.';
      feedback.classList.add('erro');
      salvar.disabled = false;
    }
  });
  return formulario;
};

const renderizarSessao = (usuario, perfil) => {
  const botaoSair = criar('button', 'text-link', 'Sair');
  botaoSair.type = 'button';
  botaoSair.addEventListener('click', () => sair(botaoSair));
  navegacao.replaceChildren(botaoSair);

  conteudoInicial.hidden = true;
  paginaInicial.classList.add('signed-in-home');
  painel.replaceChildren();
  painel.classList.add('signed-in-panel');
  painel.append(
    criar('p', 'eyebrow', 'Perfil do sebo'),
    criar('h2', '', `Olá, ${perfil.nome || perfil.login || 'parceiro'}!`),
    criar('p', '', perfil.tipoConta === 'subconta'
      ? `Colaborador de ${perfil.seboNome || 'seu sebo'}`
      : (perfil.email || 'Sua conta de sebo está ativa.'))
  );

  if (perfil.precisaTrocarSenha) {
    painel.append(
      criar('p', 'feedback erro', 'Sua senha temporária precisa ser trocada antes de continuar.'),
      criarFormularioSenhaInicial(usuario, perfil)
    );
    return;
  }

  if (perfil.tipoConta === 'subconta') {
    painel.append(criar('h3', 'access-heading', 'Acessos habilitados'));
    const lista = criar('ul', 'permission-list');
    for (const permissao of perfil.permissoes || []) {
      lista.append(criar('li', '', nomesPermissoes[permissao] || permissao));
    }
    if (!lista.childElementCount) lista.append(criar('li', '', 'Nenhuma operação concedida pelo gestor.'));
    painel.append(lista);
    return;
  }

  const gerenciar = criar('a', 'button button-primary button-full', 'Gerenciar colaboradores');
  gerenciar.href = './html/subcontas.html';
  const cadastrarLivro = criar('a', 'button button-secondary button-full', 'Cadastrar livros');
  cadastrarLivro.href = './html/cadastrar-livro.html';
  painel.append(cadastrarLivro);
  adicionarSecaoLivrosPerfil(painel, () => usuario);
  adicionarAcaoAnunciosEmMassa(painel, () => usuario);
  painel.append(gerenciar);
};

const iniciarSessao = async () => {
  const usuario = await aguardarUsuario();
  if (!usuario) {
    limparSessaoSebo();
    return;
  }

  try {
    const perfil = await requisicaoSebo('sebos/sessao', {
      token: await usuario.getIdToken()
    });
    await salvarSessaoSebo(usuario, perfil);
    renderizarSessao(usuario, perfil);
  } catch (erro) {
    console.error('Não foi possível validar a sessão do sebo:', erro);
    limparSessaoSebo();
    if (erro.status === 401 || erro.status === 403) {
      await signOut(auth);
      painel.replaceChildren(criar('p', 'feedback erro', erro.message));
      return;
    }
    painel.replaceChildren(
      criar('p', 'feedback erro', 'Não foi possível validar a sessão. Verifique sua conexão e tente novamente.')
    );
  }
};

iniciarSessao();

if (new URLSearchParams(window.location.search).get('cadastro') === 'concluido') {
  const aviso = criar('p', 'feedback sucesso', 'Cadastro concluído. Sua conta de parceiro já está pronta.');
  painel.prepend(aviso);
  window.history.replaceState({}, '', window.location.pathname);
}
