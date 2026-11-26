#!/usr/bin/env node
/**
 * start-with-public-url.mjs
 *
 * Arranca el backend (compilando si hace falta) y, de forma interactiva,
 * ofrece generar una URL pública temporal mediante un quick tunnel de
 * Cloudflare (cloudflared). Pensado para uso local (compartir con estudiantes).
 *
 * Variables de entorno:
 *   PORT                 Puerto en el que escucha el backend (default 3000).
 *   READY_TIMEOUT_MS     Tiempo máximo esperando /health/ready (default 60000).
 *   FORCE_BUILD=1        Fuerza `npm run build` antes de arrancar.
 *   SKIP_BUILD=1         No compila aunque falte dist (fallará si no existe).
 *   PUBLIC_URL_AUTO=1    Genera el túnel sin preguntar.
 *   SKIP_PUBLIC_URL=1    No genera túnel ni pregunta.
 *   --restart            Mata el proceso previo que escuche en PORT antes de arrancar.
 *   --build              Fuerza compilación.
 *   --no-build           No compila.
 */
import { spawn, spawnSync } from 'node:child_process';
import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const DIST_MAIN = path.join(ROOT, 'dist', 'main.js');
const ENV_FILE = path.join(ROOT, '.env');

// ---------- utilidades ----------
function loadEnvFile() {
  if (!fs.existsSync(ENV_FILE)) return;
  const content = fs.readFileSync(ENV_FILE, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const m = rawLine.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function log(msg) { process.stdout.write(`[public-url] ${msg}\n`); }
function warn(msg) { process.stderr.write(`[public-url] AVISO: ${msg}\n`); }
function err(msg) { process.stderr.write(`[public-url] ERROR: ${msg}\n`); }

function hasBin(name) {
  try {
    execSync(process.platform === 'win32' ? `where ${name}` : `command -v ${name}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function killPort(port) {
  if (process.platform === 'win32') {
    warn('No se puede liberar el puerto automáticamente en esta plataforma; detén el proceso manualmente antes de reiniciar.');
    return;
  }
  let pids = '';
  try {
    pids = execSync(`lsof -ti:${port}`, { encoding: 'utf8' }).trim();
  } catch {
    return; // nadie escucha
  }
  if (!pids) return;
  for (const pid of pids.split(/\s+/)) {
    if (!pid || pid === String(process.pid)) continue;
    try { process.kill(Number(pid), 'SIGTERM'); } catch {}
  }
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      execSync(`lsof -ti:${port}`, { stdio: 'ignore' });
    } catch {
      return; // puerto libre
    }
  }
  // forzar
  try {
    const again = execSync(`lsof -ti:${port}`, { encoding: 'utf8' }).trim();
    for (const pid of again.split(/\s+/)) {
      if (pid && pid !== String(process.pid)) {
        try { process.kill(Number(pid), 'SIGKILL'); } catch {}
      }
    }
  } catch {}
}

function waitForReady(port, timeoutMs) {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const url = `http://127.0.0.1:${port}/health/ready`;
    const tick = () => {
      if (Date.now() >= deadline) { resolve(false); return; }
      const req = http.get(url, (res) => {
        if (res.statusCode === 200) resolve(true);
        else setTimeout(tick, 1000);
        res.resume();
      });
      req.on('error', () => setTimeout(tick, 1000));
      req.setTimeout(3000, () => { req.destroy(); });
    };
    tick();
  });
}

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (ans) => { rl.close(); resolve((ans || '').trim()); });
  });
}

// ---------- main ----------
loadEnvFile();

const args = process.argv.slice(2);
const doRestart = args.includes('--restart');
const forceBuild = args.includes('--build') || process.env.FORCE_BUILD === '1';
const noBuild = args.includes('--no-build') || process.env.SKIP_BUILD === '1';

const PORT = Number(process.env.PORT || 3000);
const READY_TIMEOUT = Number(process.env.READY_TIMEOUT_MS || 60000);

const forceTunnel = process.env.PUBLIC_URL_AUTO === '1'
  || process.env.CLOUDFLARE_TUNNEL_AUTO === '1'
  || process.env.START_WITH_PUBLIC_URL === '1';
const skipTunnel = process.env.SKIP_PUBLIC_URL === '1'
  || process.env.NO_PUBLIC_URL === '1'
  || process.env.PUBLIC_URL === '0';

const isTTY = Boolean(process.stdin.isTTY && process.stdout.isTTY);

if (doRestart) {
  log(`Reiniciando: liberando el puerto ${PORT}...`);
  killPort(PORT);
}

// Build si hace falta
if (!noBuild) {
  const needBuild = forceBuild || !fs.existsSync(DIST_MAIN);
  if (needBuild) {
    log('Compilando (npm run build)...');
    const r = spawnSync('npm', ['run', 'build'], { stdio: 'inherit', shell: true, cwd: ROOT });
    if (r.status !== 0) {
      err('La compilación falló. Corrige los errores de TypeScript antes de continuar.');
      process.exit(r.status || 1);
    }
  } else {
    log('dist/main.js encontrado; se omite la compilación (usa --build o FORCE_BUILD=1 para forzar).');
  }
} else {
  log('Compilación omitida (--no-build / SKIP_BUILD).');
}

