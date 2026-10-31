# Como buildar o app

O projeto já contém o `package.json` e a configuração do Capacitor em `capacitor.config.json`, com os arquivos web gerados em `dist/`. Por isso, não execute `npm init`, não instale o Capacitor novamente e não rode `npx cap init`: isso poderia substituir as configurações existentes (`appId`, nome e diretório web).

1. Instale o Node.js e, na pasta do projeto, instale as dependências:

   ```sh
   npm install
   ```

2. Na primeira preparação do Android, gere os arquivos web e adicione a plataforma:

   ```sh
   npm run android:add
   ```

   Esse script executa `npm run build` e, em seguida, `cap add android`. É necessário ter o Android Studio e o SDK configurados.

3. Configure o Firebase nativo colocando `google-services.json` em `android/app/`. Depois, sincronize a plataforma:

   ```sh
   npm run cap:sync
   ```

   `cap:sync` executa o build web e sincroniza os arquivos e plugins do Capacitor; não é necessário rodar `cap copy` separadamente.

4. Abra o projeto no Android Studio e compile o APK/AAB:

   ```sh
   npx cap open android
   ```

5. Nas próximas alterações do app, execute `npm run cap:sync` antes de abrir ou compilar novamente no Android Studio.

Para iOS, em um Mac com Xcode, use `npm run ios:add` na primeira preparação. Coloque `GoogleService-Info.plist` no projeto iOS, execute `npm run cap:sync` e abra com `npx cap open ios`.

# Estante Parceiros — Sebos

Frontend responsivo para cadastro e autenticação de sebos da Estante de Babel. A interface usa HTML, CSS, JavaScript e componentes Ionic Core; o Firebase Authentication cuida das contas e a API grava os perfis no Firestore.

## Executar na web

1. Configure o Firebase Authentication para aceitar e-mail/senha e Google, e adicione o domínio de hospedagem aos domínios autorizados do Firebase.
2. Inicie o backend na pasta `backend_v6`:

   ```sh
   node server.js
   ```

   O backend local deve estar disponível em `http://localhost:3000`. As configurações do Firebase Admin ficam no `.env` do backend.
3. Sirva esta pasta por HTTP, por exemplo:

   ```sh
   python3 -m http.server 5500
   ```

4. Acesse `http://localhost:5500`. Em `localhost`, o frontend tenta primeiro a API local e usa a API publicada como alternativa se o servidor local não responder. Em outros domínios, usa `https://babel-be-lovat.vercel.app/api`.

Não abra os HTML diretamente com `file://`: os módulos JavaScript e os provedores de autenticação precisam de uma origem HTTP/HTTPS.
Antes de usar os novos endpoints no site publicado, publique/deploy as alterações do repositório `backend_v6` na Vercel.

## Telas

- `index.html`: página inicial da área de parceiros.
- `html/login.html`: gestores entram por e-mail/senha ou Google; colaboradores entram por login ou telefone e senha temporária. O botão **Funcionário** na página inicial abre o acesso dedicado da equipe.
- `html/funcionarios.html`: área provisória protegida para subcontas, com validação da sessão e troca obrigatória da senha temporária no primeiro acesso; a página de trabalho da equipe será construída em seguida.
- `html/cadastrar-livro.html`: formulário de cadastro de livro no acervo do sebo, incluindo gêneros múltiplos, idioma, condição, localização e quantidade em estoque; disponível para gestores e para colaboradores com a permissão `acervo.cadastrar`.
- `html/cadastro.html`: cadastro, validação do CNPJ, preenchimento do endereço por CEP (ViaCEP), telefones, horário semanal e geolocalização opcional.
- `html/subcontas.html`: gestão exclusiva do gestor para criar colaboradores, personalizar permissões, redefinir senhas, reativar e revogar acessos.
- O horário exige pelo menos um dia aberto. Dias fechados são enviados como `null`; os horários são enviados como `abre` e `fecha`.
- O CNPJ é validado no navegador para feedback e novamente no backend. A API é a validação definitiva.
- Colaboradores recebem senha temporária e precisam trocá-la no primeiro login. A revogação bloqueia as rotas protegidas e mantém o cadastro inativo para histórico ou reativação.
- A interface salva permissões de acervo, negociações e financeiro. As rotas atuais do app de usuários rejeitam tokens de colaboradores; as operações comerciais de acervo/vendas/financeiro para sebos ainda precisam ser implementadas e ligadas a essas permissões.

