import {
  auth,
  limparSessaoSebo,
  onAuthStateChanged,
  requisicaoSebo,
  signOut
} from './firebase.js';
import {
  cadastroSalvoCorresponde,
  capturarFormulario,
  ehFalhaDeRede,
  recuperarPerfilAposFalha
} from './editar-sebo-state.js';

const form = document.getElementById('seboForm');
const saveButton = document.getElementById('saveSebo');
const feedback = document.getElementById('formFeedback');
const phonesList = document.getElementById('phonesList');
const scheduleList = document.getElementById('scheduleList');
const locationStatus = document.getElementById('locationStatus');
const retryLocation = document.getElementById('retryLocation');
const days = [
  ['segunda', 'Segunda-feira'],
  ['terca', 'Terça-feira'],
  ['quarta', 'Quarta-feira'],
  ['quinta', 'Quinta-feira'],
  ['sexta', 'Sexta-feira'],
  ['sabado', 'Sábado'],
  ['domingo', 'Domingo']
];
let usuarioAtual;
let sincronizacaoEmAndamento = false;
let salvamentoEmAndamento = false;
let recuperacaoEmAndamento = false;
let recuperacaoNecessaria = false;
let snapshotPatchFalho;

const aguardarUsuario = () => new Promise(resolve => {
  const cancelar = onAuthStateChanged(auth, usuario => {
    cancelar();
    resolve(usuario);
  });
});

const mostrarFeedback = (elemento, mensagem, tipo = '') => {
  elemento.textContent = mensagem;
  elemento.classList.toggle('erro', tipo === 'erro');
  elemento.classList.toggle('sucesso', tipo === 'sucesso');
};

const adicionarTelefone = (telefone = '') => {
  const linha = document.createElement('div');
  linha.className = 'phone-row';
  const input = document.createElement('input');
  input.type = 'tel';
  input.inputMode = 'tel';
  input.autocomplete = 'tel';
  input.dataset.phone = '';
  input.value = telefone;
  input.placeholder = '(11) 99999-9999';
  input.required = phonesList.childElementCount === 0;
  input.setAttribute('aria-label', 'Telefone de contato');
  const remover = document.createElement('button');
  remover.type = 'button';
  remover.className = 'remove-phone';
  remover.textContent = 'Remover';
  remover.setAttribute('aria-label', 'Remover telefone');
  remover.addEventListener('click', () => {
    linha.remove();
    const primeiro = phonesList.querySelector('input');
    if (primeiro) primeiro.required = true;
  });
  linha.append(input, remover);
  phonesList.append(linha);
};

const construirHorarios = horarios => {
  scheduleList.replaceChildren();
  for (const [dia, nome] of days) {
    const linha = document.createElement('div');
    linha.className = 'schedule-row';
    const label = document.createElement('label');
    label.className = 'day-toggle';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.day = dia;
    const texto = document.createElement('span');
    texto.textContent = nome;
    label.append(checkbox, texto);

    const periodo = horarios?.[dia];
    const horas = document.createElement('div');
    horas.className = 'schedule-times';
    const abre = document.createElement('input');
    abre.type = 'time';
    abre.dataset.open = dia;
    abre.setAttribute('aria-label', `Abertura ${nome}`);
    const separador = document.createElement('span');
    separador.textContent = 'às';
    const fecha = document.createElement('input');
    fecha.type = 'time';
    fecha.dataset.close = dia;
    fecha.setAttribute('aria-label', `Fechamento ${nome}`);
    checkbox.checked = Boolean(periodo);
    abre.value = periodo?.abre || '';
    fecha.value = periodo?.fecha || '';
    abre.disabled = !checkbox.checked;
    fecha.disabled = !checkbox.checked;
    abre.required = checkbox.checked;
    fecha.required = checkbox.checked;
    checkbox.addEventListener('change', () => {
      abre.disabled = !checkbox.checked;
      fecha.disabled = !checkbox.checked;
      abre.required = checkbox.checked;
      fecha.required = checkbox.checked;
      if (!checkbox.checked) {
        abre.value = '';
        fecha.value = '';
      } else {
        abre.value ||= '09:00';
        fecha.value ||= '18:00';
      }
    });
    horas.append(abre, separador, fecha);
    linha.append(label, horas);
    scheduleList.append(linha);
  }
};

const construirHorariosPayload = () => {
  const horarios = {};
  const selecionados = [...scheduleList.querySelectorAll('[data-day]')];
  if (!selecionados.some(checkbox => checkbox.checked)) {
    throw new Error('Selecione pelo menos um dia de funcionamento.');
  }
  for (const checkbox of selecionados) {
    const dia = checkbox.dataset.day;
    if (!checkbox.checked) {
      horarios[dia] = null;
      continue;
    }
    const abre = scheduleList.querySelector(`[data-open="${dia}"]`).value;
    const fecha = scheduleList.querySelector(`[data-close="${dia}"]`).value;
    if (!abre || !fecha || abre >= fecha) {
      throw new Error(`Confira os horários de ${days.find(([chave]) => chave === dia)[1]}.`);
    }
    horarios[dia] = { abre, fecha };
  }
  return horarios;
};

