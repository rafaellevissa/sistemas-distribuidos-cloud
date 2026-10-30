'use strict';

const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

const source = process.env.GOOGLE_GHA_CREDS_PATH;
if (!source || !process.env.GITHUB_ENV) throw new Error('Expected GitHub OIDC credential file and environment file');
const directory = path.join(root, '.platform');
fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
fs.chmodSync(directory, 0o700);
const destination = path.join(directory, 'oidc-credentials.json');
fs.renameSync(source, destination);
fs.chmodSync(destination, 0o600);
for (const key of ['GOOGLE_GHA_CREDS_PATH', 'GOOGLE_APPLICATION_CREDENTIALS', 'CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE']) {
  process.env[key] = destination;
  fs.appendFileSync(process.env.GITHUB_ENV, `${key}=${destination}\n`);
}