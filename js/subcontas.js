import {
  auth,
  onAuthStateChanged,
  requisicaoSebo
} from './firebase.js';

const pageFeedback = document.getElementById('pageFeedback');
const management = document.getElementById('staffManagement');
const form = document.getElementById('staffForm');
const formFeedback = document.getElementById('formFeedback');
const list = document.getElementById('staffList');
const typeSelect = document.getElementById('staffType');
const cpfInput = document.getElementById('staffCpf');
const phoneInput = document.getElementById('staffPhone');
const passwordDialog = document.getElementById('passwordDialog');
const passwordResetForm = document.getElementById('resetPasswordForm');
const resetPasswordInput = document.getElementById('resetPassword');
const passwordFeedback = document.getElementById('passwordFeedback');
const permissionTemplates = {
  cadastrador_acervo: [
    'acervo.consultar',
    'acervo.cadastrar',
    'acervo.editar',
    'acervo.excluir',
    'mensagens.gerenciar'
  ],
  operador_negociacoes: [
    'negociacoes.consultar',
    'negociacoes.gerenciar',
    'mensagens.gerenciar'
  ],
  gestor_financeiro: [
    'financeiro.consultar',
    'financeiro.relatorios',
    'mensagens.gerenciar'
  ],
  personalizado: []
};
const permissionLabels = {
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
const typeLabels = {
  cadastrador_acervo: 'Cadastrador de acervo',
  operador_negociacoes: 'Operador de vendas e trocas',
  gestor_financeiro: 'Gestor financeiro',
  personalizado: 'Personalizado'
};

let usuarioAutenticado = null;
let seboId = null;
let subcontas = [];
let editingId = null;
let resettingId = null;

const mostrarFeedback = (elemento, mensagem, tipo = '') => {
  elemento.textContent = mensagem;
  elemento.classList.toggle('erro', tipo === 'erro');
  elemento.classList.toggle('sucesso', tipo === 'sucesso');
};

const tokenAtual = () => usuarioAutenticado.getIdToken();

const aguardarUsuario = () => new Promise((resolve) => {
  const cancelar = onAuthStateChanged(auth, (usuario) => {
    cancelar();
    resolve(usuario);
  });
});

const definirPermissoes = (permissoes) => {
  form.querySelectorAll('[data-permission]').forEach((checkbox) => {
    checkbox.checked = permissoes.includes(checkbox.dataset.permission);
  });
};

const obterPermissoes = () => Array.from(form.querySelectorAll('[data-permission]:checked'))
  .map((checkbox) => checkbox.dataset.permission);

const aplicarModelo = () => {
  definirPermissoes(permissionTemplates[typeSelect.value]);
};

const mascararCpf = (valor) => valor.replace(/\D/g, '')
  .slice(0, 11)
  .replace(/(\d{3})(\d)/, '$1.$2')
  .replace(/(\d{3})(\d)/, '$1.$2')
  .replace(/(\d{3})(\d{1,2})$/, '$1-$2');

const permissaoChips = (permissoes) => {
  const lista = document.createElement('ul');
  lista.className = 'staff-permission-chips';
  for (const permissao of permissoes || []) {
    const item = document.createElement('li');
    item.textContent = permissionLabels[permissao] || permissao;
    lista.append(item);
  }
  if (!lista.childElementCount) {
    const item = document.createElement('li');
    item.textContent = 'Sem permissões atribuídas';
    lista.append(item);
  }
  return lista;
};

const criarBotao = (texto, classe, acao) => {
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = classe;
  botao.textContent = texto;
  botao.addEventListener('click', acao);
  return botao;
};

const renderizarSubconta = (subconta) => {
  const card = document.createElement('article');
  card.className = `staff-card${subconta.ativo ? '' : ' staff-card-inactive'}`;

  const cabecalho = document.createElement('div');
  cabecalho.className = 'staff-card-header';
  const identidade = document.createElement('div');
  const nome = document.createElement('h3');
  nome.textContent = subconta.nome;
  const tipo = document.createElement('p');
  tipo.className = 'staff-role';
  tipo.textContent = typeLabels[subconta.tipo] || subconta.tipo;
  identidade.append(nome, tipo);

  const estado = document.createElement('span');
  estado.className = `staff-status${subconta.ativo ? ' active' : ''}`;
  estado.textContent = subconta.ativo ? 'Ativa' : 'Acesso revogado';
  cabecalho.append(identidade, estado);

  const detalhes = document.createElement('dl');
  detalhes.className = 'staff-details';
  for (const [label, value] of [
    ['Login', subconta.login],
    ['Telefone', subconta.telefone || 'Não informado'],
    ['CPF', subconta.cpf]
  ]) {
    const item = document.createElement('div');
    const termo = document.createElement('dt');
    termo.textContent = label;
    const descricao = document.createElement('dd');
    descricao.textContent = value || '—';
    item.append(termo, descricao);
    detalhes.append(item);
  }

  const permissoes = permissaoChips(subconta.permissoes);
  const acoes = document.createElement('div');
  acoes.className = 'staff-card-actions';
  acoes.append(
    criarBotao('Editar acesso', 'button button-secondary button-small', () => iniciarEdicao(subconta)),
    criarBotao('Redefinir senha', 'button button-secondary button-small', () => abrirRedefinicao(subconta))
  );
  if (subconta.ativo) {
    acoes.append(criarBotao('Revogar acesso', 'button button-danger button-small', () => revogar(subconta)));
  } else {
    acoes.append(criarBotao('Reativar acesso', 'button button-primary button-small', () => reativar(subconta)));
  }

  card.append(cabecalho, detalhes, permissoes, acoes);
  return card;
};

const carregarSubcontas = async () => {
  mostrarFeedback(pageFeedback, 'Carregando colaboradores...');
  try {
    const resultado = await requisicaoSebo('sebos/subcontas', {
      token: await tokenAtual()
    });
    subcontas = resultado.subcontas;
    list.replaceChildren(...subcontas.map(renderizarSubconta));
    mostrarFeedback(
      pageFeedback,
      subcontas.length ? `${subcontas.length} colaborador(es) cadastrado(s).` : 'Ainda não há colaboradores cadastrados.',
      'sucesso'
    );
  } catch (erro) {
    console.error('Erro ao carregar colaboradores:', erro);
    mostrarFeedback(pageFeedback, erro.message || 'Não foi possível carregar os colaboradores.', 'erro');
  }
};

const finalizarEdicao = () => {
  editingId = null;
  form.reset();
  typeSelect.value = 'cadastrador_acervo';
  aplicarModelo();
  document.getElementById('cpfGroup').classList.remove('hidden');
  document.getElementById('passwordGroup').classList.remove('hidden');
  cpfInput.required = true;
  document.getElementById('temporaryPassword').required = true;
  document.getElementById('formTitle').textContent = 'Adicionar colaborador';
  document.getElementById('submitStaff').textContent = 'Criar subconta';
  document.getElementById('cancelEdit').classList.add('hidden');
  mostrarFeedback(formFeedback, '');
};

const iniciarEdicao = (subconta) => {
  editingId = subconta.id;
  document.getElementById('staffName').value = subconta.nome;
  document.getElementById('staffLogin').value = subconta.login;
  phoneInput.value = subconta.telefone || '';
  typeSelect.value = subconta.tipo;
  definirPermissoes(subconta.permissoes);
  document.getElementById('cpfGroup').classList.add('hidden');
  document.getElementById('passwordGroup').classList.add('hidden');
  cpfInput.required = false;
  document.getElementById('temporaryPassword').required = false;
  document.getElementById('formTitle').textContent = `Editar ${subconta.nome}`;
  document.getElementById('submitStaff').textContent = 'Salvar alterações';
  document.getElementById('cancelEdit').classList.remove('hidden');
  mostrarFeedback(formFeedback, 'Edite os dados e permissões. O CPF não pode ser alterado.');
  document.getElementById('staffName').focus();
};

const abrirRedefinicao = (subconta) => {
  resettingId = subconta.id;
  passwordResetForm.reset();
  mostrarFeedback(passwordFeedback, '');
  passwordDialog.showModal();
  resetPasswordInput.focus();
};

const revogar = async (subconta) => {
  if (!window.confirm(`Revogar o acesso de ${subconta.nome}? A conta continuará na lista e poderá ser reativada.`)) return;
  await alterarAtivo(subconta, false);
};

const reativar = async (subconta) => {
  if (!window.confirm(`Reativar o acesso de ${subconta.nome}?`)) return;
  await alterarAtivo(subconta, true);
};

const alterarAtivo = async (subconta, ativo) => {
  try {
    await requisicaoSebo(`sebos/subcontas/${encodeURIComponent(subconta.id)}`, {
      method: 'PATCH',
      token: await tokenAtual(),
      body: JSON.stringify({ ativo })
    });
    await carregarSubcontas();
  } catch (erro) {
    console.error('Erro ao alterar o acesso do colaborador:', erro);
    mostrarFeedback(pageFeedback, erro.message || 'Não foi possível alterar o acesso.', 'erro');
  }
};

typeSelect.addEventListener('change', aplicarModelo);
cpfInput.addEventListener('input', () => {
  cpfInput.value = mascararCpf(cpfInput.value);
});
document.getElementById('cancelEdit').addEventListener('click', finalizarEdicao);
document.getElementById('reloadStaff').addEventListener('click', carregarSubcontas);

form.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (!form.reportValidity()) return;

  const dados = {
    nome: document.getElementById('staffName').value.trim(),
    login: document.getElementById('staffLogin').value.trim(),
    telefone: phoneInput.value.trim(),
    tipo: typeSelect.value,
    permissoes: obterPermissoes()
  };
  if (!editingId) {
    dados.cpf = cpfInput.value;
    dados.senhaTemporaria = document.getElementById('temporaryPassword').value;
  }

  const botao = document.getElementById('submitStaff');
  botao.disabled = true;
  mostrarFeedback(formFeedback, editingId ? 'Salvando alterações...' : 'Criando a subconta...');
  try {
    const caminho = editingId
      ? `sebos/subcontas/${encodeURIComponent(editingId)}`
      : 'sebos/subcontas';
    await requisicaoSebo(caminho, {
      method: editingId ? 'PATCH' : 'POST',
      token: await tokenAtual(),
      body: JSON.stringify(dados)
    });
    mostrarFeedback(
      formFeedback,
      editingId ? 'A subconta foi atualizada.' : 'Subconta criada. Entregue a senha temporária ao colaborador por um canal seguro.',
      'sucesso'
    );
    finalizarEdicao();
    await carregarSubcontas();
  } catch (erro) {
    console.error('Erro ao salvar subconta:', erro);
    mostrarFeedback(formFeedback, erro.message || 'Não foi possível salvar a subconta.', 'erro');
  } finally {
    botao.disabled = false;
  }
});

