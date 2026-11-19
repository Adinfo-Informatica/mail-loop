import { hashPassword } from './auth.js';
const fields='id, name, username, role, active, version, created';
export class Users {
  constructor(db) {
    this.db=db;
    db.exec(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, username TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','user')),
      active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
      version INTEGER NOT NULL DEFAULT 1, created TEXT NOT NULL
    )`);
  }
  bootstrap(user,hash) {
    if(this.db.prepare('SELECT COUNT(*) AS count FROM users').get().count) return;
    if(!user || !hash) throw Error('Cadastre o primeiro administrador com npm run setup:admin.');
    this.recoverAdmin(user,hash);
  }
  // Called only by the local recovery command with the application stopped.
  recoverAdmin(username,hash) {
    if(!/^[a-zA-Z0-9@._-]{1,100}$/.test(username))throw Error('Usuario invalido.');
    this.db.prepare(`INSERT INTO users(name,username,password_hash,role,active,created) VALUES(?,?,?,'admin',1,?)
      ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash,role='admin',active=1,version=users.version+1`).run(username,username,hash,new Date().toISOString());
  }
  list(){return this.db.prepare(`SELECT ${fields} FROM users ORDER BY name COLLATE NOCASE,id`).all();}
  get(id){return this.db.prepare(`SELECT ${fields} FROM users WHERE id=?`).get(id);}
  credentials(username){return typeof username==='string' && username.length<=100 ? this.db.prepare('SELECT * FROM users WHERE username=?').get(username.trim()) : undefined;}
  async save(input,id,actorId){
    if(!input || typeof input!=='object')throw Error('Dados invalidos.');
    const name=typeof input.name==='string'?input.name.trim():'';
    const username=typeof input.username==='string'?input.username.trim():'';
    if(!name || name.length>100)throw Error('Informe um nome de ate 100 caracteres.');
    if(!/^[a-zA-Z0-9@._-]{1,100}$/.test(username))throw Error('Usuario: use letras, numeros, @, ponto, hifen ou sublinhado.');
    if(!['admin','user'].includes(input.role) || typeof input.active!=='boolean')throw Error('Perfil ou estado invalido.');
    if(id!==undefined && (!Number.isSafeInteger(id)||id<1))throw Error('Usuario invalido.');
    const password=input.password;
    if(id===undefined && !password)throw Error('Informe a senha inicial.');
    const hash=password!==undefined && password!=='' ? await hashPassword(password) : null;
    // No await inside this transaction: concurrent updates cannot remove the last admin.
    this.db.exec('BEGIN IMMEDIATE');
    try{
      const actor=this.get(actorId);
      if(!actor?.active || actor.role!=='admin')throw Error('Apenas administradores podem gerenciar usuarios.');
      const current=id===undefined?null:this.get(id);
      if(id!==undefined && !current)throw Error('Usuario nao encontrado.');
      if(current && input.version!==current.version)throw Error('Este usuario foi alterado. Atualize a lista antes de salvar.');
      if(id===actorId && (!input.active || input.role!=='admin'))throw Error('Voce nao pode desativar ou retirar o perfil administrador da propria conta.');
      if(current?.active && current.role==='admin' && (!input.active || input.role!=='admin')){
        const admins=this.db.prepare("SELECT COUNT(*) AS count FROM users WHERE role='admin' AND active=1").get().count;
        if(admins<=1)throw Error('Mantenha pelo menos um administrador ativo.');
      }
      if(this.db.prepare('SELECT id FROM users WHERE username=? AND id<>?').get(username,id||0))throw Error('Este nome de usuario ja esta cadastrado.');
      let savedId=id;
      if(current){
        this.db.prepare('UPDATE users SET name=?,username=?,role=?,active=?,password_hash=COALESCE(?,password_hash),version=version+1 WHERE id=?').run(name,username,input.role,Number(input.active),hash,id);
      }else{
        savedId=Number(this.db.prepare('INSERT INTO users(name,username,password_hash,role,active,created) VALUES(?,?,?,?,?,?)').run(name,username,hash,input.role,Number(input.active),new Date().toISOString()).lastInsertRowid);
      }
      const result=this.get(savedId);this.db.exec('COMMIT');return result;
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
}