const mostrarEstadoLocalizacao = (sebo, aviso) => {
  const estado = sebo.localizacaoSyncStatus || (sebo.geocode ? 'sincronizado' : 'sem_localizacao');
  const mensagens = {
    sincronizado: 'Localização atualizada. Os anúncios estão sincronizados com o endereço comercial.',
    pendente: 'Sincronização de localização pendente. Anúncios sem a versão atual não aparecem na busca por proximidade.',
    erro: sebo.localizacaoSyncErro || aviso || 'A localização não foi sincronizada. Tente novamente.',
    sem_localizacao: 'O estabelecimento ainda não tem localização geográfica confirmada.'
  };
  const tipo = estado === 'sincronizado' ? 'sucesso' : estado === 'erro' ? 'erro' : '';
  mostrarFeedback(locationStatus, aviso || mensagens[estado] || mensagens.sem_localizacao, tipo);
  retryLocation.hidden = estado === 'sincronizado' && Boolean(sebo.geocode);
  retryLocation.disabled = false;
  retryLocation.textContent = estado === 'sem_localizacao'
    ? 'Geocodificar endereço e sincronizar anúncios'
    : 'Tentar sincronizar localização novamente';
};

const preencherFormulario = sebo => {
  document.getElementById('seboName').value = sebo.nome || '';
  phonesList.replaceChildren();
  (Array.isArray(sebo.telefone) && sebo.telefone.length ? sebo.telefone : [''])
    .forEach(adicionarTelefone);

  const endereco = sebo.endereco || {};
  for (const campo of ['cep', 'estado', 'rua', 'numero', 'complemento', 'bairro', 'cidade']) {
    document.getElementById(campo).value = endereco[campo] || '';
  }
  construirHorarios(sebo.horario_funcionamento);
  mostrarEstadoLocalizacao(sebo);
};

const recuperarCadastroAposFalha = async (snapshotEnviado, dadosEnviados) => {
  if (recuperacaoEmAndamento) return false;
  recuperacaoEmAndamento = true;
  retryLocation.disabled = true;
  try {
    const { sebo, formularioAlterado } = await recuperarPerfilAposFalha({
      consultarPerfil: async () => requisicaoSebo('sebos/me', {
        token: await usuarioAtual.getIdToken()
      }),
      snapshotEnviado,
      snapshotAtual: () => capturarFormulario(form),
      aplicarPerfil: preencherFormulario,
      atualizarEstado: seboAtual => mostrarEstadoLocalizacao(seboAtual)
    });
    recuperacaoNecessaria = false;
    const salvo = cadastroSalvoCorresponde(sebo, dadosEnviados);
    const mensagem = salvo
      ? 'A alteração foi confirmada no servidor.'
      : 'O cadastro foi consultado, mas não foi possível confirmar se a alteração foi salva.';
    mostrarFeedback(
      feedback,
      formularioAlterado
        ? `${mensagem} Suas alterações ainda não salvas foram preservadas.`
        : mensagem,
      salvo ? 'sucesso' : 'erro'
    );
    return true;
  } catch (erro) {
    console.error('Não foi possível recuperar o estado do cadastro do sebo:', erro);
    recuperacaoNecessaria = true;
    retryLocation.hidden = false;
    retryLocation.textContent = 'Tentar consultar o estado do cadastro novamente';
    mostrarFeedback(
      feedback,
      'Não foi possível confirmar se os dados foram salvos. A consulta ao servidor também falhou; tente consultar novamente. Nenhum novo salvamento foi enviado.',
      'erro'
    );
    mostrarFeedback(
      locationStatus,
      'O estado da localização ainda não pôde ser consultado.',
      'erro'
    );
    return false;
  } finally {
    recuperacaoEmAndamento = false;
    retryLocation.disabled = sincronizacaoEmAndamento || salvamentoEmAndamento;
  }
};

const continuarSincronizacao = async resultadoInicial => {
  if (sincronizacaoEmAndamento || salvamentoEmAndamento) return;
  sincronizacaoEmAndamento = true;
  retryLocation.disabled = true;
  retryLocation.hidden = false;
  saveButton.disabled = true;
  let resultado = resultadoInicial;
  try {
    while (resultado?.status === 'pendente' && resultado.continuar !== false) {
      mostrarFeedback(locationStatus, 'Sincronizando os anúncios em lotes...');
      resultado = await requisicaoSebo('sebos/me/localizacao/sincronizar', {
        method: 'POST',
        token: await usuarioAtual.getIdToken()
      });
    }
    const sebo = await requisicaoSebo('sebos/me', {
      token: await usuarioAtual.getIdToken()
    });
    mostrarEstadoLocalizacao(sebo, resultado?.status === 'erro' ? resultado.erro : '');
  } catch (erro) {
    console.error('Erro ao continuar a sincronização da localização:', erro);
    try {
      const sebo = await requisicaoSebo('sebos/me', {
        token: await usuarioAtual.getIdToken()
      });
      mostrarEstadoLocalizacao(
        sebo,
        'A sincronização foi interrompida. O progresso foi preservado; tente continuar novamente.'
      );
    } catch (erroConsulta) {
      console.error('Não foi possível consultar o estado atual da localização:', erroConsulta);
      mostrarFeedback(
        locationStatus,
        erro.message || 'Não foi possível sincronizar a localização. Tente novamente.',
        'erro'
      );
      retryLocation.hidden = false;
    }
  } finally {
    sincronizacaoEmAndamento = false;
    retryLocation.disabled = salvamentoEmAndamento;
    saveButton.disabled = salvamentoEmAndamento;
  }
};