if (!fs.existsSync(DIST_MAIN)) {
  err('No existe dist/main.js. Ejecuta `npm run build` primero.');
  process.exit(1);
}

// Spawn backend
log(`Iniciando backend en el puerto ${PORT}...`);
const backend = spawn('node', ['dist/main.js'], {
  cwd: ROOT,
  env: process.env,
  stdio: 'inherit',
});

let backendExited = false;
backend.on('exit', (code, signal) => {
  backendExited = true;
  if (signal) log(`Backend terminado por señal ${signal}.`);
  else log(`Backend terminado (código ${code}).`);
});

// Esperar readiness
log(`Esperando a que /health/ready responda (hasta ${READY_TIMEOUT / 1000}s)...`);
const ready = await waitForReady(PORT, READY_TIMEOUT);
if (!ready) {
  err(`/health/ready no respondió 200 en ${READY_TIMEOUT / 1000}s. El backend puede haber fallado (revisa los logs arriba).`);
  try { backend.kill('SIGTERM'); } catch {}
  process.exit(1);
}
log('Backend listo.');
log(`  API local:     http://127.0.0.1:${PORT}/api/v1`);
log(`  Swagger local: http://127.0.0.1:${PORT}/docs`);
log(`  Health:        http://127.0.0.1:${PORT}/health/ready`);

// Decidir túnel
let wantTunnel = false;
if (skipTunnel) {
  log('Túnel omitido (SKIP_PUBLIC_URL/NO_PUBLIC_URL/PUBLIC_URL=0).');
} else if (forceTunnel) {
  wantTunnel = true;
  log('Túnel forzado por variable de entorno.');
} else if (isTTY) {
  const ans = await ask('¿Quieres generar la URL pública (Cloudflare Tunnel) para compartir con tus estudiantes? [y/N] ');
  wantTunnel = /^(y|yes|s|si|sí)$/i.test(ans);
} else {
  log('Entorno no interactivo (sin TTY): se omite el túnel. Usa PUBLIC_URL_AUTO=1 para forzarlo.');
}

let tunnel = null;
let tunnelUrl = null;

if (wantTunnel) {
  if (!hasBin('cloudflared')) {
    err('No se encontró el binario `cloudflared` en el PATH.');
    warn('Instálalo en macOS con: brew install cloudflare/cloudflare/cloudflared');
    warn('Otras opciones: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/');
    warn('El backend sigue disponible en la URL local; puedes lanzar el túnel manualmente cuando lo instales.');
  } else {
    log('Lanzando Cloudflare Tunnel (quick tunnel)...');
    tunnel = spawn('cloudflared', ['tunnel', '--url', `http://127.0.0.1:${PORT}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let tunnelOutput = '';
    const handleChunk = (chunk) => {
      const text = chunk.toString();
      process.stdout.write(text);
      tunnelOutput += text;
      const m = tunnelOutput.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (m && !tunnelUrl) {
        tunnelUrl = m[0];
        process.stdout.write('\n');
        process.stdout.write('============================================================\n');
        process.stdout.write('  URL PÚBLICA (comparte con tus estudiantes):\n');
        process.stdout.write(`  ${tunnelUrl}\n`);
        process.stdout.write('============================================================\n');
        process.stdout.write(`  Swagger:  ${tunnelUrl}/docs\n`);
        process.stdout.write(`  API:      ${tunnelUrl}/api/v1\n`);
        process.stdout.write(`  Health:   ${tunnelUrl}/health/ready\n`);
        process.stdout.write('  Nota: URL temporal, cambia en cada ejecución; sin autenticación; no usar en producción.\n\n');
      }
    };
    tunnel.stdout.on('data', handleChunk);
    tunnel.stderr.on('data', handleChunk);

    tunnel.on('exit', (code, signal) => {
      if (tunnelUrl) {
        warn(`El túnel se cerró (código ${code}${signal ? ', señal ' + signal : ''}). El backend sigue activo.`);
      } else {
        err(`cloudflared terminó sin exponer una URL (código ${code}${signal ? ', señal ' + signal : ''}).`);
        warn('Revisa la salida anterior. El backend sigue disponible localmente.');
      }
      tunnel = null;
    });
    tunnel.on('error', (e) => {
      err(`No se pudo lanzar cloudflared: ${e.message}`);
      tunnel = null;
    });
  }
}

// Mantener vivo
function cleanup() {
  log('Cerrando procesos...');
  if (tunnel) { try { tunnel.kill('SIGTERM'); } catch {} }
  if (!backendExited) { try { backend.kill('SIGTERM'); } catch {} }
  // dar tiempo a terminar
  setTimeout(() => process.exit(0), 1500);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Si el backend muere, salir
backend.on('exit', () => {
  if (tunnel) { try { tunnel.kill('SIGTERM'); } catch {} }
  setTimeout(() => process.exit(0), 500);
});

// Esperar indefinidamente
await new Promise(() => {});
