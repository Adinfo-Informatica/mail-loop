import { randomBytes, scrypt as derive, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(derive);
export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) throw Error('A senha deve ter entre 12 e 256 caracteres.');
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${(await scrypt(password,salt,64)).toString('hex')}`;
}
export async function verifyPassword(password, hash) {
  if (typeof password !== 'string' || password.length > 256) return false;
  const [,salt,key] = hash.split(':');
  const actual = await scrypt(password,salt,64);
  return timingSafeEqual(actual,Buffer.from(key,'hex'));
}
export function accessConfig(env, environment) {
  const hosts = (env.ALLOWED_HOSTS || (environment === 'production' ? 'mailloop.rdmakes.com.br' : 'localhost,127.0.0.1')).split(',').map(x=>x.trim().toLowerCase());
  if (hosts.some(x=>!x || x.length>253 || !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(x))) throw Error('ALLOWED_HOSTS: informe nomes ou IPv4 separados por virgula, sem protocolo, porta ou caminho.');
  const user = (env.ADMIN_USERNAME || '').trim();
  const hash = env.ADMIN_PASSWORD_HASH || '';
  if ((user || hash) && (!/^[a-zA-Z0-9@._-]{1,100}$/.test(user) || !/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(hash))) throw Error('Configure o login com npm run setup:admin -- --env='+environment);
  const host = env.HOST || '127.0.0.1';
  const cert = env.TLS_CERT_FILE || '', key = env.TLS_KEY_FILE || '';
  if (!!cert !== !!key) throw Error('Configure TLS_CERT_FILE e TLS_KEY_FILE juntos.');
  if (!cert && (environment === 'production' || !['localhost','127.0.0.1','::1'].includes(host))) throw Error('HTTPS obrigatorio em producao ou acesso pela rede: configure TLS_CERT_FILE e TLS_KEY_FILE.');
  return {hosts,user,hash,host,cert,key,secure:!!cert};
}

export function installAuth(app, config, publicRoot, {now=Date.now,users}={}) {
  if(!users) throw Error('Repositorio de usuarios obrigatorio.');
  const dummyHash='scrypt:'+ '0'.repeat(32)+':'+ '0'.repeat(128);
  const sessions = new Map(), attempts = new Map();
  const cookieName = config.secure ? '__Host-mailloop' : 'mailloop';
  const ttl = 8*60*60*1000, window = 15*60*1000;
  let activeChecks = 0;
  const cookieOptions = {httpOnly:true,secure:config.secure,sameSite:'strict',path:'/'};
  function prune() {
    for(const [id,s] of sessions) if(s.expires<=now()) sessions.delete(id);
    for(const [ip,s] of attempts) if(s.expires<=now()) attempts.delete(ip);
  }
  function session(req) {
    const value=(req.headers.cookie || '').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);
    const found=sessions.get(value);
    const user=found ? users.get(found.userId) : null;
    if(!found || found.expires<=now() || !user?.active || user.version!==found.version){if(value)sessions.delete(value);return null;}
    return {id:value,...found,user};
  }
  app.get('/login',(req,res)=>res.sendFile('login.html',{root:publicRoot}));
  app.get('/js/login.js',(req,res)=>res.sendFile('js/login.js',{root:publicRoot}));
  app.get('/css/login.css',(req,res)=>res.sendFile('css/login.css',{root:publicRoot}));
  app.post('/api/auth/login',async(req,res)=>{
    // Custom JSON request plus exact origin prevents cross-site login submissions.
    const origin=`${req.protocol}://${req.get('host')}`;
    if(req.get('origin')!==origin || req.get('x-mailloop-login')!=='1' || !req.is('application/json')) return res.sendStatus(403);
    prune();
    const ip=req.socket.remoteAddress;
    let bucket=attempts.get(ip);
    if(!bucket){if(attempts.size>=10000)return res.sendStatus(429);bucket={count:0,expires:now()+window};attempts.set(ip,bucket);}
    if(bucket.count>=5 || activeChecks>=4) return res.status(429).json({error:'Muitas tentativas. Aguarde 15 minutos e tente novamente.'});
    bucket.count++; activeChecks++;
    const candidate=users.credentials(req.body?.username);
    let valid=false;
    try {valid=await verifyPassword(req.body?.password,candidate?.password_hash || dummyHash);} finally {activeChecks--;}
    const currentUser=candidate ? users.get(candidate.id) : null;
    if(!valid || !currentUser?.active || currentUser.version!==candidate.version) return res.status(401).json({error:'Usuario ou senha invalidos.'});
    attempts.delete(ip);
    const previous=session(req);if(previous)sessions.delete(previous.id);
    if(sessions.size>=1000)sessions.delete(sessions.keys().next().value);
    const id=randomBytes(32).toString('hex');
    sessions.set(id,{userId:currentUser.id,version:currentUser.version,token:randomBytes(32).toString('hex'),expires:now()+ttl});
    res.cookie(cookieName,id,{...cookieOptions,maxAge:ttl});
    res.json({ok:true});
  });
  app.use((req,res,next)=>{
    prune();const current=session(req);
    if(!current) return req.path.startsWith('/api/') ? res.status(401).json({error:'Sua sessao expirou. Entre novamente.'}) : res.redirect('/login');
    req.auth=current;
    if(!['GET','HEAD'].includes(req.method) && req.get('x-app-token')!==current.token) return res.sendStatus(403);
    next();
  });
  app.get('/api/auth/me',(req,res)=>res.json({user:req.auth.user,token:req.auth.token}));
  app.post('/api/auth/logout',(req,res)=>{sessions.delete(req.auth.id);res.clearCookie(cookieName,cookieOptions);res.json({ok:true});});
}

export function requireAdmin(req,res,next) {
  if(req.auth?.user.role!=='admin')return res.status(403).json({error:'Acesso exclusivo para administradores.'});
  next();
}
