const { Router } = require('express');
const multer = require('multer');

function createUploadRouter({ storage }) {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, callback) => {
      if (!file.mimetype.startsWith('image/')) {
        return callback(new Error('Apenas ficheiros de imagem são permitidos'));
      }
      callback(null, true);
    },
  });

  router.post('/', upload.single('imagem'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ mensagem: 'Nenhum ficheiro enviado.' });
    }

    const file = req.file;
    const fileName = `${Date.now()}_${file.originalname}`;
    try {
      await storage.upload({ key: fileName, body: file.buffer, contentType: file.mimetype });
      const url = await storage.getReadUrl({ key: fileName, expiresIn: 3600 });
      res.status(200).json({ mensagem: 'Upload realizado com sucesso!', url, key: fileName });
    } catch (error) {
      console.error('Erro no upload para o storage:', error);
      res.status(500).json({ mensagem: 'Erro interno no servidor', erro: error.message });
    }
  });

  return router;
}

module.exports = { createUploadRouter };