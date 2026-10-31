import { requisicaoSebo } from './firebase.js';

const criar = (tag, classe = '', texto = '') => {
  const elemento = document.createElement(tag);
  if (classe) elemento.className = classe;
  if (texto) elemento.textContent = texto;
  return elemento;
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
  if (preco == null) return null;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(preco);
};

const renderizarLivro = (livro) => {
  const cartao = criar('article', 'profile-book-card');
  const fotoUrl = Array.isArray(livro.fotos)
    ? livro.fotos.find((foto) => {
      try {
        return new URL(foto).protocol === 'https:';
      } catch {
        return false;
      }
    })
    : null;

  if (fotoUrl) {
    const imagem = document.createElement('img');
    imagem.src = fotoUrl;
    imagem.alt = `Capa de ${livro.titulo || 'livro'}`;
    imagem.loading = 'lazy';
    imagem.referrerPolicy = 'no-referrer';
    imagem.addEventListener('error', () => imagem.remove(), { once: true });
    cartao.append(imagem);
  }

  const informacoes = criar('div', 'profile-book-info');
  informacoes.append(
    criar('h4', '', livro.titulo || 'Livro sem título'),
    criar('p', '', livro.autor || 'Autor não informado'),
    criar('p', 'profile-book-meta', `${formatarTipo(livro.tipo)} · ${formatarStatus(livro.status)}`)
  );
  if (livro.tipo === 'venda' && livro.preco != null) {
    informacoes.append(criar('p', 'profile-book-price', formatarPreco(livro.preco)));
  }
  const detalhes = [];
  if (livro.localizacao) detalhes.push(`Local: ${livro.localizacao}`);
  if (Number.isInteger(livro.quantidadeEstoque)) {
    detalhes.push(`Estoque: ${livro.quantidadeEstoque}`);
  }
  if (detalhes.length) informacoes.append(criar('p', 'profile-book-meta', detalhes.join(' · ')));
  cartao.append(informacoes);
  return cartao;
};

export const adicionarSecaoLivrosPerfil = (painel, obterUsuario) => {
  const secao = criar('section', 'profile-books-section');
  const cabecalho = criar('div', 'profile-books-heading');
  cabecalho.append(
    criar('h3', 'access-heading', 'Livros cadastrados'),
    criar('p', 'section-help', 'Anúncios que fazem parte do acervo do seu sebo.')
  );
  const feedback = criar('p', 'feedback');
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  const lista = criar('div', 'profile-books-list');
  const paginacao = criar('div', 'profile-books-pagination');
  const anterior = criar('button', 'button button-secondary button-small', 'Anterior');
  anterior.type = 'button';
  const resumo = criar('span', 'profile-books-page');
  const proxima = criar('button', 'button button-secondary button-small', 'Próxima');
  proxima.type = 'button';
  paginacao.append(anterior, resumo, proxima);
  secao.append(cabecalho, feedback, lista, paginacao);
  painel.append(secao);

  let paginaAtual = 1;
  let totalPaginas = 0;
  const carregar = async () => {
    anterior.disabled = true;
    proxima.disabled = true;
    feedback.className = 'feedback';
    feedback.textContent = 'Carregando livros...';
    lista.replaceChildren();
    resumo.textContent = '';
    try {
      const resultado = await requisicaoSebo(
        `sebos/livros?page=${paginaAtual}&limit=10`,
        { token: await obterUsuario().getIdToken() }
      );
      totalPaginas = resultado.totalPaginas;
      feedback.textContent = resultado.total
        ? `${resultado.total} livro(s) no acervo do sebo.`
        : 'Ainda não há livros cadastrados no acervo.';
      lista.append(...resultado.dados.map(renderizarLivro));
      paginacao.hidden = totalPaginas <= 1;
      resumo.textContent = `Página ${paginaAtual} de ${totalPaginas}`;
      anterior.disabled = paginaAtual <= 1;
      proxima.disabled = paginaAtual >= totalPaginas;
    } catch (erro) {
      console.error('Erro ao carregar livros do perfil:', erro);
      feedback.textContent = erro.message || 'Não foi possível carregar os livros.';
      feedback.classList.add('erro');
      paginacao.hidden = true;
    }
  };

  anterior.addEventListener('click', () => {
    if (paginaAtual > 1) {
      paginaAtual -= 1;
      carregar();
    }
  });
  proxima.addEventListener('click', () => {
    if (paginaAtual < totalPaginas) {
      paginaAtual += 1;
      carregar();
    }
  });
  carregar();
};
