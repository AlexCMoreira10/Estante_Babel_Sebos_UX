import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cadastroSalvoCorresponde,
  ehFalhaDeRede,
  recuperarPerfilAposFalha
} from '../js/editar-sebo-state.js';

const cadastroSalvo = {
  nome: 'Sebo Babel',
  telefone: ['11999999999'],
  endereco: { rua: 'Rua A', numero: '10' },
  horario_funcionamento: { segunda: { abre: '09:00', fecha: '18:00' } },
  localizacaoSyncStatus: 'pendente'
};

test('identifies network and timeout failures without treating HTTP errors as network failures', () => {
  assert.equal(ehFalhaDeRede(new TypeError('Failed to fetch')), true);
  assert.equal(ehFalhaDeRede(Object.assign(new Error('timeout'), { name: 'TimeoutError' })), true);
  assert.equal(ehFalhaDeRede(Object.assign(new Error('HTTP 500'), { status: 500 })), false);
});

test('recovers the saved profile and applies it when the form has no newer edits', async () => {
  let consultas = 0;
  let perfilAplicado;
  let estadoAtualizado;
  const result = await recuperarPerfilAposFalha({
    consultarPerfil: async () => {
      consultas += 1;
      return cadastroSalvo;
    },
    snapshotEnviado: 'enviado',
    snapshotAtual: () => 'enviado',
    aplicarPerfil: perfil => { perfilAplicado = perfil; },
    atualizarEstado: perfil => { estadoAtualizado = perfil; }
  });

  assert.equal(consultas, 1);
  assert.equal(result.formularioAlterado, false);
  assert.equal(perfilAplicado, cadastroSalvo);
  assert.equal(estadoAtualizado, cadastroSalvo);
  assert.equal(cadastroSalvoCorresponde(result.sebo, {
    horario_funcionamento: { segunda: { fecha: '18:00', abre: '09:00' } },
    endereco: { numero: '10', rua: 'Rua A' },
    telefone: ['11999999999'],
    nome: 'Sebo Babel'
  }), true);
});

test('preserves form edits made during the request while still updating synchronization state', async () => {
  let perfilAplicado = false;
  let estadoAtualizado;
  const result = await recuperarPerfilAposFalha({
    consultarPerfil: async () => cadastroSalvo,
    snapshotEnviado: 'enviado',
    snapshotAtual: () => 'editado depois',
    aplicarPerfil: () => { perfilAplicado = true; },
    atualizarEstado: perfil => { estadoAtualizado = perfil.localizacaoSyncStatus; }
  });

  assert.equal(result.formularioAlterado, true);
  assert.equal(perfilAplicado, false);
  assert.equal(estadoAtualizado, 'pendente');
});

test('propagates recovery-query failures so the interface can offer another attempt', async () => {
  const erroConsulta = new TypeError('network down');
  await assert.rejects(
    recuperarPerfilAposFalha({
      consultarPerfil: async () => { throw erroConsulta; },
      snapshotEnviado: 'enviado',
      snapshotAtual: () => 'enviado',
      aplicarPerfil: () => {},
      atualizarEstado: () => {}
    }),
    erroConsulta
  );
});
