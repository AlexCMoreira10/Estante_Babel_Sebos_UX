import {
  auth,
  limparSessaoSebo,
  onAuthStateChanged,
  requisicaoSebo,
  signOut
} from './firebase.js';

const logoutButton = document.getElementById('logoutButton');
const feedback = document.getElementById('messagesFeedback');
const workspace = document.getElementById('messagesWorkspace');
const conversationList = document.getElementById('conversationList');
const reloadConversations = document.getElementById('reloadConversations');
const chatPlaceholder = document.getElementById('chatPlaceholder');
const chatContent = document.getElementById('chatContent');
const chatContact = document.getElementById('chatContact');
const chatFeedback = document.getElementById('chatFeedback');
const messageList = document.getElementById('messageList');
const replyForm = document.getElementById('replyForm');
const replyText = document.getElementById('replyText');
const sendReply = document.getElementById('sendReply');

let usuario = null;
let perfil = null;
let conversas = [];
let conversaSelecionada = null;

const criar = (tag, classe = '', texto = '') => {
  const elemento = document.createElement(tag);
  if (classe) elemento.className = classe;
  if (texto) elemento.textContent = texto;
  return elemento;
};

const mostrarFeedback = (elemento, mensagem, tipo = '') => {
  elemento.textContent = mensagem;
  elemento.classList.toggle('erro', tipo === 'erro');
  elemento.classList.toggle('sucesso', tipo === 'sucesso');
};

const aguardarUsuario = () => new Promise((resolve) => {
  const cancelar = onAuthStateChanged(auth, (usuarioAtual) => {
    cancelar();
    resolve(usuarioAtual);
  });
});

const formatarData = (valor) => {
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(data);
};

const tokenAtual = async () => ({ token: await usuario.getIdToken() });

const selecionarConversa = async (conversa) => {
  conversaSelecionada = conversa;
  chatPlaceholder.hidden = true;
  chatContent.hidden = false;
  chatContact.textContent = conversa.outro_participante?.nome || 'Leitor';
  chatFeedback.textContent = '';
  chatFeedback.classList.remove('erro');
  renderizarConversas();
  await carregarMensagens();
};

const renderizarConversas = () => {
  conversationList.replaceChildren();
  if (!conversas.length) {
    conversationList.append(criar('p', 'conversation-empty', 'Nenhuma conversa recebida ainda.'));
    return;
  }

  for (const conversa of conversas) {
    const participante = conversa.outro_participante || {};
    const botao = criar('button', 'conversation-item');
    botao.type = 'button';
    botao.classList.toggle('selected', conversaSelecionada?.outro_participante?.id === participante.id);
    botao.setAttribute('aria-current', botao.classList.contains('selected') ? 'true' : 'false');
    const informacoes = criar('span', 'conversation-info');
    informacoes.append(
      criar('strong', '', participante.nome || 'Leitor'),
      criar('span', '', conversa.ultima_mensagem?.conteudo || 'Sem conteúdo')
    );
    const detalhes = criar('span', 'conversation-meta');
    const data = formatarData(conversa.ultima_mensagem?.data_envio);
    if (data) detalhes.append(criar('time', '', data));
    if (conversa.mensagens_nao_lidas > 0) {
      detalhes.append(criar('span', 'unread-count', String(conversa.mensagens_nao_lidas)));
    }
    botao.append(informacoes, detalhes);
    botao.addEventListener('click', () => selecionarConversa(conversa));
    conversationList.append(botao);
  }
};

