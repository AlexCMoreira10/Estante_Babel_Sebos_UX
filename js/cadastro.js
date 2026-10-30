import {
  auth,
  createUserWithEmailAndPassword,
  entrarComGoogle,
  mensagemErroFirebase,
  requisicaoSebo,
  salvarSessaoSebo,
  signOut
} from './firebase.js';

const form = document.getElementById('registerForm');
const submitButton = document.getElementById('registerSubmit');
const feedback = document.getElementById('registerFeedback');
const phoneList = document.getElementById('phonesList');
const cepInput = document.getElementById('cep');
const cepFeedback = document.getElementById('cepFeedback');
const cnpjInput = document.getElementById('cnpj');
const emailInput = document.getElementById('email');
const senhaInput = document.getElementById('senha');
const confirmarSenhaInput = document.getElementById('confirmarSenha');
const passwordFields = document.getElementById('passwordFields');
const googleAccountNote = document.getElementById('googleAccountNote');
const cancelGoogleSignup = document.getElementById('cancelGoogleSignup');
const googleSignup = document.getElementById('googleSignup');
const lookupCepButton = document.getElementById('lookupCep');
const locationButton = document.getElementById('useLocation');
const locationFeedback = document.getElementById('locationFeedback');
let usuarioGoogle = null;
let cepConsultado = '';

const mostrarFeedback = (mensagem, tipo = '') => {
  feedback.textContent = mensagem;
  feedback.classList.toggle('erro', tipo === 'erro');
  feedback.classList.toggle('sucesso', tipo === 'sucesso');
};

const mostrarStatusCampo = (elemento, mensagem, tipo = '') => {
  elemento.textContent = mensagem;
  elemento.classList.toggle('erro', tipo === 'erro');
  elemento.classList.toggle('sucesso', tipo === 'sucesso');
};

const validarCnpj = (valor) => {
  const cnpj = valor.replace(/[./\-\s]/g, '').toUpperCase();
  if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj) || /^(.)\1+$/.test(cnpj)) return false;

  const calcularDigito = (base, pesos) => {
    const soma = [...base].reduce(
      (total, caractere, indice) => total + (caractere.charCodeAt(0) - 48) * pesos[indice],
      0
    );
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const primeiro = calcularDigito(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const segundo = calcularDigito(cnpj.slice(0, 12) + primeiro, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cnpj.endsWith(`${primeiro}${segundo}`);
};

const formatarCnpj = (valor) => {
  const texto = valor.replace(/[^a-z\d]/gi, '').toUpperCase().slice(0, 14);
  if (texto.length <= 2) return texto;
  if (texto.length <= 5) return `${texto.slice(0, 2)}.${texto.slice(2)}`;
  if (texto.length <= 8) return `${texto.slice(0, 2)}.${texto.slice(2, 5)}.${texto.slice(5)}`;
  if (texto.length <= 12) return `${texto.slice(0, 2)}.${texto.slice(2, 5)}.${texto.slice(5, 8)}/${texto.slice(8)}`;
  return `${texto.slice(0, 2)}.${texto.slice(2, 5)}.${texto.slice(5, 8)}/${texto.slice(8, 12)}-${texto.slice(12)}`;
};

const obterTelefones = () => Array.from(phoneList.querySelectorAll('input[name="telefone"]'))
  .map((input) => input.value.trim())
  .filter(Boolean);

const obterHorario = () => {
  const horario = {};
  const dias = Array.from(form.querySelectorAll('[data-day]'));
  if (!dias.some((dia) => dia.checked)) {
    throw new Error('Selecione pelo menos um dia de funcionamento.');
  }

  for (const dia of dias) {
    const nome = dia.dataset.day;
    if (!dia.checked) {
      horario[nome] = null;
      continue;
    }

    const abre = form.querySelector(`[data-open="${nome}"]`).value;
    const fecha = form.querySelector(`[data-close="${nome}"]`).value;
    if (!abre || !fecha || abre >= fecha) {
      throw new Error(`Confira os horários de abertura e fechamento de ${dia.parentElement.innerText.trim()}.`);
    }
    horario[nome] = { abre, fecha };
  }

  return horario;
};

const obterGeocode = () => {
  const longitudeInput = document.getElementById('longitude');
  const latitudeInput = document.getElementById('latitude');
  const longitudeVazia = !longitudeInput.value.trim();
  const latitudeVazia = !latitudeInput.value.trim();
  if (longitudeVazia && latitudeVazia) return undefined;
  if (longitudeVazia || latitudeVazia) {
    throw new Error('Informe longitude e latitude juntas ou deixe os dois campos em branco.');
  }

  const longitude = longitudeInput.valueAsNumber;
  const latitude = latitudeInput.valueAsNumber;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error('A longitude deve estar entre -180 e 180 graus.');
  }
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error('A latitude deve estar entre -90 e 90 graus.');
  }
  return { type: 'Point', coordinates: [longitude, latitude] };
};

