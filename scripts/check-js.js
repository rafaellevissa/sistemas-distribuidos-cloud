'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const excluded = new Set(['node_modules', '.git', '.terraform', '.platform']);

function check(directory) {
  let failed = false;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (excluded.has(entry.name) || entry.isSymbolicLink()) continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) failed = check(filename) || failed;
    else if (/\.(?:js|cjs|mjs)$/.test(entry.name)) {
      const result = spawnSync(process.execPath, ['--check', filename], { stdio: 'inherit', shell: false });
      if (result.error || result.status !== 0) failed = true;
    }
  }
  return failed;
}

process.exitCode = check(root) ? 1 : 0;
if (!process.exitCode) process.stdout.write('JavaScript syntax lint passed (not semantic lint).\n');