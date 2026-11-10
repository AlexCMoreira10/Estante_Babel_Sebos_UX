const canonicalizar = valor => {
  if (Array.isArray(valor)) return valor.map(canonicalizar);
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(
      Object.keys(valor).sort().map(chave => [chave, canonicalizar(valor[chave])])
    );
  }
  return valor ?? null;
};

const dadosCadastro = sebo => ({
  nome: sebo.nome,
  telefone: sebo.telefone,
  endereco: sebo.endereco,
  horario_funcionamento: sebo.horario_funcionamento
});

export const capturarFormulario = form =>
  JSON.stringify([...form.querySelectorAll('input')].map(input => ({
    value: input.value,
    checked: input.type === 'checkbox' ? input.checked : undefined
  })));

export const ehFalhaDeRede = erro =>
  erro instanceof TypeError ||
  ['AbortError', 'TimeoutError'].includes(erro?.name) ||
  ['ETIMEDOUT', 'ECONNRESET', 'ENETUNREACH', 'ERR_NETWORK'].includes(erro?.code);

export const cadastroSalvoCorresponde = (sebo, dadosEnviados) =>
  JSON.stringify(canonicalizar(dadosCadastro(sebo))) ===
  JSON.stringify(canonicalizar(dadosEnviados));

export const recuperarPerfilAposFalha = async ({
  consultarPerfil,
  snapshotEnviado,
  snapshotAtual,
  aplicarPerfil,
  atualizarEstado
}) => {
  const sebo = await consultarPerfil();
  const formularioAlterado = snapshotAtual() !== snapshotEnviado;
  if (!formularioAlterado) aplicarPerfil(sebo);
  atualizarEstado(sebo);
  return { sebo, formularioAlterado };
};
