const form = document.querySelector('#editor');
const status = document.querySelector('#notice');
let token, current;
async function request(path, options) {
  const response = await fetch('/api/'+path,options);
  const data = await response.json();
  if (!response.ok) throw Error(data.error || 'Falha na operação.');
  return data;
}
function showGroup(group) {
  current = group;
  form.elements.groupName.value = group?.name || '';
  form.elements.members.value = group?.members.join('\n') || '';
  document.querySelector('#editorTitle').textContent = group ? 'Editar grupo' : 'Novo grupo';
}
async function listGroups() {
  const groups = await request('groups');
  const list = document.querySelector('#list');
  list.replaceChildren();
  if (!groups.length) list.textContent = 'Nenhum grupo cadastrado.';
  for (const group of groups) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = group.name + ' (' + group.total + ')';
    button.onclick = async () => {
      try {showGroup(await request('groups/'+group.id));status.textContent='';}
      catch(error){status.textContent=error.message;}
    };
    list.append(button);
  }
}
document.querySelector('#new').onclick = () => {showGroup(null);form.elements.groupName.focus();status.textContent='';};
form.onsubmit = async event => {
  event.preventDefault();
  const save = document.querySelector('#save');
  save.disabled = true;
  try {
    const members = form.elements.members.value.split(/[\n,;]+/).map(s=>s.trim()).filter(Boolean);
    const saved = await request(current ? 'groups/'+current.id : 'groups',{
      method:current ? 'PUT' : 'POST',
      headers:{'Content-Type':'application/json','x-app-token':token},
      body:JSON.stringify({name:form.elements.groupName.value,members,revision:current?.revision})
    });
    showGroup(saved);await listGroups();
    status.textContent = 'Grupo salvo com '+saved.members.length+' endereço(s).';
  } catch(error){status.textContent=error.message;}
  finally{save.disabled=false;}
};
try {
  token=(await request('state')).token;
  await listGroups();
  document.querySelector('#save').disabled=false;
} catch(error){status.textContent=error.message;}