passwordResetForm.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (!passwordResetForm.reportValidity()) return;

  const botao = document.getElementById('confirmResetPassword');
  botao.disabled = true;
  mostrarFeedback(passwordFeedback, 'Atualizando senha...');
  try {
    await requisicaoSebo(`sebos/subcontas/${encodeURIComponent(resettingId)}/senha`, {
      method: 'PATCH',
      token: await tokenAtual(),
      body: JSON.stringify({ senhaTemporaria: resetPasswordInput.value })
    });
    passwordDialog.close();
    await carregarSubcontas();
  } catch (erro) {
    console.error('Erro ao redefinir senha:', erro);
    mostrarFeedback(passwordFeedback, erro.message || 'Não foi possível redefinir a senha.', 'erro');
  } finally {
    botao.disabled = false;
  }
});

document.getElementById('closePasswordDialog').addEventListener('click', () => passwordDialog.close());

const inicializar = async () => {
  usuarioAutenticado = await aguardarUsuario();
  if (!usuarioAutenticado) {
    window.location.replace('./login.html');
    return;
  }

  try {
    const sessao = await requisicaoSebo('sebos/sessao', {
      token: await tokenAtual()
    });
    if (sessao.tipoConta !== 'gestor') {
      mostrarFeedback(pageFeedback, 'Somente o gestor do sebo pode criar e gerenciar subcontas.', 'erro');
      window.setTimeout(() => window.location.replace('../index.html'), 1200);
      return;
    }

    seboId = sessao.seboId;
    if (!seboId) throw new Error('A conta autenticada não está vinculada a um sebo.');
    management.classList.remove('hidden');
    aplicarModelo();
    await carregarSubcontas();
  } catch (erro) {
    console.error('Erro ao validar o acesso de gestão:', erro);
    mostrarFeedback(pageFeedback, erro.message || 'Não foi possível validar seu acesso.', 'erro');
  }
};

inicializar();
