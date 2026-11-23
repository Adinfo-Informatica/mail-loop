import { Users } from './modules/auth/users.js';
import { readFileSync } from 'node:fs';
import { createServer as createHTTPServer } from 'node:http';
import { createServer as createHTTPSServer } from 'node:https';
import { resolve } from 'node:path';
import { accessConfig, installAuth, requireAdmin } from './modules/auth/auth.js';
import express from 'express';
import nodemailer from 'nodemailer';
import { mkdirSync } from 'node:fs';
import { projectRoot as root, projectURL } from './config/paths.js';
import { randomBytes } from 'node:crypto';
import { Queue } from './modules/queue/queue.js';
import { installHistoryRoutes } from './modules/queue/history-routes.js';
import { Groups } from './modules/groups/groups.js';
import { loadConfig } from './config/config.js';
import { acquireLock } from './infrastructure/instance-lock.js';
import { buildMessage } from './modules/unsubscribe/unsubscribe.js';
import { createUnsubscribeApp } from './modules/unsubscribe/unsubscribe-app.js';
import { readCampaigns, parseCampaign, maxCampaignBytes } from './modules/campaigns/campaigns.js';
const config = loadConfig();
const { port, dryRun, smtp, from } = config;
const access = accessConfig(config.env, config.environment);
const tls = access.secure ? { cert: readFileSync(resolve(root, access.cert)), key: readFileSync(resolve(root, access.key)) } : null;
mkdirSync(new URL('data/', projectURL), { recursive: true });
const releaseLock = acquireLock(new URL('data/app.lock', projectURL));
process.on('exit', releaseLock);
if (config.missing.length) console.log(`Configuração SMTP incompleta (simulação disponível): ${config.missing.join(', ')}`);
const transport = dryRun ? null : nodemailer.createTransport({
  host: smtp.host, port: smtp.port,
  secure: smtp.secure, requireTLS: true,
  auth: { user: smtp.user, pass: smtp.pass },
  connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
  disableFileAccess: true, disableUrlAccess: true
});
const database = config.environment === 'local' ? 'queue.sqlite' : `queue-${config.environment}.sqlite`;
const queue = new Queue(root + 'data/' + database, job => {
  if (!config.unsubscribe.ready) throw Object.assign(Error('Descadastro público não configurado'), { code: 'UNSUBSCRIBE_NOT_READY' });
  return transport.sendMail({
    ...buildMessage(job, from, config.unsubscribe.baseURL, queue.optOut),
    messageId: `<queue-${job.id}-${randomBytes(12).toString('hex')}@${from.split('@')[1]}>`
  });
}, dryRun);
const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  if (!access.hosts.includes(req.hostname.toLowerCase())) return res.status(403).json({ error: 'Dominio de acesso nao permitido. Confira ALLOWED_HOSTS no ambiente do servidor.', code: 'HOST_NOT_ALLOWED' });
  res.set({ 'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'", 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
  res.set('Referrer-Policy', 'no-referrer');
  next();
});
// Public opt-out is deliberately mounted before login and CSRF checks.
const publicUnsubscribe = createUnsubscribeApp(queue.optOut);
app.use((req, res, next) => req.path.startsWith('/unsubscribe/') ? publicUnsubscribe(req, res, next) : next());
app.use('/api/auth/login', express.json({ limit: '4kb' }));
app.use(express.json({ limit: '1mb' }));
const users = new Users(queue.db);
users.bootstrap(access.user, access.hash);
installAuth(app, access, root + 'public', { users });
installHistoryRoutes(app, queue);
app.get('/usuarios.html', requireAdmin, (req, res) => res.sendFile('usuarios.html', { root: root + 'public' }));
app.use('/api/users', requireAdmin);
app.get('/api/users', (req, res) => res.json(users.list()));
app.post('/api/users', async (req, res) => res.status(201).json(await users.save(req.body, undefined, req.auth.user.id)));
app.put('/api/users/:id', async (req, res) => res.json(await users.save(req.body, Number(req.params.id), req.auth.user.id)));
const groups = new Groups(queue.db);
app.get('/api/groups', (req, res) => res.json(groups.list()));
app.get('/api/groups/:id', (req, res) => res.json(groups.get(req.params.id)));
app.post('/api/groups', (req, res) => res.status(201).json(groups.save(req.body)));
app.put('/api/groups/:id', (req, res) => res.json(groups.save(req.body, Number(req.params.id))));
app.get('/api/state', (req, res) => res.json({
  ...queue.snapshot(), token: req.auth.token, sender: from, environment: config.environment,
  unsubscribeReady: config.unsubscribe.ready, sendBlocked: !dryRun && !config.unsubscribe.ready
}));
app.get('/api/jobs/:id/error', (req, res) => { const log = queue.errorLog(Number(req.params.id)); if (!log) return res.status(404).json({ error: 'Registro de erro não encontrado.' }); res.json(log); });
app.post('/api/settings', (req, res) => { queue.settings(req.body.interval, req.body.batch); res.json({ ok: true }); });
const previews = new Map();
function rememberPreview(model) {
  if (previews.size >= 25) previews.delete(previews.keys().next().value);
  const previewId = randomBytes(20).toString('hex');
  previews.set(previewId, model);
  return { previewId, ...model };
}
app.post('/api/campaigns/list', async (req, res) => res.json({ models: await readCampaigns(config.imap) }));
app.post('/api/campaigns/preview', async (req, res) => {
  if (!/^\d+\.\d+$/.test(req.body.id || '')) throw Error('Selecione um modelo da lista.');
  res.json(rememberPreview(await readCampaigns(config.imap, req.body.id)));
});
app.post('/api/campaigns/file', express.raw({ type: 'message/rfc822', limit: maxCampaignBytes }), async (req, res) => {
  if (!Buffer.isBuffer(req.body)) throw Error('Selecione um arquivo .eml.');
  res.json(rememberPreview(await parseCampaign(req.body)));
});
app.post('/api/jobs', (req, res) => {
  const { subject, body, previewId, groupId, groupRevision } = req.body;
  const recipients = groups.recipients(groupId, groupRevision, req.body.recipients);
  const model = previewId ? previews.get(previewId) : { subject, body };
  if (!model) throw Error('A prévia expirou. Selecione o modelo novamente.');
  const added = queue.add({ recipients, ...model });
  const unique = new Set(recipients.map(x => x.trim().toLowerCase())).size;
  res.json({ added, skipped: unique - added });
});
app.post('/api/pause', (req, res) => {
  if (typeof req.body.paused !== 'boolean') throw Error('Estado inválido');
  if (!req.body.paused && !dryRun && !config.unsubscribe.ready) return res.status(409).json({ error: 'Envio real bloqueado: configure e valide a URL HTTPS pública de descadastro (UNSUBSCRIBE_BASE_URL).' });
  queue.pause(req.body.paused); res.json({ ok: true });
});
app.post('/api/cancel', (req, res) => res.json({ cancelled: queue.cancel() }));
app.use(express.static(root + 'public'));
app.use((error, req, res, next) => res.status(400).json({ error: error.type === 'entity.too.large' ? 'Conteúdo muito grande.' : error.message }));
let timer, server, unsubscribeServer;
const listen = (application, listenPort, host = '127.0.0.1', tlsOptions = null) => new Promise((resolve, reject) => {
  const listener = tlsOptions ? createHTTPSServer(tlsOptions, application) : createHTTPServer(application);
  listener.listen(listenPort, host, () => resolve(listener));
  listener.once('error', reject);
});
try {
  unsubscribeServer = await listen(createUnsubscribeApp(queue.optOut), config.unsubscribe.port);
  server = await listen(app, port, access.host, tls);
  console.log(`Painel: ${access.secure ? 'https' : 'http'}://${access.hosts[0]}:${port} | ${config.environment} | ${dryRun ? 'SIMULAÇÃO' : 'ENVIO REAL'} | fila pausada`);
  console.log(`Descadastro local: ${config.unsubscribe.localURL} | ${config.unsubscribe.ready ? 'URL pública configurada; valide o acesso externo' : 'SEM URL PÚBLICA: envio real bloqueado'}`);
  timer = setInterval(() => {
    if (!dryRun && !config.unsubscribe.ready) return;
    queue.tick().catch(() => { queue.pause(true); console.error('Fila pausada por falha interna.'); });
  }, 1000);
} catch {
  console.error('Não foi possível abrir as portas do painel e do descadastro. Nenhum processamento da fila iniciado.');
  if (unsubscribeServer) await new Promise(resolve => unsubscribeServer.close(resolve));
  queue.db.close(); transport?.close(); releaseLock(); process.exitCode = 1;
}
let closing = false;
async function shutdown() {
  if (closing || !server) return; closing = true; clearInterval(timer); queue.pause(true);
  await Promise.all([new Promise(resolve => server.close(resolve)), new Promise(resolve => unsubscribeServer.close(resolve))]);
  while (queue.busy) await new Promise(resolve => setTimeout(resolve, 100)); queue.db.close(); transport?.close(); releaseLock();
}
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
