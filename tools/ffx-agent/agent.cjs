#!/usr/bin/env node
// Read-only Steam FFX process detector + authenticated Twitch Chaos dry-run bridge.
// This script NEVER opens, patches or writes to the game's memory.
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const token = process.env.CHAOS_AGENT_TOKEN || '';
const server = process.env.CHAOS_SERVER_ORIGIN || 'https://leonifelheim.tv';
const INTERVAL_MS = 2200;
const API_TIMEOUT_MS = 6000;
let stopping = false;

if (process.platform !== 'win32') {
  process.stderr.write('El conector necesita Windows (para detectar FFX.exe).\n');
  process.exitCode = 1;
  return;
}
if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
  process.stderr.write('Falta CHAOS_AGENT_TOKEN. Cópialo de /admin/chaos al archivo .env y abre start.bat.\n');
  process.exitCode = 1;
  return;
}

let origin;
try {
  const url = new URL(server);
  if (url.protocol !== 'https:' || url.origin !== server) throw new Error('origin');
  origin = url.origin;
} catch {
  process.stderr.write('CHAOS_SERVER_ORIGIN debe ser un origen HTTPS sin barra final.\n');
  process.exitCode = 1;
  return;
}

async function request(endpoint, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const response = await fetch(origin + endpoint, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    if (response.status === 401) throw new Error('Clave rechazada. Genera una nueva en el panel de Chaos.');
    if (!response.ok) throw new Error('Servidor HTTP ' + response.status);
    return response.json();
  } finally { clearTimeout(timer); }
}

async function ffxRunning() {
  const { stdout } = await execFileAsync('tasklist.exe', ['/FI', 'IMAGENAME eq FFX.exe', '/FO', 'CSV', '/NH'], {
    windowsHide: true, timeout: 4000, maxBuffer: 32 * 1024,
  });
  return /(?:^|\r?\n)"FFX\.exe",/im.test(stdout);
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
let lastRunning;
let lastError = '';

async function poll() {
  const running = await ffxRunning();
  if (running !== lastRunning) {
    process.stdout.write(running ? '✅ FFX.exe detectado.\n' : '⏳ Esperando a que abras Final Fantasy X…\n');
    lastRunning = running;
  }
  await request('/chaos/agent/heartbeat', { gameRunning: running });
  const { command } = await request('/chaos/agent/next');
  if (command) {
    if (command.mode !== 'DRY_RUN' || typeof command.id !== 'string') throw new Error('Comando no reconocido.');
    process.stdout.write('🧪 Prueba recibida: ' + command.rewardId + '. No se modifica FFX.\n');
    await request('/chaos/agent/ack', { id: command.id });
    process.stdout.write('✅ Prueba confirmada. Debería aparecer en el overlay de OBS.\n');
  }
}

process.once('SIGINT', () => { stopping = true; });
process.once('SIGTERM', () => { stopping = true; });

(async () => {
  process.stdout.write('🐺 Twitch Chaos · FFX Steam · conector seguro (modo prueba)\n');
  process.stdout.write('Conectando con ' + origin + ' · Ctrl+C para salir.\n');
  while (!stopping) {
    try { await poll(); lastError = ''; }
    catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      if (message !== lastError) process.stderr.write('⚠️ ' + message + '\n');
      lastError = message;
      if (message.startsWith('Clave rechazada')) break;
    }
    if (!stopping) await sleep(INTERVAL_MS);
  }
})().catch(error => { process.stderr.write('Error del conector: ' + error.message + '\n'); process.exitCode = 1; });
