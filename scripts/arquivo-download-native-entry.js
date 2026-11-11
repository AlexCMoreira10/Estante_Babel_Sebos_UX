import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const blobParaBase64 = async (blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binario = '';
  for (let indice = 0; indice < bytes.length; indice += 0x8000) {
    binario += String.fromCharCode(...bytes.subarray(indice, indice + 0x8000));
  }
  return btoa(binario);
};

export const criarTransferenciaNativa = ({
  filesystem = Filesystem,
  directory = Directory,
  share = Share
} = {}) => async (blob, nome) => {
  const podeCompartilhar = await share.canShare();
  if (!podeCompartilhar.value) {
    throw new Error('Este dispositivo não oferece um aplicativo compatível para compartilhar arquivos.');
  }

  const arquivo = await filesystem.writeFile({
    path: nome,
    data: await blobParaBase64(blob),
    directory: directory.Cache
  });
  if (!arquivo.uri) {
    throw new Error('O arquivo foi preparado, mas não foi possível obter seu endereço temporário.');
  }

  try {
    await share.share({
      title: nome,
      dialogTitle: 'Salvar ou compartilhar arquivo',
      files: [arquivo.uri]
    });
  } catch (erro) {
    throw new Error(
      'Não foi possível abrir o compartilhamento. A operação pode ter sido cancelada ou não há aplicativo compatível.',
      { cause: erro }
    );
  }

  return { canal: 'nativo', nome };
};

export const salvarArquivoNativo = criarTransferenciaNativa();
