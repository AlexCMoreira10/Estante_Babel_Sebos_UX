import { requisicaoSeboArquivo } from './firebase.js';

const MIME_PLANILHA = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const TAMANHO_MAXIMO = 4 * 1024 * 1024;

const criar = (tag, classe = '', texto = '') => {
  const elemento = document.createElement(tag);
  if (classe) elemento.className = classe;
  if (texto) elemento.textContent = texto;
  return elemento;
};

const baixarArquivo = (blob, nome) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const adicionarAcaoAnunciosEmMassa = (container, obterUsuario) => {
  const abrir = criar('button', 'button button-secondary button-full', 'Anunciar em massa');
  abrir.type = 'button';

  const modal = criar('dialog', 'bulk-import-dialog');
  const conteudo = criar('div', 'bulk-import-content');
  const titulo = criar('h2', '', 'Anunciar livros em massa');
  titulo.id = 'bulkImportTitle';
  modal.setAttribute('aria-labelledby', titulo.id);
  const descricao = criar(
    'p',
    'section-help',
    'Baixe o modelo, preencha uma linha por livro e envie o arquivo .xlsx. O relatório mostrará os livros cadastrados e as linhas que precisam de correção.'
  );
  const modelo = criar('button', 'button button-secondary button-full', 'Baixar planilha modelo');
  modelo.type = 'button';

  const formulario = criar('form', 'form-stack bulk-import-form');
  const grupoArquivo = criar('div', 'form-group');
  const label = criar('label', '', 'Planilha Excel (.xlsx)');
  const idArquivo = `bulkImportFile-${crypto.randomUUID()}`;
  const arquivo = document.createElement('input');
  arquivo.id = idArquivo;
  label.htmlFor = idArquivo;
  arquivo.type = 'file';
  arquivo.accept = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  arquivo.required = true;
  arquivo.setAttribute('aria-label', 'Selecionar planilha de livros');
  grupoArquivo.append(label, arquivo);

  const status = criar('p', 'feedback');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const acoes = criar('div', 'bulk-import-actions');
  const fechar = criar('button', 'button button-secondary', 'Fechar');
  fechar.type = 'button';
  const processar = criar('button', 'button button-primary', 'Enviar e processar');
  processar.type = 'submit';
  acoes.append(fechar, processar);
  formulario.append(grupoArquivo, status, acoes);
  conteudo.append(titulo, descricao, modelo, formulario);
  modal.append(conteudo);
  document.body.append(modal);
  container.append(abrir);

  const mostrarErro = (erro) => {
    status.textContent = erro.message || 'Não foi possível concluir a operação.';
    status.classList.add('erro');
    status.classList.remove('sucesso');
  };

  abrir.addEventListener('click', () => modal.showModal());
  fechar.addEventListener('click', () => modal.close());
  modal.addEventListener('click', (evento) => {
    if (evento.target === modal) modal.close();
  });

  modelo.addEventListener('click', async () => {
    modelo.disabled = true;
    status.textContent = 'Preparando o modelo...';
    status.classList.remove('erro', 'sucesso');
    try {
      const resultado = await requisicaoSeboArquivo('sebos/livros/importacao/modelo', {
        token: await obterUsuario().getIdToken()
      });
      baixarArquivo(resultado.blob, 'modelo-anuncios-livros.xlsx');
      status.textContent = 'Modelo baixado. Preencha a aba Livros e mantenha os cabeçalhos.';
      status.classList.add('sucesso');
    } catch (erro) {
      console.error('Erro ao baixar o modelo de anúncios em massa:', erro);
      mostrarErro(erro);
    } finally {
      modelo.disabled = false;
    }
  });

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const planilha = arquivo.files[0];
    if (!planilha) return;
    if (!planilha.name.toLowerCase().endsWith('.xlsx')) {
      mostrarErro(new Error('Selecione uma planilha do Excel com extensão .xlsx.'));
      return;
    }
    if (planilha.size > TAMANHO_MAXIMO) {
      mostrarErro(new Error('A planilha deve ter no máximo 4 MB.'));
      return;
    }

    processar.disabled = true;
    modelo.disabled = true;
    status.textContent = 'Processando livros. Isso pode levar alguns instantes...';
    status.classList.remove('erro', 'sucesso');
    try {
      const resultado = await requisicaoSeboArquivo('sebos/livros/importacao', {
        method: 'POST',
        token: await obterUsuario().getIdToken(),
        headers: { 'Content-Type': MIME_PLANILHA },
        body: planilha
      });
      baixarArquivo(resultado.blob, 'resultado-anuncios-livros.xlsx');
      const criados = resultado.headers.get('X-Livros-Cadastrados');
      const rejeitados = resultado.headers.get('X-Livros-Rejeitados');
      status.textContent = criados !== null && rejeitados !== null
        ? `Processamento concluído: ${criados} cadastrados, ${rejeitados} com erro. O relatório foi baixado.`
        : 'Processamento concluído. Consulte o relatório baixado para verificar o resultado de cada linha.';
      status.classList.add('sucesso');
      arquivo.value = '';
    } catch (erro) {
      console.error('Erro ao anunciar livros em massa:', erro);
      mostrarErro(erro);
    } finally {
      processar.disabled = false;
      modelo.disabled = false;
    }
  });

  return abrir;
};