## Preparar autenticação de colaboradores

O backend exige uma chave dedicada para proteger os CPFs armazenados:

```sh
openssl rand -base64 32
```

Configure o valor como `SUBACCOUNT_ENCRYPTION_KEY` no `.env` local e nas variáveis do projeto Vercel. Use o mesmo valor persistentemente nos ambientes que compartilham o Firestore; não gere uma chave nova sem migrar os CPFs já gravados. O CPF completo nunca é exibido na lista de colaboradores.

## Aplicativo Ionic/Capacitor

As páginas usam Ionic Core como Web Components, mantendo os arquivos HTML/CSS/JavaScript legíveis e responsivos no navegador e em WebViews. O projeto inclui Capacitor e o plugin Firebase Authentication para o login Google nativo.

1. Instale as dependências: `npm install`.
2. Crie o projeto Android com `npm run android:add` ou o projeto iOS com `npm run ios:add`; esses scripts geram os arquivos web antes de adicionar a plataforma.
3. Copie a configuração Firebase da plataforma (`google-services.json` para Android e `GoogleService-Info.plist` para iOS), configure os domínios/autenticação no Firebase e sincronize com `npm run cap:sync`.
npm run android:add

### Cadastrar SHA-1 e SHA-256 no Firebase (Android)

Os fingerprints SHA-1 e SHA-256 identificam o certificado que assina o app. Para obter os fingerprints de desenvolvimento, primeiro gere a plataforma Android, se ainda não existir (`npm run android:add`), e execute o relatório de assinatura na raiz do projeto:

```sh
cd android
./gradlew signingReport
```

No Windows, dentro da pasta `android`, execute:

```bat
gradlew.bat signingReport
```

No resultado, localize a seção `Variant: debug` e copie os valores `SHA1` e `SHA-256`. Se ainda não houver certificado de depuração, gere um build debug no Android Studio ou execute `./gradlew assembleDebug` (Windows: `gradlew.bat assembleDebug`) e rode novamente o relatório.

No Firebase Console, abra **Configurações do projeto > Seus apps**, selecione o app Android com o mesmo identificador de pacote configurado em `android/app/build.gradle` e adicione os dois fingerprints. Para o login Google, confirme também que o provedor Google está habilitado em **Authentication > Provedores de login**. Baixe o `google-services.json` atualizado para esse app, salve-o em `android/app/google-services.json` e execute `npm run cap:sync`.

O `capacitor.config.json` também precisa listar `google.com` em `plugins.FirebaseAuthentication.providers`. Após alterar essa configuração, execute `npm run cap:sync` e gere/instale novamente o app Android; recarregar apenas a página no dispositivo não atualiza a configuração nativa.

Os fingerprints de debug servem para testes locais. Para publicar, cadastre também os fingerprints do certificado de release. Se a distribuição for feita pela Google Play com Play App Signing, use os fingerprints do certificado de assinatura de apps exibidos no Play Console. Não compartilhe nem versione arquivos de chave privada (`.jks`/`.keystore`) ou suas senhas.

O build web continua sendo HTML/CSS/JavaScript e pode ser hospedado estaticamente a partir da raiz do projeto. Para compilar os instaladores nativos, também é necessário ter o Android Studio/SDK ou Xcode instalado e configurado.

O fluxo do aplicativo salva a sessão nos itens `sebo` e `seboToken` do `localStorage`, sem reutilizar as chaves do app de usuários. O endpoint e a estrutura das requisições estão documentados no [README do backend](../../Node/backend_v6/README.md) e no [API.md](./API.md).