const atualizarLocalizacao = async () => {
  if (sincronizacaoEmAndamento || salvamentoEmAndamento || recuperacaoEmAndamento) return;
  if (recuperacaoNecessaria) {
    await recuperarCadastroAposFalha(snapshotPatchFalho.snapshot, snapshotPatchFalho.dados);
    return;
  }
  mostrarFeedback(locationStatus, 'Continuando a sincronização da localização...');
  await continuarSincronizacao({ status: 'pendente' });
};

document.getElementById('addPhone').addEventListener('click', () => adicionarTelefone());
retryLocation.addEventListener('click', atualizarLocalizacao);

form.addEventListener('submit', async evento => {
  evento.preventDefault();
  if (salvamentoEmAndamento || sincronizacaoEmAndamento) return;
  if (!form.reportValidity()) return;

  let horario_funcionamento;
  try {
    horario_funcionamento = construirHorariosPayload();
  } catch (erro) {
    mostrarFeedback(feedback, erro.message, 'erro');
    return;
  }

  const telefones = [...phonesList.querySelectorAll('[data-phone]')]
    .map(input => input.value.trim())
    .filter(Boolean);
  if (!telefones.length ||
      telefones.some(telefone => ![10, 11].includes(telefone.replace(/\D/g, '').length))) {
    mostrarFeedback(feedback, 'Informe ao menos um telefone válido com DDD.', 'erro');
    return;
  }
  const endereco = Object.fromEntries(
    ['rua', 'numero', 'complemento', 'bairro', 'cidade', 'estado', 'cep']
      .map(campo => [campo, document.getElementById(campo).value.trim()])
  );
  const dados = {
    nome: document.getElementById('seboName').value.trim(),
    telefone: telefones,
    endereco,
    horario_funcionamento
  };

  const snapshotEnviado = capturarFormulario(form);
  salvamentoEmAndamento = true;
  saveButton.disabled = true;
  retryLocation.disabled = true;
  mostrarFeedback(feedback, 'Salvando os dados do estabelecimento...');
  try {
    const sebo = await requisicaoSebo('sebos/me', {
      method: 'PATCH',
      token: await usuarioAtual.getIdToken(),
      body: JSON.stringify(dados)
    });
    mostrarFeedback(feedback, 'Dados do estabelecimento salvos.', 'sucesso');
    const formularioAlterado = capturarFormulario(form) !== snapshotEnviado;
    if (formularioAlterado) {
      mostrarFeedback(
        feedback,
        'Os dados enviados foram salvos. Alterações feitas durante o salvamento permanecem no formulário e ainda não foram enviadas.',
        'sucesso'
      );
    }
    if (sebo.sincronizacaoLocalizacao?.status === 'pendente') {
      salvamentoEmAndamento = false;
      await continuarSincronizacao(sebo.sincronizacaoLocalizacao);
    } else {
      mostrarEstadoLocalizacao(sebo, sebo.sincronizacaoLocalizacao?.erro || '');
    }
  } catch (erro) {
    console.error('Erro ao atualizar o cadastro do sebo:', erro);
    if (ehFalhaDeRede(erro)) {
      snapshotPatchFalho = { snapshot: snapshotEnviado, dados };
      recuperacaoNecessaria = true;
      await recuperarCadastroAposFalha(snapshotEnviado, dados);
    } else {
      mostrarFeedback(feedback, erro.message || 'Não foi possível salvar os dados.', 'erro');
    }
  } finally {
    salvamentoEmAndamento = false;
    saveButton.disabled = sincronizacaoEmAndamento;
    retryLocation.disabled = sincronizacaoEmAndamento;
  }
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
    if (perfil.tipoConta === 'subconta') {
      window.location.replace('../index.html');
      return;
    }
    const sebo = await requisicaoSebo('sebos/me', {
      token: await usuario.getIdToken()
    });
    preencherFormulario(sebo);
    saveButton.disabled = false;
  } catch (erro) {
    console.error('Não foi possível carregar o cadastro do sebo:', erro);
    if (erro.status === 401 || erro.status === 403) {
      limparSessaoSebo();
      await signOut(auth);
      window.location.replace('./login.html');
      return;
    }
    mostrarFeedback(feedback, erro.message || 'Não foi possível carregar os dados do sebo.', 'erro');
  }
};

iniciar();
