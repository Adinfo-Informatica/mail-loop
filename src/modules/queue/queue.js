import { sendDiagnostic } from './send-diagnostic.js';
import { DatabaseSync } from 'node:sqlite';
import { UnsubscribeStore } from '../unsubscribe/unsubscribe.js';
export const emailOK = value => typeof value === 'string' && /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(value) && value.length < 255;
export class Queue {
  constructor(file, send, dryRun = true) {
    this.db = new DatabaseSync(file); this.send = send; this.dryRun = dryRun; this.busy = false;
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS config (id INTEGER PRIMARY KEY, interval INTEGER, batch INTEGER, paused INTEGER, next INTEGER);
      INSERT OR IGNORE INTO config VALUES (1,300,1,1,0);
      CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY, recipient TEXT, subject TEXT, body TEXT, status TEXT, created TEXT, updated TEXT, detail TEXT);
    `);
    if (!this.db.prepare('PRAGMA table_info(jobs)').all().some(column => column.name === 'html')) {
      this.db.exec('ALTER TABLE jobs ADD COLUMN html TEXT');
    }
    this.db.exec('CREATE TABLE IF NOT EXISTS send_errors (job_id INTEGER PRIMARY KEY, created TEXT NOT NULL, diagnostic TEXT NOT NULL)');
    for(const job of this.db.prepare("SELECT id FROM jobs WHERE status='sending'").all())this.recordError(job.id,{},true);
    this.optOut = new UnsubscribeStore(this.db);
    // An SMTP interruption can have an ambiguous result. Never retry it automatically.
    this.db.prepare("UPDATE jobs SET status='uncertain', detail='Processo interrompido durante tentativa; confira no SMTP antes de reenviar.' WHERE status='sending'").run();
    this.db.prepare('UPDATE config SET paused=1 WHERE id=1').run();
  }
  recordError(id,error,interrupted=false) {
    this.db.prepare('INSERT OR REPLACE INTO send_errors VALUES(?,?,?)').run(id,new Date().toISOString(),JSON.stringify(sendDiagnostic(error,interrupted)));
  }
  errorLog(id) {
    if(!Number.isSafeInteger(id)||id<1)throw Error('Registro inválido.');
    const job=this.db.prepare('SELECT status,updated FROM jobs WHERE id=?').get(id);
    if(!job || !['review','uncertain'].includes(job.status))return null;
    const log=this.db.prepare('SELECT * FROM send_errors WHERE job_id=?').get(id);
    return {jobId:id,created:log?.created || job.updated,...(log?JSON.parse(log.diagnostic):sendDiagnostic({},job.status==='uncertain')),legacy:!log};
  }
  config() { return this.db.prepare('SELECT * FROM config WHERE id=1').get(); }
  settings(interval, batch) {
    if (!Number.isInteger(interval) || interval < 60 || interval > 86400 || !Number.isInteger(batch) || batch < 1 || batch > 100) throw Error('Intervalo: 60 a 86400 segundos. Destinatários por rodada: 1 a 100.');
    this.db.prepare('UPDATE config SET interval=?, batch=? WHERE id=1').run(interval, batch);
  }
  pause(value) { this.db.prepare('UPDATE config SET paused=? WHERE id=1').run(value ? 1 : 0); }
  add({recipients, subject, body, html = null}) {
    if (!Array.isArray(recipients) || !recipients.length || recipients.length > 5000) throw Error('Informe de 1 a 5000 destinatários.');
    const addresses = [...new Set(recipients.map(x => typeof x === 'string' ? x.trim().toLowerCase() : ''))];
    if (addresses.some(x => !emailOK(x))) throw Error('A lista contém um endereço inválido. Nenhuma mensagem foi adicionada.');
    if (typeof subject !== 'string' || !subject.trim() || subject.length > 200 || /[\r\n]/.test(subject)) throw Error('Assunto inválido (máximo 200 caracteres).');
    if (typeof body !== 'string' || !body.trim() || body.length > 100000) throw Error('Mensagem inválida (máximo 100 mil caracteres).');
    const insert = this.db.prepare("INSERT INTO jobs(recipient,subject,body,html,status,created,updated,detail) VALUES(?,?,?,?,'pending',?,?, '')");
    this.db.exec('BEGIN');
    let added = 0;
    try { for (const address of addresses) { if(this.optOut.blocked(address))continue; const now = new Date().toISOString(); insert.run(address, subject.trim(), body, html, now, now); added++; } this.db.exec('COMMIT'); }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return added;
  }
  cancel() { return this.db.prepare("UPDATE jobs SET status='cancelled', updated=? WHERE status='pending'").run(new Date().toISOString()).changes; }
  snapshot() {
    return {config:this.config(), dryRun:this.dryRun, busy:this.busy, suppressions:this.optOut.list(), suppressionCount:this.optOut.count(),
      counts:this.db.prepare('SELECT status, COUNT(*) AS total FROM jobs GROUP BY status').all(),
      jobs:this.db.prepare('SELECT id,recipient,subject,status,updated,detail FROM jobs ORDER BY id DESC LIMIT 100').all()};
  }
  clearHistory() {
    const completed = "status IN ('accepted','simulated','review','uncertain','cancelled','suppressed')";
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare(`DELETE FROM send_errors WHERE job_id IN (SELECT id FROM jobs WHERE ${completed})`).run();
      const deleted = this.db.prepare(`DELETE FROM jobs WHERE ${completed}`).run().changes;
      this.db.exec('COMMIT');
      return deleted;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  async tick(now = Date.now()) {
    if (this.busy) return;
    const cfg = this.config(); if (cfg.paused || now < cfg.next) return;
    this.busy = true;
    try {
      const jobs = this.db.prepare("SELECT * FROM jobs WHERE status='pending' ORDER BY id LIMIT ?").all(cfg.batch);
      if (!jobs.length) return;
      this.db.prepare('UPDATE config SET next=? WHERE id=1').run(now + cfg.interval * 1000);
      for (const job of jobs) {
        if (this.config().paused) break;
        if (this.optOut.blocked(job.recipient)) {
          this.db.prepare("UPDATE jobs SET status='suppressed',updated=?,detail='Envio bloqueado: destinatário descadastrado.' WHERE id=? AND status='pending'").run(new Date().toISOString(),job.id);
          continue;
        }
        const claimed = this.db.prepare("UPDATE jobs SET status='sending' WHERE id=? AND status='pending'").run(job.id);
        if (!claimed.changes) continue;
        let status = 'simulated', detail = 'Simulação: nenhuma conexão SMTP realizada.';
        try {
          if (!this.dryRun) {
            const info = await this.send(job);
            if (!info.accepted?.length) throw Object.assign(Error('Destinatario nao aceito'),{code:'SMTP_NOT_ACCEPTED'});
            status = 'accepted'; detail = 'Aceito pelo SMTP; não confirma entrega na caixa de entrada.';
          }
        } catch (error) {
          this.recordError(job.id,error);
          status = 'review'; detail = 'Erro ao enviar. Consulte o registro de erro. Sem repetição automática.';
          this.pause(true);
        }
        this.db.prepare('UPDATE jobs SET status=?, detail=?, updated=? WHERE id=?').run(status,detail,new Date().toISOString(),job.id);
      }
    } finally { this.busy = false; }
  }
}
