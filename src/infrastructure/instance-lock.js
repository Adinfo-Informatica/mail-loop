import { openSync, closeSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
export function acquireLock(path) {
  for (let attempt = 0; attempt < 2; attempt++) {
    let fd;
    try { fd = openSync(path, 'wx'); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const pid = Number(readFileSync(path, 'utf8').trim());
      if (!Number.isInteger(pid) || pid <= 0) throw Error('Trava de instância inválida. Verifique os processos antes de remover data/app.lock.');
      try { process.kill(pid, 0); }
      catch (probe) {
        if (probe.code === 'ESRCH') { unlinkSync(path); continue; }
        throw Error('Não foi possível verificar a instância ativa; inicialização bloqueada.');
      }
      throw Error('O disparador já está em execução. Encerre a instância anterior antes de iniciar outra.');
    }
    try { writeFileSync(fd, String(process.pid)); } finally { closeSync(fd); }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      try { if (readFileSync(path,'utf8').trim() === String(process.pid)) unlinkSync(path); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    };
  }
  throw Error('Não foi possível adquirir a trava do disparador.');
}
