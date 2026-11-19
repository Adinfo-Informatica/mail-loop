import express from 'express';

const layout = (title, body) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{margin:0;background:#eef3f6;color:#183044;font:16px/1.6 'Segoe UI',Arial,sans-serif;display:grid;min-height:100vh;place-items:center}main{max-width:440px;margin:24px;padding:40px;background:#fff;border:1px solid #dce5eb;border-radius:16px}small{color:#487080;letter-spacing:2px;font-size:11px}h1{font-size:28px;line-height:1.2}p{color:#607280}button{background:#146a69;color:#fff;border:0;border-radius:7px;padding:14px 20px;font:600 16px 'Segoe UI',Arial;cursor:pointer}button:focus-visible{outline:3px solid #c39116;outline-offset:3px}.note{font-size:13px}</style></head><body><main><small>PREFERÊNCIAS DE E-MAIL</small><h1>${title}</h1>${body}</main></body></html>`;
const invalid = () => layout('Link inválido', '<p>Este link de descadastro não foi reconhecido. Utilize o link completo de uma mensagem recebida ou entre em contato com o remetente.</p>');
const done = () => layout('Descadastro confirmado', '<p>Você não receberá novos envios deste disparador para o endereço associado a este link.</p><p class="note">Uma mensagem que já estava sendo enviada pode ainda chegar. Não é necessário fazer mais nada.</p>');

export function createUnsubscribeApp(store) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req,res,next) => {
    res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow',
      'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"});
    next();
  });
  app.get('/unsubscribe/:token', (req,res) => {
    const email = store.lookup(req.params.token);
    if (!email) return res.status(404).type('html').send(invalid());
    if (store.blocked(email)) return res.type('html').send(done());
    res.type('html').send(layout('Deseja se descadastrar?', `<p>Confirme para deixar de receber novas mensagens deste disparador. Você não precisa entrar em uma conta nem informar seu e-mail.</p><form method="post" action="/unsubscribe/${req.params.token}"><input type="hidden" name="confirm" value="yes"><button type="submit">Confirmar descadastro</button></form><p class="note">Se deseja continuar recebendo, basta fechar esta página.</p>`));
  });
  app.post('/unsubscribe/:token', express.raw({type:()=>true, limit:'8kb'}), async (req,res) => {
    if (!store.lookup(req.params.token)) return res.status(404).type('html').send(invalid());
    const type=req.get('content-type') || '';
    if (!/^(application\/x-www-form-urlencoded|multipart\/form-data)(;|$)/i.test(type)) return res.status(415).send('Formato de confirmação não suportado.');
    let form;
    try {form=await new Request('http://localhost/',{method:'POST',headers:{'Content-Type':type},body:req.body}).formData();}
    catch {return res.status(400).send('Confirmação inválida.');}
    const oneClick=form.getAll('List-Unsubscribe');
    const manual=form.getAll('confirm');
    const isOneClick=oneClick.length===1 && oneClick[0]==='One-Click';
    const isManual=manual.length===1 && manual[0]==='yes';
    if(!isOneClick && !isManual)return res.status(400).send('Confirmação inválida.');
    store.unsubscribe(req.params.token,isOneClick?'one-click':'link');
    res.type('html').send(done());
  });
  app.use((req,res)=>res.status(404).type('html').send(invalid()));
  app.use((error,req,res,next)=>res.status(error.type==='entity.too.large'?413:500).send('Não foi possível processar o pedido. Tente novamente.'));
  return app;
}
