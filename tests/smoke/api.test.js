const test = require('node:test');
const assert = require('node:assert/strict');
const { apiUrl, runSmoke } = require('./api');

test('smoke requires an HTTPS URL without embedded credentials or query', () => {
  for (const value of [undefined, 'http://localhost:3000', 'https://user:password@example.test', 'https://example.test?secret=x', 'https://example.test/#fragment']) {
    assert.throws(() => apiUrl(value));
  }
  assert.equal(apiUrl('https://example.test/api').href, 'https://example.test/api/');
});

test('demo HTTP requires explicit opt-in and still rejects unsafe URLs', () => {
  assert.equal(apiUrl('http://127.0.0.1', { allowHttp: true }).href, 'http://127.0.0.1/');
  for (const value of ['ftp://example.test', 'http://user:password@example.test', 'http://example.test?secret=x']) {
    assert.throws(() => apiUrl(value, { allowHttp: true }));
  }
});

for (const protocol of ['https', 'http']) {
test(`smoke verifies ${protocol.toUpperCase()} CRUD, upload and HTTPS signed read with bounded requests`, async () => {
  let image;
  let deleted = false;
  const calls = [];
  const signed = 'https://objects.example.test/smoke.png?signature=opaque';
  const fetchImpl = async (url, options) => {
    calls.push({ url: url.href, method: options.method || 'GET' });
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers?.Authorization, undefined);
    const route = url.pathname;
    if (url.hostname === 'objects.example.test') return new Response(image);
    if (route === '/upload') {
      image = Buffer.from(await options.body.get('imagem').arrayBuffer());
      return Response.json({ mensagem: 'Upload realizado com sucesso!', url: signed, key: 'smoke.png' });
    }
    if (route === '/') return Response.json({ mensagem: 'API funcionando!' });
    if (options.method === 'POST') {
      const body = JSON.parse(options.body);
      fetchImpl.user = { id: 42, ...body };
      return Response.json(fetchImpl.user, { status: 201 });
    }
    if (options.method === 'PUT') {
      fetchImpl.user = { ...fetchImpl.user, ...JSON.parse(options.body) };
      return Response.json({ mensagem: 'Usuario atualizado com sucesso' });
    }
    if (options.method === 'DELETE') {
      deleted = true;
      return new Response(null, { status: 204 });
    }
    if (route === '/usuarios') return Response.json([fetchImpl.user]);
    return deleted ? Response.json({ mensagem: 'Usuario nao encontrado' }, { status: 404 }) : Response.json(fetchImpl.user);
  };
  assert.deepEqual(await runSmoke(`${protocol}://api.example.test`, { fetchImpl, allowHttp: protocol === 'http', log() {} }), { key: 'smoke.png' });
  assert.ok(calls.some((call) => call.url === signed));
  assert.equal(deleted, true);
});
}

test('smoke cleans up created users when a later step fails', async () => {
  let deleted = false;
  const fetchImpl = async (url, options) => {
    if (options.method === 'DELETE') {
      deleted = true;
      return new Response(null, { status: 204 });
    }
    if (options.method === 'POST') {
      return Response.json({ id: 42, email: JSON.parse(options.body).email }, { status: 201 });
    }
    if (url.pathname === '/') return Response.json({ mensagem: 'API funcionando!' });
    throw new Error('dependency unavailable');
  };
  await assert.rejects(runSmoke('https://api.example.test', { fetchImpl, log() {} }), /dependency unavailable/);
  assert.equal(deleted, true);
});