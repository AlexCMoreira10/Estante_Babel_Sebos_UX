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
const yearInput = document.getElementById('bookYear');
const imageInput = document.getElementById('bookImages');
const imagePreview = document.getElementById('bookImagePreview');
const MAX_IMAGES = 5;
const MAX_IMAGE_SIZE = 4 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
let selectedImages = [];
let usuarioAtual;
submitButton.disabled = true;
yearInput.max = String(new Date().getFullYear());

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

const renderizarImagens = () => {
  imagePreview.replaceChildren();
  selectedImages.forEach(({ file, previewUrl }, index) => {
    const item = document.createElement('div');
    item.className = 'book-image-item';
    const imagem = document.createElement('img');
    imagem.src = previewUrl;
    imagem.alt = `Prévia da imagem ${index + 1}: ${file.name}`;
    const remover = document.createElement('button');
    remover.className = 'book-image-remove';
    remover.type = 'button';
    remover.setAttribute('aria-label', `Remover imagem ${file.name}`);
    remover.textContent = '×';
    remover.addEventListener('click', () => {
      URL.revokeObjectURL(previewUrl);
      selectedImages = selectedImages.filter((_, indice) => indice !== index);
      renderizarImagens();
    });
    item.append(imagem, remover);
    imagePreview.append(item);
  });
};

imageInput.addEventListener('change', () => {
  const novasImagens = [...imageInput.files];
  imageInput.value = '';
  if (selectedImages.length + novasImagens.length > MAX_IMAGES) {
    mostrarFeedback(`É possível adicionar no máximo ${MAX_IMAGES} imagens.`, 'erro');
    return;
  }
  const imagemInvalida = novasImagens.find(({ type, size }) =>
    !ALLOWED_IMAGE_TYPES.has(type) || size > MAX_IMAGE_SIZE
  );
  if (imagemInvalida) {
    mostrarFeedback(
      `${imagemInvalida.name}: use uma imagem JPEG, PNG ou WebP de até 4 MB.`,
      'erro'
    );
    return;
  }

  mostrarFeedback('');
  selectedImages.push(...novasImagens.map((file) => ({
    file,
    previewUrl: URL.createObjectURL(file)
  })));
  renderizarImagens();
});

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
    generos: [...document.getElementById('bookGenres').selectedOptions]
      .map((genero) => genero.value),
    idioma: document.getElementById('bookLanguage').value,
    condicao: form.querySelector('input[name="condicao"]:checked').value,
    tipo: typeSelect.value,
    preco: typeSelect.value === 'venda' ? Number(priceInput.value) : null,
    localizacao: document.getElementById('bookLocation').value.trim(),
    quantidadeEstoque: Number(document.getElementById('bookQuantity').value)
  };

  const imagensEnviadas = [];
  submitButton.disabled = true;
  mostrarFeedback(selectedImages.length ? 'Enviando imagens do livro...' : 'Cadastrando livro...');
  try {
    for (const { file } of selectedImages) {
      const resultado = await requisicaoSebo('sebos/livros/imagens', {
        method: 'POST',
        token: await usuarioAtual.getIdToken(),
        headers: { 'Content-Type': file.type },
        body: file
      });
      imagensEnviadas.push(resultado);
    }

    dados.fotos = imagensEnviadas.map(({ url }) => url);
    mostrarFeedback('Salvando cadastro do livro...');
    await requisicaoSebo('sebos/livros', {
      method: 'POST',
      token: await usuarioAtual.getIdToken(),
      body: JSON.stringify(dados)
    });
    mostrarFeedback('Livro cadastrado no acervo do sebo.', 'sucesso');
    selectedImages.forEach(({ previewUrl }) => URL.revokeObjectURL(previewUrl));
    selectedImages = [];
    renderizarImagens();
    form.reset();
    atualizarTipoAnuncio();
    yearInput.max = String(new Date().getFullYear());
  } catch (erro) {
    console.error('Erro ao cadastrar livro do sebo:', erro);
    if (imagensEnviadas.length) {
      try {
        await requisicaoSebo('sebos/livros/imagens', {
          method: 'DELETE',
          token: await usuarioAtual.getIdToken(),
          body: JSON.stringify({
            paths: imagensEnviadas.map(({ path }) => path)
          })
        });
      } catch (erroLimpeza) {
        console.error('Não foi possível remover imagens após falha no cadastro:', erroLimpeza);
      }
    }
    mostrarFeedback(erro.message || 'Não foi possível cadastrar o livro.', 'erro');
  } finally {
    submitButton.disabled = false;
  }
});

iniciar();
