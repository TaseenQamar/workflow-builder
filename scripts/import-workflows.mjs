#!/usr/bin/env node
/**
 * Import pre-built workflows into a running n8n instance.
 * Usage: N8N_API_KEY=your-key npm run n8n:import
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const N8N_API_URL = process.env.N8N_API_URL || 'http://localhost:5678/api/v1';
const N8N_API_KEY = process.env.N8N_API_KEY || '';

const workflowsDir = join(__dirname, '..', 'n8n', 'workflows');
const files = readdirSync(workflowsDir).filter((f) => f.endsWith('.json'));

const headers = {
  'Content-Type': 'application/json',
  ...(N8N_API_KEY ? { 'X-N8N-API-KEY': N8N_API_KEY } : {}),
};

async function importWorkflow(file) {
  const raw = readFileSync(join(workflowsDir, file), 'utf-8');
  const workflow = JSON.parse(raw);

  const res = await fetch(`${N8N_API_URL}/workflows`, {
    method: 'POST',
    headers,
    body: JSON.stringify(workflow),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to import ${file}: ${res.status} ${err}`);
  }

  const created = await res.json();

  const activateRes = await fetch(
    `${N8N_API_URL}/workflows/${created.id}/activate`,
    { method: 'POST', headers },
  );

  if (!activateRes.ok) {
    console.warn(`  ⚠ Imported but could not activate ${workflow.name}`);
  }

  return created;
}

async function main() {
  console.log(`Importing ${files.length} workflows to ${N8N_API_URL}...\n`);

  if (!N8N_API_KEY) {
    console.log(
      'Tip: Set N8N_API_KEY for authenticated imports (Settings → API in n8n UI)\n',
    );
  }

  for (const file of files) {
    try {
      const created = await importWorkflow(file);
      console.log(`  ✓ ${created.name} (id: ${created.id})`);
    } catch (err) {
      console.error(`  ✗ ${file}: ${err.message}`);
    }
  }

  console.log('\nDone. Open http://localhost:5678 to view workflows.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
