const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { randomUUID } = require('node:crypto');
const path = require('node:path');

test('real MySQL schema and CRUD contracts', {
  skip: process.env.INTEGRATION_DB_HOST ? false : 'Set INTEGRATION_DB_HOST to opt in to a disposable MySQL database',
  timeout: 60000,
}, async () => {
  const environment = {
    DB_HOST: process.env.INTEGRATION_DB_HOST,
    DB_PORT: process.env.INTEGRATION_DB_PORT || '3306',
    DB_USER: process.env.INTEGRATION_DB_USER,
    DB_PASSWORD: process.env.INTEGRATION_DB_PASSWORD,
    DB_NAME: 'aula_pratica_db',
  };
  assert.ok(environment.DB_USER, 'INTEGRATION_DB_USER is required');
  assert.ok(environment.DB_PASSWORD, 'INTEGRATION_DB_PASSWORD is required');
  Object.assign(process.env, environment);
  const requireApi = createRequire(path.resolve(__dirname, '../../apps/api/package.json'));
  const request = requireApi('supertest');
  const { applySchema } = require('../../apps/api/src/db/apply-schema');
  await applySchema(environment);
  await applySchema(environment);
  const pool = require('../../apps/api/src/config/db');
  const { createApp } = require('../../apps/api/src/app');
  const app = createApp({ storage: {} });
  const email = `integration-${randomUUID()}@example.test`;
  let id;
  try {
    const created = await request(app).post('/usuarios').send({ nome: 'Integration', email }).expect(201);
    id = created.body.id;
    assert.ok(Number.isInteger(id));
    assert.deepEqual(created.body, { id, nome: 'Integration', email, foto_url: null });
    await request(app).post('/usuarios').send({ nome: 'Duplicate', email }).expect(409, { mensagem: 'Ja existe um usuario com esse email' });
    const list = await request(app).get('/usuarios').expect(200);
    assert.ok(list.body.some((user) => user.id === id));
    const found = await request(app).get(`/usuarios/${id}`).expect(200);
    assert.equal(found.body.email, email);
    assert.ok(found.body.criado_em);
    await request(app).put(`/usuarios/${id}`).send({
      nome: 'Updated integration', email, foto_url: 'https://example.test/photo.png',
    }).expect(200, { mensagem: 'Usuario atualizado com sucesso' });
    const updated = await request(app).get(`/usuarios/${id}`).expect(200);
    assert.equal(updated.body.nome, 'Updated integration');
    assert.equal(updated.body.foto_url, 'https://example.test/photo.png');
    await request(app).delete(`/usuarios/${id}`).expect(204);
    await request(app).get(`/usuarios/${id}`).expect(404, { mensagem: 'Usuario nao encontrado' });
    await request(app).put(`/usuarios/${id}`).send({ nome: 'Missing', email, foto_url: null }).expect(404);
    await request(app).delete(`/usuarios/${id}`).expect(404);
  } finally {
    try {
      if (id !== undefined) await pool.query('DELETE FROM usuarios WHERE id = ?', [id]);
    } finally {
      await pool.end();
    }
  }
});