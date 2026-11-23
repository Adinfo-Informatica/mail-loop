import { apiError } from './api-error.js';
import { presentQueue } from './queue-view.js';
const $ = selector => document.querySelector(selector);
const names = { pending: 'Pendente', sending: 'Em tentativa', simulated: 'Simulado', accepted: 'Aceito pelo SMTP', review: 'Erro ao enviar', uncertain: 'Erro ao enviar', error: 'Erro ao enviar', cancelled: 'Cancelado', suppressed: 'Descadastrado' };
let token, initialized = false, real = false;
function notice(message, error = false) { $('#notice').textContent = message; $('#notice').className = error ? 'error' : ''; }
async function api(path, body) {
  const method = body === undefined ? 'GET' : 'POST';
  const response = await fetch('/api/' + path, body === undefined ? {} : { method, headers: { 'Content-Type': 'application/json', 'x-app-token': token }, body: JSON.stringify(body) });
  if (!response.ok) throw await apiError(response, method + ' /api/' + path);
  return response.json();
}
async function refresh() {
  const state = await api('state'); token = state.token; real = !state.dryRun;
  const view = presentQueue(state);
  $('#mode').hidden = view.production && real && !state.sendBlocked;
  $('#stats').classList.toggle('production', view.production);
  $('#mode').textContent = state.sendBlocked ? 'Envio bloqueado' : real ? 'Envio real' : 'Simulação';
  $('#sender').textContent = state.sender || 'Não informado';
  $('#queueStatus').textContent = state.config.paused ? 'Fila pausada' : 'Fila em execução';
  $('#next').textContent = `${state.config.batch} ${state.config.batch === 1 ? 'destinatário' : 'destinatários'} a cada ${state.config.interval / 60} min`;
  $('#resume').disabled = !state.config.paused || state.sendBlocked; $('#pause').disabled = !!state.config.paused;
  $('#unsubscribeStatus').textContent = state.unsubscribeReady ? 'Link configurado. Verifique o acesso externo antes de enviar.' : 'Configure o link público de descadastro para liberar os envios reais.';
  $('#suppressionCount').textContent = `${state.suppressionCount || 0} endereço(s) bloqueado(s) para novos envios. Últimos 100 descadastros:`;
  $('#suppressions').replaceChildren();
  for (const item of state.suppressions || []) { const row = document.createElement('tr'); for (const value of [item.recipient, new Date(item.created).toLocaleString('pt-BR')]) { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); } $('#suppressions').append(row); }
  if (!state.suppressions?.length) { const row = document.createElement('tr'); const cell = document.createElement('td'); cell.colSpan = 2; cell.textContent = 'Nenhum descadastro registrado neste ambiente.'; row.append(cell); $('#suppressions').append(row); }
  if (!initialized) { $('#settings').elements.minutes.value = state.config.interval / 60; $('#settings').elements.batch.value = state.config.batch; initialized = true; }
  $('#stats').replaceChildren();
  for (const { key, total } of view.cards) { const card = document.createElement('div'); card.className = 'stat'; const value = document.createElement('strong'); value.textContent = total; const label = document.createElement('span'); label.textContent = names[key]; card.append(value, label); $('#stats').append(card); }
  $('#history').replaceChildren();
  for (const job of view.jobs) {
    const row = document.createElement('tr');
    const recipient = row.insertCell(); recipient.textContent = job.recipient;
    const subject = document.createElement('small'); subject.textContent = job.subject; recipient.append(subject);
    const status = document.createElement('span'); status.className = 'status ' + job.status; status.textContent = names[job.status] || job.status;
    row.insertCell().append(status);
    row.insertCell().textContent = new Date(job.updated).toLocaleString('pt-BR');
    const detail = row.insertCell();
    if (['review', 'uncertain'].includes(job.status)) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Ver erro'; button.setAttribute('aria-label', 'Ver erro do envio ' + job.id);
      button.addEventListener('click', () => showError(job.id)); detail.append(button);
    } else { detail.textContent = job.detail; }
    $('#history').append(row);
  }
  if (!view.jobs.length) { const row = document.createElement('tr'); const cell = document.createElement('td'); cell.colSpan = 4; cell.textContent = 'Nenhuma mensagem para exibir.'; row.append(cell); $('#history').append(row); }
}
async function action(task) { try { await task(); await refresh(); } catch (error) { notice(error.message, true); } }
$('#compose').onsubmit = event => { event.preventDefault(); const form = event.target; const button = form.querySelector('.primary'); button.disabled = true; action(async () => { const result = await api('jobs', { groupId: Number($('#sendGroup').value), groupRevision: Number($('#sendGroup').selectedOptions[0]?.dataset.revision), recipients: form.elements.recipients.value.split(/[\n,;]+/).map(x => x.trim()).filter(Boolean), subject: form.elements.subject.value, body: form.elements.body.value, previewId: activePreview }); if (result.added) { clearPreview(); form.reset(); } notice(`${result.added} mensagem(ns) adicionada(s). ${result.skipped || 0} destinatário(s) ignorado(s) por descadastro.`); }).finally(() => button.disabled = false); };
$('#settings').onsubmit = event => { event.preventDefault(); action(async () => { await api('settings', { interval: Number(event.target.elements.minutes.value) * 60, batch: Number(event.target.elements.batch.value) }); notice('Configuração salva. O prazo da rodada já agendada é preservado.'); }); };
$('#resume').onclick = () => action(async () => { if (real && !confirm('Iniciar ENVIO REAL para os destinatários pendentes?')) return; await api('pause', { paused: false }); notice(real ? 'Envio real iniciado.' : 'Simulação iniciada. Nenhum e-mail será enviado.'); });
$('#pause').onclick = () => action(async () => { await api('pause', { paused: true }); notice('Fila pausada. Uma tentativa já iniciada pode concluir.'); });
$('#cancel').onclick = () => action(async () => { if (!confirm('Cancelar todas as mensagens pendentes?')) return; const result = await api('cancel', {}); notice(`${result.cancelled} pendente(s) cancelado(s).`); });
refresh().catch(error => notice(error.message, true)); setInterval(() => refresh().catch(() => notice('Sem conexão com o servidor.', true)), 3000);
let activePreview = null;
let manualSubject = '';
const composer = $('#compose');
function clearPreview() {
  if (activePreview) composer.elements.subject.value = manualSubject;
  activePreview = null;
  composer.elements.subject.readOnly = false;
  composer.elements.body.disabled = false;
  $('#manualBody').hidden = false;
  $('#richPreview').hidden = true;
  $('#modelContent').replaceChildren();
  $('#modelSelect').value = '';
  $('#modelFile').value = '';
  $('#modelInfo').textContent = '';
}
function showPreview(model) {
  if (!activePreview) manualSubject = composer.elements.subject.value;
  activePreview = model.previewId;
  composer.elements.subject.value = model.subject;
  composer.elements.subject.readOnly = true;
  composer.elements.body.disabled = true;
  $('#manualBody').hidden = true;
  $('#richPreview').hidden = false;
  const content = $('#modelContent');
  if (model.html) content.innerHTML = model.html;
  else content.textContent = model.body;
  $('#modelInfo').textContent = model.omittedImages ? 'Prévia carregada. Imagens externas foram omitidas.' : 'Mensagem carregada. Confira a prévia antes de adicionar à fila.';
}
async function loadModel(task) {
  const controls = [$('#listModels'), $('#modelSelect'), $('#modelFile'), $('#clearModel'), composer.querySelector('.primary')];
  controls.forEach(control => control.disabled = true);
  $('#modelInfo').textContent = 'Carregando…';
  try { await task(); }
  catch (error) { clearPreview(); $('#modelInfo').textContent = error.message; }
  finally { controls.forEach(control => control.disabled = false); }
}
$('#listModels').onclick = () => loadModel(async () => {
  clearPreview();
  const { models } = await api('campaigns/list', {});
  const select = $('#modelSelect');
  select.replaceChildren(new Option('Escolha uma mensagem', ''));
  for (const model of models) select.add(new Option(model.subject, model.id));
  $('#modelChoice').hidden = !models.length;
  $('#modelInfo').textContent = models.length ? 'Escolha a mensagem para conferir a prévia.' : 'Pasta vazia. Salve uma mensagem em Campanhas e busque novamente.';
});
$('#modelSelect').onchange = event => {
  const id = event.target.value;
  if (!id) return clearPreview();
  loadModel(async () => showPreview(await api('campaigns/preview', { id })));
};
$('#modelFile').onchange = event => {
  const file = event.target.files[0];
  if (!file) return;
  loadModel(async () => {
    if (file.size > 2 * 1024 * 1024) throw Error('Selecione um arquivo de até 2 MB.');
    const response = await fetch('/api/campaigns/file', { method: 'POST', headers: { 'Content-Type': 'message/rfc822', 'x-app-token': token }, body: file });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'Não foi possível importar o arquivo.');
    $('#modelSelect').value = '';
    showPreview(data);
  });
};
$('#clearModel').onclick = clearPreview;

