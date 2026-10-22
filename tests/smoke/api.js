const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

function apiUrl(value) {
  if (!value) throw new Error('Provide an HTTPS API URL as the first argument or SMOKE_API_URL/API_BASE_URL/API_URL');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('API URL must use HTTPS without credentials, query or fragment');
  }
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}

async function runSmoke(value, { fetchImpl = fetch, timeoutMs = 15000, log = console.log } = {}) {
  const base = apiUrl(value);
  assert.ok(Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 60000, 'timeoutMs must be between 1 and 60000');
  async function send(url, options = {}, expected = 200, binary = false) {
    const response = await fetchImpl(url, {
      ...options, redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
    });
    assert.equal(response.status, expected, `${options.method || 'GET'} ${new URL(url).pathname}: unexpected status`);
    if (expected === 204) {
      await response.arrayBuffer();
      return undefined;
    }
    return binary ? Buffer.from(await response.arrayBuffer()) : response.json();
  }
  const endpoint = (route) => new URL(route, base);
  const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const email = `smoke-${randomUUID()}@example.test`;
  let id;
  let primaryError;
  try {
    assert.deepEqual(await send(base), { mensagem: 'API funcionando!' });
    const created = await send(endpoint('usuarios'), json('POST', { nome: 'Smoke test', email }), 201);
    assert.ok(Number.isInteger(created.id), 'Created user must have an integer ID');
    id = created.id;
    assert.equal(created.email, email);
    const users = await send(endpoint('usuarios'));
    assert.ok(users.some((user) => user.id === id));
    const user = await send(endpoint(`usuarios/${id}`));
    assert.equal(user.email, email);
    const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
    const form = new FormData();
    form.append('imagem', new Blob([image], { type: 'image/png' }), 'smoke.png');
    const uploaded = await send(endpoint('upload'), { method: 'POST', body: form });
    assert.equal(uploaded.mensagem, 'Upload realizado com sucesso!');
    assert.equal(typeof uploaded.key, 'string');
    assert.ok(uploaded.key.length > 0);
    const readUrl = new URL(uploaded.url);
    assert.equal(readUrl.protocol, 'https:', 'Signed read URL must use HTTPS');
    assert.ok(!readUrl.username && !readUrl.password, 'Signed read URL must not contain credentials');
    assert.deepEqual(await send(readUrl, {}, 200, true), image);
    const photoUrl = new URL(readUrl.pathname, readUrl.origin).href;
    assert.deepEqual(await send(endpoint(`usuarios/${id}`), json('PUT', {
      nome: 'Smoke updated', email, foto_url: photoUrl,
    })), { mensagem: 'Usuario atualizado com sucesso' });
    const updated = await send(endpoint(`usuarios/${id}`));
    assert.equal(updated.nome, 'Smoke updated');
    assert.equal(updated.foto_url, photoUrl);
    await send(endpoint(`usuarios/${id}`), { method: 'DELETE' }, 204);
    const removedId = id;
    id = undefined;
    assert.deepEqual(await send(endpoint(`usuarios/${removedId}`), {}, 404), { mensagem: 'Usuario nao encontrado' });
    log(`Smoke passed: CRUD, upload and anonymous signed read. Uploaded object: ${uploaded.key} (bucket lifecycle cleanup required).`);
    return { key: uploaded.key };
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    if (id !== undefined) {
      try {
        await send(endpoint(`usuarios/${id}`), { method: 'DELETE' }, 204);
      } catch (error) {
        if (!primaryError) throw error;
        log(`User cleanup failed for ID ${id}: ${error.message}`);
      }
    }
  }
}

if (require.main === module) {
  runSmoke(process.argv[2] || process.env.SMOKE_API_URL || process.env.API_BASE_URL || process.env.API_URL).catch((error) => {
    console.error(`Smoke failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { apiUrl, runSmoke };