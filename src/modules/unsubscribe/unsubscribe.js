import { createHash, randomBytes } from 'node:crypto';

const normalize = email => email.trim().toLowerCase();
const digest = token => createHash('sha256').update(token).digest('hex');
export class UnsubscribeStore {
  constructor(db) {
    this.db = db;
    db.exec(`CREATE TABLE IF NOT EXISTS unsubscribe_tokens (
      hash TEXT PRIMARY KEY, recipient TEXT NOT NULL, created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS suppressions (
      recipient TEXT PRIMARY KEY, created TEXT NOT NULL, source TEXT NOT NULL);`);
  }
  issue(email) {
    const token = randomBytes(32).toString('base64url');
    this.db.prepare('INSERT INTO unsubscribe_tokens VALUES(?,?,?)').run(digest(token), normalize(email), new Date().toISOString());
    return token;
  }
  lookup(token) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    return this.db.prepare('SELECT recipient FROM unsubscribe_tokens WHERE hash=?').get(digest(token))?.recipient || null;
  }
  blocked(email) { return !!this.db.prepare('SELECT 1 FROM suppressions WHERE recipient=?').get(normalize(email)); }
  list() { return this.db.prepare('SELECT recipient,created FROM suppressions ORDER BY created DESC LIMIT 100').all(); }
  count() { return this.db.prepare('SELECT COUNT(*) AS total FROM suppressions').get().total; }
  unsubscribe(token, source) {
    const recipient = this.lookup(token);
    if (!recipient) return false;
    const now = new Date().toISOString();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT OR IGNORE INTO suppressions VALUES(?,?,?)').run(recipient, now, source);
      this.db.prepare("UPDATE jobs SET status='suppressed',updated=?,detail='Envio bloqueado: destinatário descadastrado.' WHERE lower(recipient)=? AND status='pending'").run(now, recipient);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return true;
  }
}

export const escapeHTML = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

export function buildMessage(job, from, baseURL, store) {
  const url = `${baseURL}/unsubscribe/${store.issue(job.recipient)}`;
  return {
    from, to:job.recipient, subject:job.subject,
    text:`${job.body}\n\n---\nNão deseja receber novas mensagens deste disparador?\nDescadastrar: ${url}`,
    html:`<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;color:#183044;line-height:1.6"><div style="max-width:640px;margin:24px auto;padding:24px">${job.html || `<div style="white-space:pre-wrap">${escapeHTML(job.body)}</div>`}<hr style="border:0;border-top:1px solid #dce5eb;margin:32px 0"><p style="font-size:13px;color:#607280">Você pode deixar de receber novas mensagens deste disparador.</p><a href="${escapeHTML(url)}" style="display:inline-block;background:#146a69;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none">Descadastrar meu e-mail</a><p style="font-size:12px;color:#607280">Remetente: ${escapeHTML(from)}</p></div></body></html>`,
    headers:{'List-Unsubscribe':`<${url}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}
  };
}

export function unsubscribeConfig(env, adminPort) {
  const port = Number(env.UNSUBSCRIBE_PORT || 3101);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || port === adminPort) throw Error('UNSUBSCRIBE_PORT inválida ou igual à porta do painel.');
  let baseURL = (env.UNSUBSCRIBE_BASE_URL || '').trim();
  if (baseURL) {
    let url;
    try {url = new URL(baseURL);} catch {throw Error('UNSUBSCRIBE_BASE_URL precisa ser uma origem HTTPS pública válida.');}
    if(url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' || !url.hostname.includes('.') || /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(url.hostname) || url.hostname.includes(':') || url.hostname.endsWith('.local')) throw Error('UNSUBSCRIBE_BASE_URL precisa ser uma origem HTTPS pública, sem caminho ou credenciais.');
    baseURL = url.origin;
  }
  return {port,baseURL,ready:!!baseURL,localURL:`http://127.0.0.1:${port}`};
}
