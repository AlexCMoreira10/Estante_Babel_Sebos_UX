import { Capacitor } from '@capacitor/core';

export const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const MIME_PNG = 'image/png';

const verificarAssinatura = async (blob, mimeType, assinatura, mensagem) => {
  if (!(blob instanceof Blob) || blob.size < assinatura.length) {
    throw new Error(mensagem);
  }

  const bytes = new Uint8Array(await blob.slice(0, assinatura.length).arrayBuffer());
  if (!assinatura.every((byte, indice) => bytes[indice] === byte)) {
    throw new Error(mensagem);
  }

  return blob.type === mimeType ? blob : new Blob([blob], { type: mimeType });
};

export const validarPlanilhaXlsx = (blob) => verificarAssinatura(
  blob,
  MIME_XLSX,
  [0x50, 0x4b, 0x03, 0x04],
  'O arquivo recebido não é uma planilha XLSX válida ou está vazio.'
);

export const criarBlobPng = async (dataUri) => {
  const correspondencia = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUri || '');
  if (!correspondencia) {
    throw new Error('O QR Code recebido não está em um formato PNG válido.');
  }

  let bytes;
  try {
    const binario = atob(correspondencia[1]);
    bytes = Uint8Array.from(binario, (caractere) => caractere.charCodeAt(0));
  } catch {
    throw new Error('Não foi possível decodificar a imagem do QR Code.');
  }

  return verificarAssinatura(
    new Blob([bytes], { type: MIME_PNG }),
    MIME_PNG,
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    'A imagem recebida não contém um PNG válido.'
  );
};

const sanitizarNomeArquivo = (nome) => {
  const seguro = String(nome)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^\.+|[.-]+$/g, '');
  return seguro || 'arquivo';
};

const salvarNoDispositivo = async (blob, nome, dependencias) => {
  const adaptador = dependencias.nativeAdapter
    || await import('./arquivo-download.native.js');
  return adaptador.salvarArquivoNativo(blob, nome);
};

const baixarNoNavegador = (blob, nome, dependencias) => {
  const documento = dependencias.documentRef || globalThis.document;
  const urlApi = dependencias.urlApi || URL;
  if (!documento?.body || typeof urlApi.createObjectURL !== 'function') {
    throw new Error('Este navegador não oferece suporte ao download do arquivo.');
  }

  const url = urlApi.createObjectURL(blob);
  const link = documento.createElement('a');
  link.href = url;
  link.download = nome;
  link.setAttribute('aria-hidden', 'true');
  link.style.position = 'fixed';
  link.style.left = '-10000px';
  try {
    documento.body.append(link);
    link.click();
  } catch (erro) {
    urlApi.revokeObjectURL(url);
    throw new Error(
      'O navegador não conseguiu iniciar o download do arquivo.',
      { cause: erro }
    );
  } finally {
    link.remove();
  }

  const agendar = dependencias.setTimeoutFn || globalThis.setTimeout;
  agendar(() => urlApi.revokeObjectURL(url), 60_000);
  return { canal: 'web', nome };
};

export const salvarArquivo = async (blob, nome, mimeType, dependencias = {}) => {
  if (!(blob instanceof Blob) || blob.size === 0) {
    throw new Error('O arquivo está vazio ou não pode ser aberto.');
  }
  if (!mimeType) throw new Error('Não foi informado o formato do arquivo.');

  const arquivo = blob.type === mimeType ? blob : new Blob([blob], { type: mimeType });
  const nomeSeguro = sanitizarNomeArquivo(nome);
  const plataforma = dependencias.platform || Capacitor.getPlatform();

  return plataforma === 'web'
    ? baixarNoNavegador(arquivo, nomeSeguro, dependencias)
    : salvarNoDispositivo(arquivo, nomeSeguro, dependencias);
};

export const mensagemEntregaArquivo = ({ canal, nome }) => canal === 'nativo'
  ? `O menu de compartilhamento de ${nome} foi fechado. O aplicativo não consegue confirmar se um destino salvou o arquivo permanentemente.`
  : `O navegador recebeu a solicitação de download de ${nome}. Confira a lista de downloads; a conclusão depende do navegador.`;
