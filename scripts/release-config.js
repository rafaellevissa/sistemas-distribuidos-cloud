'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { loadConfig } = require('../platform/cli/src/config');
const { ROOT } = require('../platform/cli/src/paths');

const config = loadConfig({ target: 'gcp', environment: process.env.ENVIRONMENT });
const repository = process.env.ARTIFACT_REPOSITORY;
if (!/^[a-z][a-z0-9-]{0,62}$/.test(repository || '')) throw new Error('Set GCP_ARTIFACT_REPOSITORY to the existing immutable-tag repository ID');
if (!/^[1-9][0-9]*$/.test(process.env.SECRET_VERSION || '') || !Number.isSafeInteger(Number(process.env.SECRET_VERSION))) throw new Error('SECRET_VERSION must be a positive safe integer');
const directory = path.join(ROOT, '.platform');
fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
fs.chmodSync(directory, 0o700);
const registry = `${config.region}-docker.pkg.dev`;
fs.appendFileSync(process.env.GITHUB_OUTPUT, `registry=${registry}\nimage=${registry}/${config.projectId}/${repository}/api\n`);