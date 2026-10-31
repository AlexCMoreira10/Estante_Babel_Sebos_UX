import {
  auth,
  limparSessaoSebo,
  onAuthStateChanged,
  requisicaoSebo,
  signOut
} from './firebase.js';

const form = document.getElementById('bookForm');
const seboName = document.getElementById('bookstoreName');
const feedback = document.getElementById('bookFeedback');
const submitButton = document.getElementById('submitBook');
const typeSelect = document.getElementById('bookType');
const priceGroup = document.getElementById('bookPriceGroup');
const priceInput = document.getElementById('bookPrice');
const backLink = document.getElementById('backLink');
let usuarioAtual;
submitButton.disabled = true;

const aguardarUsuario = () => new Promise((resolve) => {
  const cancelar = onAuthStateChanged(auth, (usuario) => {
    cancelar();
    resolve(usuario);
  });
});

const mostrarFeedback = (mensagem, tipo = '') => {
  feedback.textContent = mensagem;
  feedback.classList.toggle('erro', tipo === 'erro');
  feedback.classList.toggle('sucesso', tipo === 'sucesso');
};

const atualizarTipoAnuncio = () => {
  const venda = typeSelect.value === 'venda';
  priceGroup.hidden = !venda;
  priceInput.required = venda;
  if (!venda) priceInput.value = '';
};

typeSelect.addEventListener('change', atualizarTipoAnuncio);
atualizarTipoAnuncio();

const iniciar = async () => {
  const usuario = await aguardarUsuario();
  if (!usuario) {
    limparSessaoSebo();
    window.location.replace('./login.html');
    return;
  }
  usuarioAtual = usuario;

  try {
    const perfil = await requisicaoSebo('sebos/sessao', {
      token: await usuario.getIdToken()
    });
    const ehFuncionario = perfil.tipoConta === 'subconta';
    backLink.href = ehFuncionario ? './funcionarios.html' : '../index.html';

    if (perfil.precisaTrocarSenha) {
      window.location.replace(ehFuncionario ? './funcionarios.html' : '../index.html');
      return;
    }
    if (ehFuncionario && !(perfil.permissoes || []).includes('acervo.cadastrar')) {
      window.location.replace('./funcionarios.html');
      return;
    }

    seboName.textContent = perfil.seboNome || perfil.nome || 'Sebo';
    submitButton.disabled = false;
  } catch (erro) {
    console.error('Não foi possível validar o acesso ao cadastro de livros:', erro);
    if (erro.status === 401 || erro.status === 403) {
      limparSessaoSebo();
      await signOut(auth);
      window.location.replace('./login.html');
      return;
    }
    mostrarFeedback(
      'Não foi possível validar seu acesso. Verifique a conexão e tente novamente.',
      'erro'
    );
    submitButton.disabled = true;
  }
};

form.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (!form.reportValidity()) return;

  const ano = document.getElementById('bookYear').value;
  const dados = {
    titulo: document.getElementById('bookTitle').value.trim(),
    autor: document.getElementById('bookAuthor').value.trim(),
    descricao: document.getElementById('bookDescription').value.trim(),
    editora: document.getElementById('bookPublisher').value.trim(),
    anoPublicacao: ano ? Number(ano) : null,
    generos: document.getElementById('bookGenres').value
      .split(',')
      .map((genero) => genero.trim())
      .filter(Boolean),
    idioma: document.getElementById('bookLanguage').value.trim(),
    condicao: document.getElementById('bookCondition').value,
    tipo: typeSelect.value,
    preco: typeSelect.value === 'venda' ? Number(priceInput.value) : null,
    localizacao: document.getElementById('bookLocation').value.trim()
  };

  submitButton.disabled = true;
  mostrarFeedback('Cadastrando livro...');
  try {
    await requisicaoSebo('sebos/livros', {
      method: 'POST',
      token: await usuarioAtual.getIdToken(),
      body: JSON.stringify(dados)
    });
    mostrarFeedback('Livro cadastrado no acervo do sebo.', 'sucesso');
    form.reset();
    atualizarTipoAnuncio();
  } catch (erro) {
    console.error('Erro ao cadastrar livro do sebo:', erro);
    mostrarFeedback(erro.message || 'Não foi possível cadastrar o livro.', 'erro');
  } finally {
    submitButton.disabled = false;
  }
});

iniciar();
