import { projectURL } from './paths.js';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { unsubscribeConfig } from '../modules/unsubscribe/unsubscribe.js';

const addressOK = value => typeof value === 'string' && /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(value);
export function resolveConfig(env, environment = 'development') {
  const value = (primary, legacy) => env[primary] !== undefined ? env[primary] : env[legacy];
  const port = Number(env.PORT || 3100);
  const smtpPort = Number(value('SMTP_PORT', 'MAIL_SYSTEM_PORT') || 587);
  const user = value('SMTP_USER', 'MAIL_SYSTEM_USER') || '';
  const from = env.MAIL_FROM === undefined ? (addressOK(user) ? user : '') : env.MAIL_FROM;
  const secureValue = env.SMTP_SECURE;
  if (secureValue !== undefined && !['true','false'].includes(secureValue)) throw Error('SMTP_SECURE deve ser true ou false.');
  if (env.DRY_RUN !== undefined && !['true','false'].includes(env.DRY_RUN)) throw Error('DRY_RUN deve ser true ou false.');
  for (const [name, number] of [['PORT',port],['SMTP_PORT / MAIL_SYSTEM_PORT',smtpPort]]) {
    if (!Number.isInteger(number) || number < 1 || number > 65535) throw Error(`${name}: porta inválida.`);
  }
  const smtp = {host:value('SMTP_HOST','MAIL_SYSTEM_HOST') || '', port:smtpPort,
    secure:secureValue === undefined ? smtpPort === 465 : secureValue === 'true',
    user, pass:value('SMTP_PASS','MAIL_SYSTEM_PASSWORD') || ''};
  const missing = [];
  if (!smtp.host.trim()) missing.push('SMTP_HOST / MAIL_SYSTEM_HOST');
  if (!smtp.user.trim()) missing.push('SMTP_USER / MAIL_SYSTEM_USER');
  if (!smtp.pass.trim()) missing.push('SMTP_PASS / MAIL_SYSTEM_PASSWORD');
  if (!addressOK(from)) missing.push('MAIL_FROM (ou usuário SMTP em formato de e-mail)');
  const dryRun = env.DRY_RUN !== 'false';
  if (!dryRun && missing.length) throw Error(`Envio real bloqueado. Confira: ${missing.join(', ')}.`);
  const imapHost = env.IMAP_HOST || smtp.host;
  const sameAccount = imapHost === smtp.host && (!env.IMAP_USER || env.IMAP_USER === user);
  const imap = {
    host: imapHost, port: Number(env.IMAP_PORT || 993),
    user: env.IMAP_USER || (sameAccount ? user : ''),
    pass: env.IMAP_PASS || (sameAccount ? smtp.pass : ''),
    folder: env.IMAP_CAMPAIGN_FOLDER || 'Campanhas'
  };
  return {environment, port, dryRun, smtp, imap, from, missing, unsubscribe:unsubscribeConfig(env,port)};
}

export function loadConfig(args = process.argv.slice(2), inherited = process.env) {
  const environment = args.find(arg => arg.startsWith('--env='))?.slice(6) || 'development';
  if (!['development','production','local'].includes(environment)) throw Error('Ambiente inválido. Use development, production ou local.');
  const filename = environment === 'local' ? '.env' : `.env.${environment}`;
  let fileEnv;
  try { fileEnv = parseEnv(readFileSync(new URL(filename, projectURL),'utf8')); }
  catch { throw Error(`Não foi possível ler ${filename}. Crie esse arquivo a partir de .env.example.`); }
  // Read exactly one file. Never borrow credentials from another environment.
  return resolveConfig({...fileEnv,...inherited}, environment);
}
