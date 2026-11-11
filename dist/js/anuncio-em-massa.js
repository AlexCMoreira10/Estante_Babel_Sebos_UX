import { requisicaoSeboArquivo } from './firebase.js';
import {
  MIME_XLSX,
  mensagemEntregaArquivo,
  salvarArquivo,
  validarPlanilhaXlsx
} from './arquivo-download.js';

const TAMANHO_MAXIMO = 4 * 1024 * 1024;

const criar = (tag, classe = '', texto = '') => {
  const elemento = document.createElement(tag);
  if (classe) elemento.className = classe;
  if (texto) elemento.textContent = texto;
  return elemento;
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
    'Baixe o modelo e preencha uma linha por livro. As medidas do pacote são opcionais, mas devem ser informadas juntas; imagens aceitam até 5 URLs HTTPS públicas separadas por ponto e vírgula. O relatório indica as linhas e os campos que precisam de correção.'
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
      const planilha = await validarPlanilhaXlsx(resultado.blob);
      const entrega = await salvarArquivo(planilha, 'modelo-anuncios-livros.xlsx', MIME_XLSX);
      status.textContent = `${mensagemEntregaArquivo(entrega)} Preencha a aba Livros, mantenha os cabeçalhos e consulte a aba Instruções.`;
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
        headers: { 'Content-Type': MIME_XLSX },
        body: planilha
      });
      const quantidadeCriados = resultado.headers.get('X-Livros-Cadastrados');
      const quantidadeRejeitados = resultado.headers.get('X-Livros-Rejeitados');
      const resumo = quantidadeCriados !== null && quantidadeRejeitados !== null
        ? `Processamento concluído: ${quantidadeCriados} cadastrados, ${quantidadeRejeitados} com erro.`
        : 'Processamento concluído.';
      arquivo.value = '';
      try {
        const relatorio = await validarPlanilhaXlsx(resultado.blob);
        const entrega = await salvarArquivo(relatorio, 'resultado-anuncios-livros.xlsx', MIME_XLSX);
        status.textContent = `${resumo} ${mensagemEntregaArquivo(entrega)} Consulte o relatório para verificar os resultados por linha.`;
        status.classList.add('sucesso');
      } catch (erroRelatorio) {
        console.error('Os livros foram processados, mas o relatório não pôde ser entregue:', erroRelatorio);
        status.textContent = `${resumo} Não foi possível preparar ou compartilhar o relatório: ${erroRelatorio.message} Os livros já foram processados; não reenvie a planilha.`;
        status.classList.add('erro');
      }
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
