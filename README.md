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
- `html/login.html`: login por e-mail/senha ou Google, consulta do perfil e redefinição de senha.
- `html/cadastro.html`: cadastro, validação do CNPJ, preenchimento do endereço por CEP (ViaCEP), telefones, horário semanal e geolocalização opcional.
- O horário exige pelo menos um dia aberto. Dias fechados são enviados como `null`; os horários são enviados como `abre` e `fecha`.
- O CNPJ é validado no navegador para feedback e novamente no backend. A API é a validação definitiva.

## Aplicativo Ionic/Capacitor

As páginas usam Ionic Core como Web Components, mantendo os arquivos HTML/CSS/JavaScript legíveis e responsivos no navegador e em WebViews. O projeto inclui Capacitor e o plugin Firebase Authentication para o login Google nativo.

1. Instale as dependências: `npm install`.
2. Gere a cópia web em `dist/`: `npm run build`.
3. Crie o projeto Android com `npm run android:add` ou o projeto iOS com `npm run ios:add`.
4. Copie a configuração Firebase da plataforma (`google-services.json` para Android e `GoogleService-Info.plist` para iOS), configure os domínios/autenticação no Firebase e sincronize com `npm run cap:sync`.

O build web continua sendo HTML/CSS/JavaScript e pode ser hospedado estaticamente a partir da raiz do projeto. Para compilar os instaladores nativos, também é necessário ter o Android Studio/SDK ou Xcode instalado e configurado.

O fluxo do aplicativo salva a sessão nos itens `sebo` e `seboToken` do `localStorage`, sem reutilizar as chaves do app de usuários. O endpoint e a estrutura das requisições estão documentados no [README do backend](../../Node/backend_v6/README.md) e no [API.md](./API.md).
