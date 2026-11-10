import {
  auth,
  limparSessaoSebo,
  onAuthStateChanged,
  requisicaoSebo,
  signOut
} from './firebase.js';
import { renderizarLivro } from './livros-perfil.js';

const feedback = document.getElementById('catalogFeedback');
const workspace = document.getElementById('catalogWorkspace');
const listViewButton = document.getElementById('listViewButton');
const tableViewButton = document.getElementById('tableViewButton');
const reloadBooksButton = document.getElementById('reloadBooks');
const bookList = document.getElementById('bookList');
const bookTableWrap = document.getElementById('bookTableWrap');
const bookTableBody = document.getElementById('bookTableBody');
const pagination = document.getElementById('catalogPagination');
const previousPageButton = document.getElementById('previousPage');
const nextPageButton = document.getElementById('nextPage');
const pageSummary = document.getElementById('pageSummary');

let usuario = null;
let paginaAtual = 1;
let totalPaginas = 1;

const criar = (tag, classe = '', texto = '') => {
  const elemento = document.createElement(tag);
  if (classe) elemento.className = classe;
  if (texto) elemento.textContent = texto;
  return elemento;
};

const aguardarUsuario = () => new Promise((resolve) => {
  const cancelar = onAuthStateChanged(auth, (usuarioAtual) => {
    cancelar();
    resolve(usuarioAtual);
  });
});

const mostrarFeedback = (mensagem, tipo = '') => {
  feedback.textContent = mensagem;
  feedback.classList.toggle('erro', tipo === 'erro');
  feedback.classList.toggle('sucesso', tipo === 'sucesso');
};

const formatarTipo = (tipo) => ({
  venda: 'Venda',
  troca: 'Troca',
  doacao: 'Doação'
}[tipo] || tipo || '—');

const formatarStatus = (status) => ({
  disponivel: 'Disponível',
  reservado: 'Reservado',
  vendido: 'Vendido',
  trocado: 'Trocado'
}[status] || status || '—');

const formatarPreco = (preco) => {
  if (preco == null) return '—';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(preco);
};

const adicionarCelula = (linha, valor) => {
  const celula = criar('td', '', valor == null || valor === '' ? '—' : String(valor));
  linha.append(celula);
  return celula;
};

const renderizarLinhaTabela = (livro) => {
  const linha = document.createElement('tr');
  adicionarCelula(linha, livro.titulo || 'Livro sem título');
  adicionarCelula(linha, livro.autor || 'Autor não informado');
  adicionarCelula(linha, formatarTipo(livro.tipo));
  adicionarCelula(linha, formatarStatus(livro.status));
  adicionarCelula(linha, formatarPreco(livro.preco));
  adicionarCelula(linha, livro.quantidadeEstoque);
  adicionarCelula(linha, livro.localizacao);

  const celulaQr = adicionarCelula(linha, '');
  if (livro.qrCode) {
    const baixarQr = criar('a', 'catalog-qr-link', 'Baixar QR Code');
    baixarQr.href = livro.qrCode;
    baixarQr.download = `qrcode-livro-${livro.id || 'acervo'}.png`;
    celulaQr.replaceChildren(baixarQr);
  }
  return linha;
};

const atualizarPaginacao = () => {
  pagination.hidden = totalPaginas <= 1;
  pageSummary.textContent = `Página ${paginaAtual} de ${totalPaginas}`;
  previousPageButton.disabled = paginaAtual <= 1;
  nextPageButton.disabled = paginaAtual >= totalPaginas;
};

const carregarLivros = async () => {
  reloadBooksButton.disabled = true;
  previousPageButton.disabled = true;
  nextPageButton.disabled = true;
  mostrarFeedback('Carregando livros...');
  bookList.replaceChildren();
  bookTableBody.replaceChildren();
  pagination.hidden = true;

  try {
    const resultado = await requisicaoSebo(
      `sebos/livros?page=${paginaAtual}&limit=10`,
      { token: await usuario.getIdToken() }
    );
    if (!Array.isArray(resultado.dados) || !Number.isInteger(resultado.totalPaginas)) {
      throw new Error('A API retornou uma lista de livros inválida.');
    }

    totalPaginas = Math.max(1, resultado.totalPaginas);
    if (paginaAtual > totalPaginas) {
      paginaAtual = totalPaginas;
      await carregarLivros();
      return;
    }

    bookList.append(...resultado.dados.map(renderizarLivro));
    bookTableBody.append(...resultado.dados.map(renderizarLinhaTabela));
    if (resultado.total) {
      mostrarFeedback(`${resultado.total} livro(s) no acervo do sebo.`);
    } else {
      bookList.append(criar('p', 'catalog-empty', 'Ainda não há livros cadastrados no acervo.'));
      mostrarFeedback('Ainda não há livros cadastrados no acervo.');
    }
    atualizarPaginacao();
  } catch (erro) {
    console.error('Erro ao carregar livros cadastrados:', erro);
    mostrarFeedback(erro.message || 'Não foi possível carregar os livros.', 'erro');
  } finally {
    reloadBooksButton.disabled = false;
  }
};

const definirVisualizacao = (visualizacao) => {
  const mostrarLista = visualizacao === 'lista';
  bookList.hidden = !mostrarLista;
  bookTableWrap.hidden = mostrarLista;
  listViewButton.classList.toggle('button-primary', mostrarLista);
  listViewButton.classList.toggle('button-secondary', !mostrarLista);
  listViewButton.setAttribute('aria-pressed', String(mostrarLista));
  tableViewButton.classList.toggle('button-primary', !mostrarLista);
  tableViewButton.classList.toggle('button-secondary', mostrarLista);
  tableViewButton.setAttribute('aria-pressed', String(!mostrarLista));
};

listViewButton.addEventListener('click', () => definirVisualizacao('lista'));
tableViewButton.addEventListener('click', () => definirVisualizacao('planilha'));
reloadBooksButton.addEventListener('click', carregarLivros);
previousPageButton.addEventListener('click', () => {
  if (paginaAtual > 1) {
    paginaAtual -= 1;
    carregarLivros();
  }
});
nextPageButton.addEventListener('click', () => {
  if (paginaAtual < totalPaginas) {
    paginaAtual += 1;
    carregarLivros();
  }
});

const iniciar = async () => {
  usuario = await aguardarUsuario();
  if (!usuario) {
    limparSessaoSebo();
    window.location.replace('./login.html');
    return;
  }

  try {
    const perfil = await requisicaoSebo('sebos/sessao', {
      token: await usuario.getIdToken()
    });
    if (perfil.tipoConta !== 'gestor') {
      mostrarFeedback('Somente o gestor do sebo pode consultar o acervo completo.', 'erro');
      window.setTimeout(() => window.location.replace('../index.html'), 1200);
      return;
    }

    workspace.hidden = false;
    await carregarLivros();
  } catch (erro) {
    console.error('Não foi possível validar o acesso ao acervo:', erro);
    if (erro.status === 401) {
      limparSessaoSebo();
      await signOut(auth);
      window.location.replace('./login.html');
      return;
    }
    mostrarFeedback(erro.message || 'Não foi possível validar seu acesso.', 'erro');
  }
};

definirVisualizacao('lista');
iniciar();
