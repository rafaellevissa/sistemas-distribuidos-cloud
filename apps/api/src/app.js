require('dotenv').config();
const express = require('express');
const cors = require('cors');
const usuariosRoutes = require('./routes/usuarios.routes');
const { createUploadRouter } = require('./routes/upload.routes');
const { createStorage } = require('./storage');
const requestLogger = require('./middlewares/request-logger');

function createApp({ storage = createStorage() } = {}) {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(requestLogger());
  app.get('/', (req, res) => {
    res.json({ mensagem: 'API funcionando!' });
  });
  app.use('/usuarios', usuariosRoutes);
  app.use('/upload', createUploadRouter({ storage }));
  app.use((err, req, res, next) => {
    console.error(err);
    const message = err.code === 'LIMIT_UNEXPECTED_FILE' ? 'Unexpected field' : err.message;
    res.status(400).json({ mensagem: message || 'Erro na requisicao' });
  });
  return app;
}

module.exports = { createApp };