const construirCadastro = () => {
  const cnpjValido = validarCnpj(cnpjInput.value);
  cnpjInput.setCustomValidity(cnpjValido ? '' : 'Informe um CNPJ válido.');
  if (!cnpjValido) {
    cnpjInput.reportValidity();
    throw new Error('Confira o CNPJ informado.');
  }

  if (!usuarioGoogle && senhaInput.value !== confirmarSenhaInput.value) {
    confirmarSenhaInput.setCustomValidity('As senhas não coincidem.');
    confirmarSenhaInput.reportValidity();
    throw new Error('As senhas não coincidem.');
  }
  confirmarSenhaInput.setCustomValidity('');

  const telefones = obterTelefones();
  if (!telefones.length || telefones.some((telefone) => ![10, 11].includes(telefone.replace(/\D/g, '').length))) {
    throw new Error('Informe ao menos um telefone válido com DDD.');
  }

  const endereco = {
    rua: document.getElementById('rua').value.trim(),
    numero: document.getElementById('numero').value.trim(),
    complemento: document.getElementById('complemento').value.trim(),
    bairro: document.getElementById('bairro').value.trim(),
    cidade: document.getElementById('cidade').value.trim(),
    estado: document.getElementById('estado').value.trim().toUpperCase(),
    cep: cepInput.value.trim()
  };

  const dados = {
    nome: document.getElementById('nome').value.trim(),
    email: emailInput.value.trim(),
    cnpj: cnpjInput.value.trim(),
    telefone: telefones,
    endereco,
    horario_funcionamento: obterHorario()
  };
  const geocode = obterGeocode();
  if (geocode) dados.geocode = geocode;
  return dados;
};

const adicionarTelefone = () => {
  const linha = document.createElement('div');
  linha.className = 'phone-row';

  const input = document.createElement('input');
  input.name = 'telefone';
  input.type = 'tel';
  input.inputMode = 'tel';
  input.placeholder = 'Outro telefone';
  input.setAttribute('aria-label', 'Telefone adicional');

  const remover = document.createElement('button');
  remover.type = 'button';
  remover.className = 'remove-phone';
  remover.textContent = 'Remover';
  remover.setAttribute('aria-label', 'Remover telefone');
  linha.append(input, remover);
  phoneList.append(linha);
  input.focus();
};

const preencherEndereco = (dados) => {
  const valores = {
    cep: dados.cep,
    rua: dados.logradouro,
    complemento: dados.complemento,
    bairro: dados.bairro,
    cidade: dados.localidade,
    estado: dados.uf
  };

  for (const [id, valor] of Object.entries(valores)) {
    const campo = document.getElementById(id);
    if (valor && (id !== 'complemento' || !campo.value.trim())) campo.value = valor;
  }
};

