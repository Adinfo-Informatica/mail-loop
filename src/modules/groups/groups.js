import { emailOK } from '../queue/queue.js';

export class Groups {
  constructor(db) {
    this.db = db;
    db.exec(`CREATE TABLE IF NOT EXISTS recipient_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      name_key TEXT NOT NULL UNIQUE, members TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1
    )`);
  }
  list() {
    return this.db.prepare('SELECT id,name,revision,json_array_length(members) AS total FROM recipient_groups ORDER BY name_key').all();
  }
  get(id) {
    const group = this.db.prepare('SELECT id,name,revision,members FROM recipient_groups WHERE id=?').get(Number(id));
    if (!group) throw Error('Grupo não encontrado. Atualize a lista.');
    return {...group, members:JSON.parse(group.members)};
  }
  save({name,members,revision}, id) {
    name = typeof name === 'string' ? name.trim() : '';
    if (!name || name.length > 100) throw Error('Informe um nome de até 100 caracteres.');
    if (!Array.isArray(members) || !members.length || members.length > 5000) throw Error('Informe entre 1 e 5000 endereços.');
    const addresses = [...new Set(members.map(value => typeof value === 'string' ? value.trim().toLowerCase() : ''))];
    const invalid = addresses.find(value => !emailOK(value));
    if (invalid !== undefined) throw Error('Confira o endereço inválido: ' + (invalid || '(vazio)'));
    const key = name.normalize('NFC').toLocaleLowerCase('pt-BR');
    const existing = this.db.prepare('SELECT id FROM recipient_groups WHERE name_key=?').get(key);
    if (existing && existing.id !== id) throw Error('Já existe um grupo com esse nome.');
    if (id === undefined) {
      id = Number(this.db.prepare('INSERT INTO recipient_groups(name,name_key,members) VALUES(?,?,?)').run(name,key,JSON.stringify(addresses)).lastInsertRowid);
    } else {
      const result = this.db.prepare('UPDATE recipient_groups SET name=?,name_key=?,members=?,revision=revision+1 WHERE id=? AND revision=?').run(name,key,JSON.stringify(addresses),id,revision);
      if (!result.changes) throw Error('O grupo mudou. Abra novamente antes de editar.');
    }
    return this.get(id);
  }
  recipients(id,revision,extras) {
    if (!Array.isArray(extras)) throw Error('Lista de destinatários inválida.');
    if (!id) return extras;
    const group = this.get(id);
    if (group.revision !== revision) throw Error('O grupo mudou. Atualize o painel e selecione o grupo novamente.');
    return [...new Set([...group.members,...extras.map(value => typeof value === 'string' ? value.trim().toLowerCase() : '')])];
  }
}
