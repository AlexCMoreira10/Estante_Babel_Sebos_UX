export const aguardarEstadoAutenticacao = (registrar, timeoutMs = 15000) => new Promise((resolve, reject) => {
  let concluido = false;
  let cancelar = () => {};
  const timeout = setTimeout(() => {
    finalizar(reject, new Error('A verificação da sessão expirou.'));
  }, timeoutMs);

  const finalizar = (resolver, valor) => {
    if (concluido) return;
    concluido = true;
    clearTimeout(timeout);
    cancelar();
    resolver(valor);
  };

  try {
    const removerObservador = registrar(
      (usuario) => finalizar(resolve, usuario),
      (erro) => finalizar(
        reject,
        erro instanceof Error ? erro : new Error('Não foi possível verificar a sessão.')
      )
    );
    cancelar = typeof removerObservador === 'function' ? removerObservador : () => {};
    if (concluido) cancelar();
  } catch (erro) {
    finalizar(
      reject,
      erro instanceof Error ? erro : new Error('Não foi possível verificar a sessão.')
    );
  }
});
