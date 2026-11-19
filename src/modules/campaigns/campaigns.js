import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import sanitizeHtml from 'sanitize-html';

export const maxCampaignBytes = 2 * 1024 * 1024;
export async function parseCampaign(source) {
  if (!source?.length || source.length > maxCampaignBytes) throw Error('Selecione uma mensagem de até 2 MB.');
  const mail = await simpleParser(source, { skipImageLinks:true, skipTextLinks:true });
  if (mail.attachments.length) throw Error('Este modelo contém anexos ou imagens incorporadas. Use um modelo sem anexos para esta versão.');
  const subject = (mail.subject || '').trim();
  const body = (mail.text || '').trim();
  if (!subject || subject.length > 200 || /[\r\n]/.test(subject)) throw Error('O modelo precisa de um assunto de até 200 caracteres.');
  if (!body || body.length > 100000) throw Error('O modelo precisa de conteúdo em texto de até 100 mil caracteres.');
  const html = mail.html ? sanitizeHtml(mail.html, {
    allowedTags:['p','div','span','br','hr','strong','b','em','i','u','s','a','blockquote','h1','h2','h3','ul','ol','li','table','tbody','tr','td','th'],
    allowedAttributes:{a:['href','title'],'*':['style']}, allowedSchemes:['https','http','mailto'], allowProtocolRelative:false,
    allowedStyles:{'*':{'text-align':[/^(left|right|center|justify)$/],'color':[/^#[a-f0-9]{3,8}$/i],
      'font-weight':[/^(bold|normal|[1-9]00)$/],'font-style':[/^(italic|normal)$/],'text-decoration':[/^(underline|line-through)$/]}}
  }) : '';
  return {subject, body, html, omittedImages:!!mail.html && /<img\b/i.test(mail.html)};
}

export async function readCampaigns(config, selection) {
  if (!config.host || !config.user || !config.pass) throw Error('Configure a conta IMAP no servidor para acessar a pasta de campanhas.');
  const client = new ImapFlow({host:config.host, port:config.port, secure:true,
    auth:{user:config.user, pass:config.pass}, logger:false, disableAutoIdle:true,
    connectionTimeout:12000, greetingTimeout:10000, socketTimeout:20000});
  client.on('error',()=>{});
  try {
    await client.connect();
  } catch {
    client.close();
    throw Error('Falha ao conectar à caixa por IMAP. Confira host, porta TLS e credenciais.');
  }
  try {
    const folders = await client.list();
    const folder = folders.find(item=>item.path===config.folder)
      || folders.find(item=>item.path===`INBOX${item.delimiter}${config.folder}`);
    if (!folder) throw Error(`Crie a pasta “${config.folder}” na conta IMAP e salve uma mensagem nela.`);
    const box = await client.mailboxOpen(folder.path,{readOnly:true});
    const validity = String(box.uidValidity);
    if (!selection) {
      const models = [];
      if (box.exists) {
        const start = Math.max(1,box.exists-49);
        for await (const item of client.fetch(`${start}:*`,{uid:true,envelope:true})) {
          models.push({id:`${validity}.${item.uid}`, subject:item.envelope?.subject || '(sem assunto)'});
        }
      }
      return models.reverse();
    }
    const [version, uid] = selection.split('.');
    if (version !== validity || !/^\d+$/.test(uid)) throw Error('A pasta mudou. Atualize a lista de modelos.');
    const item = await client.fetchOne(uid,{size:true},{uid:true});
    if (!item) throw Error('Modelo removido. Atualize a lista.');
    if (item.size > maxCampaignBytes) throw Error('Selecione uma mensagem de até 2 MB.');
    const full = await client.fetchOne(uid,{source:true},{uid:true});
    return parseCampaign(full?.source);
  } finally {client.close();}
}