const carregarConversas = async () => {
  reloadConversations.disabled = true;
  try {
    conversas = await requisicaoSebo('mensagens/conversas', await tokenAtual());
    if (!Array.isArray(conversas)) {
      throw new Error('A API retornou uma lista de conversas inválida.');
    }
    const idSelecionado = conversaSelecionada?.outro_participante?.id;
    conversaSelecionada = conversas.find(
      (conversa) => conversa.outro_participante?.id === idSelecionado
    ) || null;
    if (!conversaSelecionada) {
      chatContent.hidden = true;
      chatPlaceholder.hidden = false;
      messageList.replaceChildren();
    }
    renderizarConversas();
    if (conversaSelecionada) {
      chatContact.textContent = conversaSelecionada.outro_participante?.nome || 'Leitor';
    }
    mostrarFeedback(
      feedback,
      conversas.length ? `${conversas.length} conversa(s) encontrada(s).` : 'Sua caixa de entrada está vazia.'
    );
  } catch (erro) {
    console.error('Erro ao carregar as conversas:', erro);
    mostrarFeedback(feedback, erro.message || 'Não foi possível carregar as conversas.', 'erro');
  } finally {
    reloadConversations.disabled = false;
  }
};

const renderizarMensagem = (mensagem) => {
  const recebida = mensagem.id_destinatario === perfil.seboId;
  const cartao = criar('article', `chat-message ${recebida ? 'received' : 'sent'}`);
  const cabecalho = criar('div', 'chat-message-header');
  cabecalho.append(
    criar('strong', '', recebida ? (conversaSelecionada.outro_participante?.nome || 'Leitor') : 'Você')
  );
  const data = formatarData(mensagem.data_envio);
  if (data) cabecalho.append(criar('time', '', data));
  cartao.append(cabecalho, criar('p', 'chat-message-content', mensagem.conteudo || ''));

  if (recebida) {
    const acoes = criar('div', 'chat-message-actions');
    if (!mensagem.lida) {
      const marcarLida = criar('button', 'button button-secondary button-small', 'Marcar como lida');
      marcarLida.type = 'button';
      marcarLida.addEventListener('click', () => marcarMensagemLida(mensagem, marcarLida));
      acoes.append(marcarLida);
    } else {
      acoes.append(criar('span', 'read-status', 'Lida'));
    }
    const apagar = criar('button', 'button button-danger button-small', 'Apagar');
    apagar.type = 'button';
    apagar.addEventListener('click', () => apagarMensagem(mensagem, apagar));
    acoes.append(apagar);
    cartao.append(acoes);
  }

  return cartao;
};

const carregarMensagens = async () => {
  const idOutroUsuario = conversaSelecionada?.outro_participante?.id;
  if (!idOutroUsuario) return;

  chatFeedback.textContent = 'Carregando mensagens...';
  chatFeedback.classList.remove('erro');
  messageList.replaceChildren();
  try {
    const caminho = `mensagens/${encodeURIComponent(idOutroUsuario)}?page=1&limit=100`;
    const primeiraPagina = await requisicaoSebo(caminho, await tokenAtual());
    let resultado = primeiraPagina;
    const ultimaPagina = primeiraPagina.paginacao?.total_paginas;
    if (Number.isInteger(ultimaPagina) && ultimaPagina > 1) {
      resultado = await requisicaoSebo(
        `mensagens/${encodeURIComponent(idOutroUsuario)}?page=${ultimaPagina}&limit=100`,
        await tokenAtual()
      );
    }
    if (conversaSelecionada?.outro_participante?.id !== idOutroUsuario) return;
    if (!Array.isArray(resultado.mensagens)) {
      throw new Error('A API retornou mensagens em um formato inválido.');
    }
    messageList.append(...resultado.mensagens.map(renderizarMensagem));
    chatFeedback.textContent = resultado.paginacao?.total
      ? `${resultado.paginacao.total} mensagem(ns) nesta conversa.`
      : 'Ainda não há mensagens nesta conversa.';
    messageList.scrollTop = messageList.scrollHeight;
  } catch (erro) {
    console.error('Erro ao carregar as mensagens:', erro);
    mostrarFeedback(chatFeedback, erro.message || 'Não foi possível carregar as mensagens.', 'erro');
  }
};

