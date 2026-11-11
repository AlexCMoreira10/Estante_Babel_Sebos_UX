import test from 'node:test';
import assert from 'node:assert/strict';
import { aguardarEstadoAutenticacao } from '../dist/js/home-auth-state.js';

test('waits for Firebase Auth before resolving an authenticated user', async () => {
  let notificar;
  let desinscrito = false;
  let resolvido = false;
  const estado = aguardarEstadoAutenticacao((proximo) => {
    notificar = proximo;
    return () => {
      desinscrito = true;
    };
  }, 1000).then((usuario) => {
    resolvido = true;
    return usuario;
  });

  await Promise.resolve();
  assert.equal(resolvido, false);
  const usuario = { uid: 'gestor-ficticio' };
  notificar(usuario);

  assert.equal(await estado, usuario);
  assert.equal(desinscrito, true);
});

test('resolves unauthenticated only after Firebase emits null', async () => {
  const estado = aguardarEstadoAutenticacao((proximo) => {
    proximo(null);
    return () => {};
  }, 1000);

  assert.equal(await estado, null);
});

test('rejects Firebase observer errors and unsubscribes', async () => {
  let informarErro;
  let desinscrito = false;
  const estado = aguardarEstadoAutenticacao((_, erro) => {
    informarErro = erro;
    return () => {
      desinscrito = true;
    };
  }, 1000);

  informarErro(new Error('Firebase indisponível'));
  await assert.rejects(estado, /Firebase indisponível/);
  assert.equal(desinscrito, true);
});

test('times out a stalled auth restoration and unsubscribes', async () => {
  let desinscrito = false;
  const estado = aguardarEstadoAutenticacao(() => () => {
    desinscrito = true;
  }, 10);

  await assert.rejects(estado, /verificação da sessão expirou/);
  assert.equal(desinscrito, true);
});