async function refreshGroups() {
  const select = $('#sendGroup');
  const items = await api('groups');
  const selected = select.selectedOptions[0];
  const previous = selected?.value;
  const revision = selected?.dataset.revision;
  select.replaceChildren(new Option('Escolha um grupo ou informe e-mails abaixo', ''));
  for (const group of items) {
    const option = new Option(group.name + ' (' + group.total + ')', group.id);
    option.dataset.revision = group.revision;
    select.add(option);
    if (option.value === previous && option.dataset.revision === revision) option.selected = true;
  }
  if (previous && !select.value) notice('O grupo selecionado mudou. Confira a lista antes de enviar.', true);
}
refreshGroups().catch(error => notice(error.message, true));
window.addEventListener('focus', () => refreshGroups().catch(error => notice(error.message, true)));

let errorRequest = 0;
async function showError(id) {
  const request = ++errorRequest, dialog = $('#errorDialog'), content = $('#errorContent');
  content.textContent = 'Carregando registro…'; if (!dialog.open) dialog.showModal();
  try {
    const log = await api('jobs/' + id + '/error'); if (request !== errorRequest) return; content.replaceChildren();
    const list = document.createElement('dl');
    for (const [name, value] of [['Envio', log.jobId], ['Data', new Date(log.created).toLocaleString('pt-BR')], ['Categoria', log.category], ['Código', log.code], ['Etapa SMTP', log.phase], ['Código SMTP', log.smtpCode || 'Não informado']]) {
      const label = document.createElement('dt'), detail = document.createElement('dd'); label.textContent = name; detail.textContent = value; list.append(label, detail);
    }
    const guidance = document.createElement('p'); guidance.textContent = log.guidance; content.append(list, guidance);
    if (log.legacy) { const note = document.createElement('p'); note.textContent = 'Registro anterior à criação do log. Detalhes técnicos não estão disponíveis.'; content.append(note); }
  } catch (error) { if (request === errorRequest) content.textContent = error.message; }
}
$('#closeError').addEventListener('click', () => $('#errorDialog').close());
$('#clearHistory').onclick = () => {
  if (!confirm('Excluir permanentemente TODO o histórico de envios finalizados e seus detalhes de erro para TODOS os usuários, incluindo registros fora desta página? Mensagens pendentes ou em envio, usuários, grupos e descadastros serão preservados. Esta ação não pode ser desfeita.')) return;
  const button = $('#clearHistory'); button.disabled = true;
  action(async () => {
    const result = await api('history/clear', { confirm: true });
    errorRequest++; $('#errorDialog').close(); $('#errorContent').replaceChildren();
    notice(`${result.deleted} registro(s) removido(s) do histórico compartilhado.`);
  }).finally(() => { button.disabled = false; });
};
