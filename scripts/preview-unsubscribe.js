// Demonstration only: in-memory database, fictitious recipient, no SMTP.
import express from 'express';
import { Queue } from '../src/modules/queue/queue.js';
import { buildMessage } from '../src/modules/unsubscribe/unsubscribe.js';
import { createUnsubscribeApp } from '../src/modules/unsubscribe/unsubscribe-app.js';
const q = new Queue(':memory:');
const port = 3199;
q.add({ recipients: ['demonstracao@example.invalid'], subject: 'Prévia do descadastro', body: 'Olá!\n\nEsta é uma prévia local do botão de descadastro. Nenhum e-mail foi enviado.\n\nEquipe RD Makes' });
const mail = buildMessage(q.db.prepare('SELECT * FROM jobs LIMIT 1').get(), 'marketing@rdmakes.com.br', `http://127.0.0.1:${port}`, q.optOut);
const app = express();
app.get('/demo', (req, res) => res.type('html').send(mail.html.replace('<body ', '<body ').replace('<div style="max-width:', '<p style="text-align:center;background:#fff2cc;padding:12px">DEMONSTRAÇÃO LOCAL • Dados fictícios • Nenhum envio</p><div style="max-width:')));
app.use(createUnsubscribeApp(q.optOut));
const server = app.listen(port, '127.0.0.1', () => console.log(`Prévia: http://127.0.0.1:${port}/demo`));
process.on('SIGINT', () => server.close(() => q.db.close()));
process.on('SIGTERM', () => server.close(() => q.db.close()));
