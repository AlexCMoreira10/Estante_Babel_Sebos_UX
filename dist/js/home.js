import {
  auth,
  limparSessaoSebo,
  onAuthStateChanged,
  requisicaoSebo,
  salvarSessaoSebo,
  signOut
} from './firebase.js';
import { adicionarAcaoAnunciosEmMassa } from './anuncio-em-massa.js';
import { aguardarEstadoAutenticacao } from './home-auth-state.js';

const painel = document.getElementById('partnerPanel');
const navegacao = document.querySelector('.header-actions');
const conteudoInicial = document.querySelector('.home-copy');
const paginaInicial = document.querySelector('.home-main');
const estadoAutenticacao = document.getElementById('homeAuthStatus');
const cadastroConcluido = new URLSearchParams(window.location.search).get('cadastro') === 'concluido';
const TEMPO_LIMITE_AUTENTICACAO_MS = 15000;
const filhosPublicosIniciais = (elemento) => [...elemento.childNodes].map((filho) => filho.cloneNode(true));
const navegacaoPublicaInicial = filhosPublicosIniciais(navegacao);
const painelPublicoInicial = filhosPublicosIniciais(painel);
let tentativaSessaoAtual = 0;
let controllerValidacaoAtual = null;
let avisoCadastroMostrado = false;
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

const mostrarAvisoCadastroConcluido = () => {
  if (!cadastroConcluido || avisoCadastroMostrado) return;
  painel.prepend(criar('p', 'feedback sucesso', 'Cadastro concluído. Sua conta de parceiro já está pronta.'));
  window.history.replaceState({}, '', window.location.pathname);
  avisoCadastroMostrado = true;
};

const definirEstadoAutenticacao = (estado) => {
  document.body.dataset.homeAuthState = estado;
};

const mostrarCarregamento = () => {
  estadoAutenticacao.replaceChildren();
  const indicador = criar('span', 'home-auth-spinner');
  indicador.setAttribute('aria-hidden', 'true');
  estadoAutenticacao.append(indicador, criar('span', '', 'Verificando sua sessão...'));
  definirEstadoAutenticacao('loading');
};

const mostrarErroInicial = (mensagem, tentarNovamente) => {
  const aviso = criar('p', 'feedback erro', mensagem);
  const tentar = criar('button', 'button button-primary', 'Tentar novamente');
  tentar.type = 'button';
  tentar.addEventListener('click', async () => {
    tentar.disabled = true;
    await tentarNovamente();
  });
  estadoAutenticacao.replaceChildren(aviso, tentar);
  definirEstadoAutenticacao('error');
};

const aguardarUsuario = () => aguardarEstadoAutenticacao(
  (resolver, rejeitar) => onAuthStateChanged(auth, resolver, rejeitar),
  TEMPO_LIMITE_AUTENTICACAO_MS
);

const carregarPerfilSebo = async (usuario, controller) => {
  const timeout = window.setTimeout(
    () => controller.abort(),
    TEMPO_LIMITE_AUTENTICACAO_MS
  );
  try {
    return await requisicaoSebo('sebos/sessao', {
      token: await usuario.getIdToken(),
      signal: controller.signal
    });
  } catch (erro) {
    if (controller.signal.aborted) {
      throw new Error('A validação do perfil demorou demais. Verifique a conexão e tente novamente.');
    }
    throw erro;
  } finally {
    window.clearTimeout(timeout);
  }
};

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
  definirEstadoAutenticacao('authenticated');

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
  gerenciar.classList.add('profile-manage-button');
  gerenciar.href = './html/subcontas.html';
  const editarSebo = criar('a', 'button button-secondary button-full', 'Editar dados do sebo');
  editarSebo.href = './html/editar-sebo.html';
  const cadastrarLivro = criar('a', 'button button-secondary button-full', 'Cadastrar livros');
  cadastrarLivro.href = './html/cadastrar-livro.html';
  const livrosCadastrados = criar('a', 'button button-secondary button-full', 'Livros cadastrados');
  livrosCadastrados.href = './html/livros-cadastrados.html';
  const acoes = criar('div', 'profile-actions');
  acoes.append(editarSebo, cadastrarLivro, livrosCadastrados);
  adicionarAcaoAnunciosEmMassa(acoes, () => usuario);
  acoes.append(gerenciar);
  painel.append(acoes);
};

const exibirPaginaPublica = (mensagem) => {
  navegacao.replaceChildren(...navegacaoPublicaInicial.map((filho) => filho.cloneNode(true)));
  painel.replaceChildren(...painelPublicoInicial.map((filho) => filho.cloneNode(true)));
  painel.classList.remove('signed-in-panel');
  conteudoInicial.hidden = false;
  paginaInicial.classList.remove('signed-in-home');
  definirEstadoAutenticacao('unauthenticated');
  if (mensagem) painel.prepend(criar('p', 'feedback erro', mensagem));
  mostrarAvisoCadastroConcluido();
};

const iniciarSessao = async (usuarioConhecido = null) => {
  const tentativa = ++tentativaSessaoAtual;
  controllerValidacaoAtual?.abort();
  const controller = new AbortController();
  controllerValidacaoAtual = controller;
  mostrarCarregamento();
  let usuario = usuarioConhecido;
  if (!usuario) {
    try {
      usuario = await aguardarUsuario();
    } catch (erro) {
      if (tentativa !== tentativaSessaoAtual) return;
      console.error('Não foi possível confirmar a autenticação:', erro);
      mostrarErroInicial(
        erro.message || 'Não foi possível confirmar sua sessão. Verifique a conexão e tente novamente.',
        () => iniciarSessao()
      );
      return;
    }
  }
  if (tentativa !== tentativaSessaoAtual) return;
  if (!usuario) {
    limparSessaoSebo();
    exibirPaginaPublica();
    return;
  }

  try {
    const perfil = await carregarPerfilSebo(usuario, controller);
    if (tentativa !== tentativaSessaoAtual) return;
    await salvarSessaoSebo(usuario, perfil);
    if (tentativa !== tentativaSessaoAtual) return;
    renderizarSessao(usuario, perfil);
    mostrarAvisoCadastroConcluido();
  } catch (erro) {
    if (tentativa !== tentativaSessaoAtual) return;
    console.error('Não foi possível validar a sessão do sebo:', erro);
    limparSessaoSebo();
    if (erro.status === 401 || erro.status === 403) {
      try {
        await signOut(auth);
        if (tentativa !== tentativaSessaoAtual) return;
        exibirPaginaPublica(erro.message);
      } catch (erroSaida) {
        console.error('Não foi possível encerrar a sessão inválida:', erroSaida);
        mostrarErroInicial(
          'A sessão não pôde ser validada nem encerrada. Tente novamente.',
          () => iniciarSessao(usuario)
        );
      }
      return;
    }
    mostrarErroInicial(
      'Não foi possível validar sua sessão. Verifique a conexão e tente novamente.',
      () => iniciarSessao(usuario)
    );
  }
};

window.addEventListener('pagehide', () => {
  tentativaSessaoAtual += 1;
  controllerValidacaoAtual?.abort();
  controllerValidacaoAtual = null;
  mostrarCarregamento();
});

window.addEventListener('pageshow', (evento) => {
  if (evento.persisted) iniciarSessao();
});

iniciarSessao();