const marcarMensagemLida = async (mensagem, botao) => {
  botao.disabled = true;
  try {
    await requisicaoSebo(`mensagens/${encodeURIComponent(mensagem.id)}/lida`, {
      ...(await tokenAtual()),
      method: 'PUT'
    });
    await carregarConversas();
    await carregarMensagens();
  } catch (erro) {
    console.error('Erro ao marcar mensagem como lida:', erro);
    mostrarFeedback(chatFeedback, erro.message || 'Não foi possível marcar a mensagem como lida.', 'erro');
    botao.disabled = false;
  }
};

const apagarMensagem = async (mensagem, botao) => {
  if (!window.confirm('Apagar esta mensagem recebida? Essa ação não pode ser desfeita.')) return;
  botao.disabled = true;
  try {
    await requisicaoSebo(`mensagens/${encodeURIComponent(mensagem.id)}`, {
      ...(await tokenAtual()),
      method: 'DELETE'
    });
    await carregarConversas();
    await carregarMensagens();
  } catch (erro) {
    console.error('Erro ao apagar mensagem:', erro);
    mostrarFeedback(chatFeedback, erro.message || 'Não foi possível apagar a mensagem.', 'erro');
    botao.disabled = false;
  }
};

replyForm.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (!conversaSelecionada || !replyForm.reportValidity()) return;

  sendReply.disabled = true;
  mostrarFeedback(chatFeedback, 'Enviando resposta...');
  try {
    await requisicaoSebo('mensagens', {
      ...(await tokenAtual()),
      method: 'POST',
      body: JSON.stringify({
        id_destinatario: conversaSelecionada.outro_participante.id,
        conteudo: replyText.value.trim()
      })
    });
    replyText.value = '';
    await carregarConversas();
    await carregarMensagens();
  } catch (erro) {
    console.error('Erro ao enviar resposta:', erro);
    mostrarFeedback(chatFeedback, erro.message || 'Não foi possível enviar a resposta.', 'erro');
  } finally {
    sendReply.disabled = false;
  }
});

reloadConversations.addEventListener('click', carregarConversas);
logoutButton.addEventListener('click', async () => {
  logoutButton.disabled = true;
  try {
    await signOut(auth);
    limparSessaoSebo();
    window.location.replace('./login.html?tipo=funcionario');
  } catch (erro) {
    console.error('Erro ao encerrar sessão do funcionário:', erro);
    mostrarFeedback(feedback, 'Não foi possível encerrar a sessão. Tente novamente.', 'erro');
    logoutButton.disabled = false;
  }
});

const iniciar = async () => {
  usuario = await aguardarUsuario();
  if (!usuario) {
    limparSessaoSebo();
    window.location.replace('./login.html?tipo=funcionario');
    return;
  }

  logoutButton.hidden = false;
  try {
    perfil = await requisicaoSebo('sebos/sessao', { token: await usuario.getIdToken() });
    if (perfil.tipoConta !== 'subconta') {
      window.location.replace('../index.html');
      return;
    }
    if (perfil.precisaTrocarSenha) {
      window.location.replace('./funcionarios.html');
      return;
    }
    if (!(perfil.permissoes || []).includes('mensagens.gerenciar')) {
      mostrarFeedback(feedback, 'Seu acesso não inclui mensagens. Peça ao gestor do sebo para habilitar essa permissão.', 'erro');
      return;
    }
    workspace.hidden = false;
    await carregarConversas();
  } catch (erro) {
    console.error('Não foi possível validar a sessão do funcionário:', erro);
    if (erro.status === 401) {
      limparSessaoSebo();
      await signOut(auth);
      window.location.replace('./login.html?tipo=funcionario');
      return;
    }
    if (erro.status === 403) {
      mostrarFeedback(feedback, erro.message || 'Seu acesso não inclui mensagens.', 'erro');
      return;
    }
    mostrarFeedback(feedback, 'Não foi possível validar sua sessão. Verifique a conexão e tente novamente.', 'erro');
  }
};

iniciar();
