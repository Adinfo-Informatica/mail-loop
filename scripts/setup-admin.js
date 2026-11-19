import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { Users } from '../src/modules/auth/users.js';
import { acquireLock } from '../src/infrastructure/instance-lock.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { projectURL } from '../src/config/paths.js';
import { hashPassword } from '../src/modules/auth/auth.js';
const environment = process.argv.find(x => x.startsWith('--env='))?.slice(6) || 'development';
if (!['development', 'production', 'local'].includes(environment)) throw Error('Ambiente invalido.');
if (!process.stdin.isTTY) throw Error('Execute em um terminal interativo.');
const file = new URL(environment === 'local' ? '.env' : `.env.${environment}`, projectURL);
let text = readFileSync(file, 'utf8'), muted = false;
const output = new Writable({ write(chunk, encoding, callback) { if (!muted) process.stdout.write(chunk, encoding); callback(); } });
const rl = createInterface({ input: process.stdin, output, terminal: true });
rl.on('SIGINT', () => { rl.close(); process.exit(130); });
const ask = (prompt, secret = false) => new Promise(resolve => { process.stdout.write(prompt); muted = secret; rl.question('', answer => { muted = false; if (secret) process.stdout.write('\n'); resolve(answer); }); });
try {
  const user = (await ask('Usuario administrativo: ')).trim();
  if (!/^[a-zA-Z0-9@._-]{1,100}$/.test(user)) throw Error('Use letras, numeros, @, ponto, hifen ou sublinhado no usuario.');
  const password = await ask('Senha (12 a 256 caracteres, oculta): ', true);
  if (password !== await ask('Confirme a senha: ', true)) throw Error('As senhas nao conferem.');
  const hash = await hashPassword(password);
  for (const [key, value] of Object.entries({ ADMIN_USERNAME: user, ADMIN_PASSWORD_HASH: hash })) {
    const regex = new RegExp('^' + key + '=.*$', 'gm');
    text = regex.test(text) ? text.replace(regex, () => key + '=' + value) : text.trimEnd() + '\n' + key + '=' + value + '\n';
  }
  mkdirSync(new URL('data/', projectURL), { recursive: true });
  const release = acquireLock(new URL('data/app.lock', projectURL));
  let db;
  try {
    const database = environment === 'local' ? 'queue.sqlite' : `queue-${environment}.sqlite`;
    db = new DatabaseSync(new URL('data/' + database, projectURL));
    new Users(db).recoverAdmin(user, hash);
    writeFileSync(file, text, { mode: 0o600 });
  } finally { db?.close(); release(); }
  console.log(`Conta salva em ${environment}. Reinicie o MailLoop. A senha foi armazenada como hash.`);
} finally { rl.close(); }
