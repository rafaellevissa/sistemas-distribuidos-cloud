'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { loadConfig } = require('../platform/cli/src/config');
const { ROOT } = require('../platform/cli/src/paths');
const { hash } = require('../platform/cli/src/platform');

const config = loadConfig({ target: 'gcp', environment: process.env.ENVIRONMENT });
const metadata = JSON.parse(fs.readFileSync(path.join(ROOT, '.platform/build.json'), 'utf8'));
const digest = metadata['containerimage.digest'];
if (!/^sha256:[a-f0-9]{64}$/.test(digest || '')) throw new Error('Build did not return an immutable digest');
if (!/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA || '')) throw new Error('Expected full repository commit');
if (!/^[1-9][0-9]*$/.test(process.env.SECRET_VERSION || '') || !Number.isSafeInteger(Number(process.env.SECRET_VERSION))) throw new Error('Invalid secret version');
if (!new RegExp(`^${config.region}-docker\\.pkg\\.dev/${config.projectId}/[a-z][a-z0-9-]*/api$`).test(process.env.IMAGE || '')) throw new Error('Invalid image repository');
const image = `${process.env.IMAGE}@${digest}`;
const descriptor = { schemaVersion: 1, target: 'gcp', environment: config.environment, commit: process.env.GITHUB_SHA, image, configHash: hash(config), runtimeSecretVersion: Number(process.env.SECRET_VERSION), schemaGate: 'not-implemented', applied: false };
fs.writeFileSync(path.join(ROOT, '.platform/release.json'), JSON.stringify(descriptor, null, 2) + '\n', { mode: 0o600 });
fs.appendFileSync(process.env.GITHUB_OUTPUT, `image=${image}\n`);