import { loadEnv } from 'vite';

const DEVELOPMENT_PROJECT_REF = 'zduznqqgxmvyhlfjupjx';
const PRODUCTION_PROJECT_REF = 'zhtqkygjvaaizbdwwsbi';
const mode = process.argv[2] ?? 'development';
const env = loadEnv(mode, process.cwd(), 'VITE_');

const fail = (message) => {
  console.error(`[Vortex] ERROR: ${message}`);
  process.exit(1);
};

const requiredNames = [
  'VITE_APP_ENV',
  'VITE_SUPABASE_PROJECT_ID',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
];

for (const name of requiredNames) {
  if (!env[name]?.trim()) {
    fail(`falta la variable requerida ${name}`);
  }
}

const appEnv = env.VITE_APP_ENV;
const projectId = env.VITE_SUPABASE_PROJECT_ID;
const supabaseUrl = env.VITE_SUPABASE_URL;
const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (appEnv !== 'development' && appEnv !== 'production') {
  fail('VITE_APP_ENV debe ser development o production');
}

if (mode === 'development' && appEnv !== 'development') {
  fail('el modo development requiere VITE_APP_ENV=development');
}

let urlProjectRef;
try {
  const hostname = new URL(supabaseUrl).hostname;
  const match = hostname.match(/^([a-z0-9]+)\.supabase\.co$/);
  if (!match) fail('VITE_SUPABASE_URL no corresponde a un proyecto Supabase valido');
  urlProjectRef = match[1];
} catch {
  fail('VITE_SUPABASE_URL no es una URL valida');
}

if (urlProjectRef !== projectId) {
  fail('VITE_SUPABASE_URL no coincide con VITE_SUPABASE_PROJECT_ID');
}

if (publishableKey.startsWith('sb_secret_')) {
  fail('no se permite una clave sb_secret_ en el frontend');
}

const parts = publishableKey.split('.');
if (parts.length === 3) {
  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    fail('VITE_SUPABASE_PUBLISHABLE_KEY contiene un JWT invalido');
  }

  if (payload?.role === 'service_role') {
    fail('no se permite una clave service_role en el frontend');
  }
}

if (mode === 'development') {
  if (projectId === PRODUCTION_PROJECT_REF) {
    fail('el proyecto Supabase de produccion esta prohibido en development');
  }

  if (projectId !== DEVELOPMENT_PROJECT_REF) {
    fail('development debe usar exclusivamente el proyecto Supabase autorizado');
  }

  console.info(`[Vortex] entorno=development supabase=${DEVELOPMENT_PROJECT_REF}`);
}
