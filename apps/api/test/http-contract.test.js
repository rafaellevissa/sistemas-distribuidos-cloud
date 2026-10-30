const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const pool = require('../src/config/db');
const { createApp } = require('../src/app');

test('health, CORS and CRUD preserve the original HTTP and SQL contracts', async (context) => {
  const app = createApp({ storage: {} });
  const queries = [];
  let result;
  let failure;
  context.mock.method(pool, 'query', async (sql, values) => {
    queries.push({ sql, values });
    if (failure) throw failure;
    return [result];
  });
  await request(app).get('/').expect('Access-Control-Allow-Origin', '*').expect(200, { mensagem: 'API funcionando!' });
  result = [{ id: 7, nome: 'Ana', email: 'ana@example.test', foto_url: null }];
  await request(app).get('/usuarios').expect(200, result);
  assert.equal(queries.at(-1).sql, 'SELECT id, nome, email, foto_url, criado_em FROM usuarios ORDER BY id DESC');
  await request(app).get('/usuarios/7').expect(200, result[0]);
  assert.deepEqual(queries.at(-1), { sql: 'SELECT * FROM usuarios WHERE id = ?', values: ['7'] });
  result = [];
  await request(app).get('/usuarios/999').expect(404, { mensagem: 'Usuario nao encontrado' });
  await request(app).post('/usuarios').send({ nome: 'Ana' }).expect(400, { mensagem: 'Os campos nome e email sao obrigatorios' });
  result = { insertId: 7 };
  await request(app).post('/usuarios').send({ nome: 'Ana', email: 'ana@example.test' }).expect(201, {
    id: 7, nome: 'Ana', email: 'ana@example.test', foto_url: null,
  });
  assert.deepEqual(queries.at(-1).values, ['Ana', 'ana@example.test', null]);
  failure = Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
  await request(app).post('/usuarios').send({ nome: 'Ana', email: 'ana@example.test' }).expect(409, { mensagem: 'Ja existe um usuario com esse email' });
  failure = undefined;
  result = { affectedRows: 1 };
  await request(app).put('/usuarios/7').send({ nome: 'Bea', email: 'bea@example.test', foto_url: 'https://example.test/photo' }).expect(200, { mensagem: 'Usuario atualizado com sucesso' });
  assert.equal(queries.at(-1).sql, 'UPDATE usuarios SET nome = COALESCE(?, nome), email = COALESCE(?, email), foto_url = COALESCE(?, foto_url) WHERE id = ?');
  assert.deepEqual(queries.at(-1).values, ['Bea', 'bea@example.test', 'https://example.test/photo', '7']);
  await request(app).delete('/usuarios/7').expect(204, '');
  assert.deepEqual(queries.at(-1), { sql: 'DELETE FROM usuarios WHERE id = ?', values: ['7'] });
  result = { affectedRows: 0 };
  await request(app).put('/usuarios/999').send({ nome: 'Bea' }).expect(404, { mensagem: 'Usuario nao encontrado' });
  await request(app).delete('/usuarios/999').expect(404, { mensagem: 'Usuario nao encontrado' });
  failure = new Error('database unavailable');
  for (const [method, url, payload] of [
    ['get', '/usuarios'], ['get', '/usuarios/7'],
    ['post', '/usuarios', { nome: 'Ana', email: 'ana@example.test' }],
    ['put', '/usuarios/7', { nome: 'Ana' }], ['delete', '/usuarios/7'],
  ]) {
    const operation = request(app)[method](url);
    if (payload) operation.send(payload);
    await operation.expect(500, { mensagem: 'Erro interno no servidor', erro: failure.message });
  }
});

test('upload preserves imagem, 5 MiB image filter, response and 3600 second TTL', async () => {
  const uploads = [];
  const reads = [];
  let failure;
  const app = createApp({ storage: {
    async upload(input) { if (failure === 'upload') throw new Error('upload denied'); uploads.push(input); },
    async getReadUrl(input) { if (failure === 'sign') throw new Error('sign denied'); reads.push(input); return 'https://example.test/signed'; },
  } });
  await request(app).post('/upload').expect(400, { mensagem: 'Nenhum ficheiro enviado.' });
  await request(app).post('/upload').attach('imagem', Buffer.from('text'), { filename: 'file.txt', contentType: 'text/plain' }).expect(400, { mensagem: 'Apenas ficheiros de imagem são permitidos' });
  await request(app).post('/upload').attach('other', Buffer.from('image'), 'photo.png').expect(400, { mensagem: 'Unexpected field' });
  await request(app).post('/upload').attach('imagem', Buffer.alloc(5 * 1024 * 1024 + 1), 'photo.png').expect(400, { mensagem: 'File too large' });
  assert.equal(uploads.length, 0);
  const body = Buffer.from('image');
  const response = await request(app).post('/upload').attach('imagem', body, 'photo.png').expect(200);
  assert.match(response.body.key, /^\d+_photo\.png$/);
  assert.deepEqual(response.body, { mensagem: 'Upload realizado com sucesso!', url: 'https://example.test/signed', key: response.body.key });
  assert.deepEqual(uploads[0], { key: response.body.key, body, contentType: 'image/png' });
  assert.deepEqual(reads[0], { key: response.body.key, expiresIn: 3600 });
  await request(app).post('/upload').attach('imagem', Buffer.alloc(5 * 1024 * 1024 - 1), 'limit.png').expect(200);
  for (const stage of ['upload', 'sign']) {
    failure = stage;
    await request(app).post('/upload').attach('imagem', body, 'photo.png').expect(500, {
      mensagem: 'Erro interno no servidor', erro: `${stage} denied`,
    });
  }
});