const consultarCep = async () => {
  const cep = cepInput.value.replace(/\D/g, '');
  if (cep.length !== 8) {
    mostrarStatusCampo(cepFeedback, 'Digite um CEP com 8 números.', 'erro');
    return;
  }
  if (cepConsultado === cep) return;

  lookupCepButton.disabled = true;
  mostrarStatusCampo(cepFeedback, 'Consultando o ViaCEP...');
  try {
    const resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    if (!resposta.ok) throw new Error(`O ViaCEP retornou HTTP ${resposta.status}.`);
    const dados = await resposta.json();
    if (dados.erro) {
      mostrarStatusCampo(cepFeedback, 'CEP não encontrado. Confira o número ou preencha o endereço manualmente.', 'erro');
      return;
    }

    preencherEndereco(dados);
    cepConsultado = cep;
    mostrarStatusCampo(cepFeedback, 'Endereço preenchido. Você ainda pode editar os campos.', 'sucesso');
  } catch (erro) {
    console.error('Erro ao consultar o ViaCEP:', erro);
    mostrarStatusCampo(cepFeedback, 'Não foi possível consultar o CEP. Verifique a conexão ou preencha o endereço manualmente.', 'erro');
  } finally {
    lookupCepButton.disabled = false;
  }
};

const obterMensagemLocalizacao = (erro) => {
  if (erro.code === 1) return 'Permissão negada. Autorize a localização nas configurações do navegador ou dispositivo.';
  if (erro.code === 2) return 'A localização não está disponível. Confira o sinal/GPS e tente novamente.';
  if (erro.code === 3) return 'A localização demorou demais para ser obtida. Tente novamente.';
  return 'Não foi possível obter a localização. Você pode informar as coordenadas manualmente.';
};

const usarLocalizacao = () => {
  if (!window.isSecureContext) {
    mostrarStatusCampo(locationFeedback, 'A localização automática exige HTTPS (ou localhost).', 'erro');
    return;
  }
  if (!navigator.geolocation) {
    mostrarStatusCampo(locationFeedback, 'Este navegador não oferece suporte à localização.', 'erro');
    return;
  }

  locationButton.disabled = true;
  locationButton.textContent = 'Obtendo localização...';
  mostrarStatusCampo(locationFeedback, 'Aguardando autorização e posição do dispositivo...');
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      document.getElementById('longitude').value = String(coords.longitude);
      document.getElementById('latitude').value = String(coords.latitude);
      mostrarStatusCampo(locationFeedback, 'Coordenadas preenchidas. Você ainda pode editá-las.', 'sucesso');
      finalizarLocalizacao();
    },
    (erro) => {
      console.warn('Não foi possível obter a localização do sebo:', erro);
      mostrarStatusCampo(locationFeedback, obterMensagemLocalizacao(erro), 'erro');
      finalizarLocalizacao();
    },
    { enableHighAccuracy: false, maximumAge: 60000, timeout: 15000 }
  );
};

const finalizarLocalizacao = () => {
  locationButton.disabled = false;
  locationButton.innerHTML = '<ion-icon name="locate-outline"></ion-icon> Usar localização atual';
};

const ativarDia = (checkbox) => {
  const { day } = checkbox.dataset;
  const abertura = form.querySelector(`[data-open="${day}"]`);
  const fechamento = form.querySelector(`[data-close="${day}"]`);
  abertura.disabled = !checkbox.checked;
  fechamento.disabled = !checkbox.checked;
  abertura.required = checkbox.checked;
  fechamento.required = checkbox.checked;
  if (checkbox.checked) {
    abertura.value ||= '09:00';
    fechamento.value ||= '18:00';
  } else {
    abertura.value = '';
    fechamento.value = '';
  }
};

const configurarContaGoogle = (usuario) => {
  usuarioGoogle = usuario;
  emailInput.value = usuario.email || '';
  emailInput.readOnly = true;
  senhaInput.required = false;
  confirmarSenhaInput.required = false;
  senhaInput.disabled = true;
  confirmarSenhaInput.disabled = true;
  passwordFields.classList.add('google-selected');
  googleAccountNote.classList.remove('hidden');
  cancelGoogleSignup.classList.remove('hidden');
  mostrarFeedback('Conta Google conectada. Complete os dados do estabelecimento e finalize o cadastro.', 'sucesso');
};

