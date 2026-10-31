import {
  auth,
  limparSessaoSebo,
  onAuthStateChanged,
  requisicaoSebo,
  salvarSessaoSebo,
  signOut
} from './firebase.js';

const logoutButton = document.getElementById('logoutButton');
const greeting = document.getElementById('employeeGreeting');
const seboName = document.getElementById('employeeSebo');
const panel = document.getElementById('employeePanel');
const feedback = document.getElementById('employeeFeedback');

const nomesPermissoes = {
  'acervo.consultar': 'Consultar acervo',
  'acervo.cadastrar': 'Cadastrar livros',
  'acervo.editar': 'Editar livros',
  'acervo.excluir': 'Excluir livros',
  'negociacoes.consultar': 'Consultar vendas e trocas',
  'negociacoes.gerenciar': 'Gerenciar vendas e trocas',
  'financeiro.consultar': 'Consultar financeiro',
  'financeiro.relatorios': 'Acessar relatórios financeiros'
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

const encerrarSessao = async () => {
  logoutButton.disabled = true;
  try {
    await signOut(auth);
    limparSessaoSebo();
    window.location.replace('./login.html?tipo=funcionario');
  } catch (erro) {
    console.error('Erro ao encerrar sessão do funcionário:', erro);
    logoutButton.disabled = false;
    feedback.textContent = 'Não foi possível encerrar a sessão. Tente novamente.';
    feedback.classList.add('erro');
  }
};

const mostrarTrocaSenha = (usuario, perfil) => {
  const formulario = criar('form', 'first-password-form');
  const instrucoes = criar(
    'p',
    'section-help',
    'Por segurança, defina uma senha pessoal antes de continuar.'
  );
  const novaSenha = document.createElement('input');
  novaSenha.type = 'password';
  novaSenha.minLength = 10;
  novaSenha.maxLength = 128;
  novaSenha.autocomplete = 'new-password';
  novaSenha.placeholder = 'Nova senha (mínimo de 10 caracteres)';
  novaSenha.required = true;

  const confirmarSenha = document.createElement('input');
  confirmarSenha.type = 'password';
  confirmarSenha.minLength = 10;
  confirmarSenha.maxLength = 128;
  confirmarSenha.autocomplete = 'new-password';
  confirmarSenha.placeholder = 'Confirme a nova senha';
  confirmarSenha.required = true;

  const retorno = criar('p', 'feedback');
  retorno.setAttribute('role', 'status');
  const salvar = criar('button', 'button button-primary button-full', 'Salvar nova senha');
  salvar.type = 'submit';
  formulario.append(instrucoes, novaSenha, confirmarSenha, retorno, salvar);
  panel.append(formulario);

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (!formulario.reportValidity()) return;
    if (novaSenha.value !== confirmarSenha.value) {
      retorno.textContent = 'As senhas não coincidem.';
      retorno.classList.add('erro');
      return;
    }

    salvar.disabled = true;
    retorno.textContent = 'Atualizando sua senha...';
    try {
      const resultado = await requisicaoSebo('sebos/subcontas/minha-senha', {
        method: 'PATCH',
        token: await usuario.getIdToken(),
        body: JSON.stringify({ novaSenha: novaSenha.value })
      });
      perfil.precisaTrocarSenha = resultado.subconta.precisaTrocarSenha;
      await salvarSessaoSebo(usuario, perfil);
      renderizarArea(perfil);
    } catch (erro) {
      console.error('Erro ao trocar a senha temporária:', erro);
      retorno.textContent = erro.message || 'Não foi possível trocar sua senha.';
      retorno.classList.add('erro');
      salvar.disabled = false;
    }
  });
};

const renderizarArea = (perfil, usuario) => {
  greeting.textContent = `Olá, ${perfil.nome || perfil.login || 'funcionário'}!`;
  seboName.textContent = `Equipe de ${perfil.seboNome || 'seu sebo'}`;
  panel.replaceChildren();

  if (perfil.precisaTrocarSenha) {
    panel.append(
      criar('p', 'feedback erro', 'Sua senha temporária precisa ser trocada antes de continuar.')
    );
    mostrarTrocaSenha(usuario, perfil);
    return;
  }

  panel.append(
    criar('p', 'eyebrow', 'Acesso confirmado'),
    criar('h2', '', 'Área do funcionário'),
    criar('p', '', 'A página de trabalho da equipe está em construção. Seu acesso já está ativo.')
  );
  if ((perfil.permissoes || []).includes('acervo.cadastrar')) {
    const cadastrarLivro = criar('a', 'button button-primary button-full', 'Cadastrar livros');
    cadastrarLivro.href = './cadastrar-livro.html';
    panel.append(cadastrarLivro);
  }
  panel.append(criar('h3', 'access-heading', 'Acessos habilitados'));
  const lista = criar('ul', 'permission-list');
  for (const permissao of perfil.permissoes || []) {
    lista.append(criar('li', '', nomesPermissoes[permissao] || permissao));
  }
  if (!lista.childElementCount) {
    lista.append(criar('li', '', 'Nenhuma operação concedida pelo gestor.'));
  }
  panel.append(lista);
};

logoutButton.addEventListener('click', encerrarSessao);

const iniciar = async () => {
  const usuario = await aguardarUsuario();
  if (!usuario) {
    limparSessaoSebo();
    window.location.replace('./login.html?tipo=funcionario');
    return;
  }

  logoutButton.hidden = false;
  try {
    const perfil = await requisicaoSebo('sebos/sessao', {
      token: await usuario.getIdToken()
    });
    if (perfil.tipoConta !== 'subconta') {
      window.location.replace('../index.html');
      return;
    }
    await salvarSessaoSebo(usuario, perfil);
    renderizarArea(perfil, usuario);
  } catch (erro) {
    console.error('Não foi possível validar a sessão do funcionário:', erro);
    if (erro.status === 401 || erro.status === 403) {
      limparSessaoSebo();
      await signOut(auth);
      window.location.replace('./login.html?tipo=funcionario');
      return;
    }
    const aviso = criar(
      'p',
      'feedback erro',
      'Não foi possível validar sua sessão. Verifique a conexão e tente sair e entrar novamente.'
    );
    aviso.setAttribute('role', 'status');
    panel.replaceChildren(aviso);
  }
};

iniciar();
