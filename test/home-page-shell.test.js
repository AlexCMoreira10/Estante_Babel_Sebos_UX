import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const raiz = new URL('../', import.meta.url);

test('homepage source and Capacitor dist expose the auth status before loading home.js', async () => {
  const [sourceHtml, distHtml, homeJs] = await Promise.all([
    readFile(new URL('index.html', raiz), 'utf8'),
    readFile(new URL('dist/index.html', raiz), 'utf8'),
    readFile(new URL('dist/js/home.js', raiz), 'utf8')
  ]);

  for (const html of [sourceHtml, distHtml]) {
    assert.match(html, /<body data-home-auth-state="loading">/);
    assert.match(
      html,
      /<div id="homeAuthStatus" class="home-auth-status" role="status" aria-live="polite" aria-atomic="true">/
    );
    assert.match(html, /Verificando sua sessão\.\.\./);
    assert.ok(
      html.indexOf('id="homeAuthStatus"') < html.lastIndexOf('src="./js/home.js"')
    );
  }

  assert.match(homeJs, /getElementById\('homeAuthStatus'\)/);
  assert.match(homeJs, /onAuthStateChanged\(auth/);
});

test('homepage auth states gate public content until authentication resolves', async () => {
  const [sourceCss, distCss] = await Promise.all([
    readFile(new URL('css/Main.css', raiz), 'utf8'),
    readFile(new URL('dist/css/Main.css', raiz), 'utf8')
  ]);

  for (const css of [sourceCss, distCss]) {
    assert.match(css, /body\[data-home-auth-state="loading"\] \.home-main/);
    assert.match(css, /body\[data-home-auth-state="error"\] \.home-main/);
    assert.match(css, /body\[data-home-auth-state="loading"\] \.home-auth-status/);
    assert.match(css, /body\[data-home-auth-state="error"\] \.home-auth-status/);
  }
});