const voltarParaEmailSenha = async () => {
  if (usuarioGoogle) await signOut(auth);
  usuarioGoogle = null;
  emailInput.readOnly = false;
  senhaInput.required = true;
  confirmarSenhaInput.required = true;
  senhaInput.disabled = false;
  confirmarSenhaInput.disabled = false;
  senhaInput.value = '';
  confirmarSenhaInput.value = '';
  googleAccountNote.classList.add('hidden');
  cancelGoogleSignup.classList.add('hidden');
  mostrarFeedback('');
};

phoneList.addEventListener('click', (evento) => {
  const botao = evento.target.closest('.remove-phone');
  if (botao) botao.closest('.phone-row').remove();
});

document.getElementById('addPhone').addEventListener('click', adicionarTelefone);
lookupCepButton.addEventListener('click', consultarCep);
cepInput.addEventListener('blur', () => {
  if (cepInput.value.trim()) consultarCep();
});
cepInput.addEventListener('input', () => {
  if (cepInput.value.replace(/\D/g, '') !== cepConsultado) {
    cepConsultado = '';
    mostrarStatusCampo(cepFeedback, '');
  }
});

cnpjInput.addEventListener('input', () => {
  const inicio = cnpjInput.selectionStart;
  const valorAnterior = cnpjInput.value;
  cnpjInput.value = formatarCnpj(valorAnterior);
  const diferenca = cnpjInput.value.length - valorAnterior.length;
  cnpjInput.setSelectionRange(Math.max(0, inicio + diferenca), Math.max(0, inicio + diferenca));
  cnpjInput.setCustomValidity('');
});

form.querySelectorAll('[data-day]').forEach((checkbox) => {
  checkbox.addEventListener('change', () => ativarDia(checkbox));
});

confirmarSenhaInput.addEventListener('input', () => confirmarSenhaInput.setCustomValidity(''));
locationButton.addEventListener('click', usarLocalizacao);
googleSignup.addEventListener('click', async () => {
  googleSignup.disabled = true;
  mostrarFeedback('Conectando à sua conta Google...');
  try {
    configurarContaGoogle(await entrarComGoogle());
  } catch (erro) {
    console.error('Erro ao autenticar cadastro com Google:', erro);
    mostrarFeedback(mensagemErroFirebase(erro), 'erro');
  } finally {
    googleSignup.disabled = false;
  }
});

cancelGoogleSignup.addEventListener('click', async () => {
  await voltarParaEmailSenha();
});

form.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  confirmarSenhaInput.setCustomValidity('');
  if (!form.reportValidity()) return;

  let dados;
  try {
    dados = construirCadastro();
  } catch (erro) {
    mostrarFeedback(erro.message, 'erro');
    return;
  }

  submitButton.disabled = true;
  googleSignup.disabled = true;
  submitButton.textContent = 'Enviando cadastro...';
  mostrarFeedback('Validando as informações e cadastrando seu sebo...');

  try {
    let usuario = usuarioGoogle;
    if (!usuario) {
      const contaAtual = auth.currentUser;
      usuario = contaAtual?.email?.toLowerCase() === dados.email.toLowerCase()
        ? contaAtual
        : (await createUserWithEmailAndPassword(auth, dados.email, senhaInput.value)).user;
    }

    const token = await usuario.getIdToken();
    const perfil = await requisicaoSebo('sebos/cadastro', {
      method: 'POST',
      token,
      body: JSON.stringify(dados)
    });
    await salvarSessaoSebo(usuario, perfil);
    window.location.replace('../index.html?cadastro=concluido');
  } catch (erro) {
    console.error('Erro ao cadastrar sebo:', erro);
    const mensagem = erro.status === 409
      ? erro.message
      : erro.status === 400
        ? erro.message
        : mensagemErroFirebase(erro);
    mostrarFeedback(mensagem, 'erro');
    submitButton.disabled = false;
    googleSignup.disabled = false;
    submitButton.textContent = 'Solicitar cadastro';
  }
});
