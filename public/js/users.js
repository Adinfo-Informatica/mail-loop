const form=document.querySelector('#userForm'),fields=document.querySelector('#userFields'),notice=document.querySelector('#notice');
let token,me,editing=null,busy=false,accounts=[];
function message(text,error=false){notice.textContent=text;notice.className=error?'error':'';}
async function api(path,options={}){
 const response=await fetch('/api/'+path,{...options,headers:{'Content-Type':'application/json','x-app-token':token,...options.headers}});
 const data=await response.json();if(!response.ok)throw Error(data.error || 'Não foi possível concluir.');return data;
}
function edit(user=null){
 if(busy)return;editing=user;form.reset();
 form.elements.name.value=user?.name || '';form.elements.username.value=user?.username || '';
 form.elements.role.value=user?.role || 'user';form.elements.active.checked=user ? !!user.active : true;
 const self=user?.id===me?.id;
 form.elements.role.disabled=self;form.elements.active.disabled=self;
 form.elements.password.required=!user;
 document.querySelector('#formTitle').textContent=user?'Editar usuário':'Cadastrar usuário';
 document.querySelector('#passwordLabel').firstChild.textContent=user?'Nova senha (opcional)':'Senha inicial';
 document.querySelector('#passwordHelp').textContent=user?'Deixe vazio para manter a senha atual. Nova senha: mínimo de 12 caracteres.':'Use de 12 a 256 caracteres.';
 document.querySelector('#editHelp').hidden=!user;
 form.elements.name.focus();
}
async function refresh(){
 accounts=await api('users');document.querySelector('#userCount').textContent=`${accounts.length} conta(s) · ${accounts.filter(x=>x.active).length} ativa(s)`;
 const body=document.querySelector('#usersBody');body.replaceChildren();
 for(const user of accounts){
  const row=document.createElement('tr'),identity=document.createElement('td'),name=document.createElement('strong'),username=document.createElement('small');
  name.textContent=user.name+(user.id===me.id?' (você)':'');username.textContent=user.username;identity.append(name,username);row.append(identity);
  const role=document.createElement('td');role.textContent=user.role==='admin'?'Administrador':'Comum';row.append(role);
  const state=document.createElement('td'),badge=document.createElement('span');badge.className='status '+(user.active?'accepted':'inactive');badge.textContent=user.active?'Ativa':'Inativa';state.append(badge);row.append(state);
  const action=document.createElement('td'),button=document.createElement('button');button.type='button';button.textContent='Editar';button.setAttribute('aria-label','Editar '+user.name);button.addEventListener('click',()=>{edit(user);message('');});action.append(button);row.append(action);body.append(row);
 }
}
form.addEventListener('submit',async event=>{
 event.preventDefault();if(busy)return;
 const values={name:form.elements.name.value,username:form.elements.username.value,role:form.elements.role.value,active:form.elements.active.checked,password:form.elements.password.value,version:editing?.version};
 const selected=editing;busy=true;fields.disabled=true;message('Salvando…');
 try{
  await api('users'+(selected?'/'+selected.id:''),{method:selected?'PUT':'POST',body:JSON.stringify(values)});
  if(selected?.id===me.id){location.replace('/login');return;}
  busy=false;edit();await refresh();message(selected?'Usuário atualizado. As sessões anteriores dessa conta foram encerradas.':'Usuário cadastrado.');
 }catch(error){message(error.message,true);}finally{busy=false;fields.disabled=false;}
});
document.querySelector('#newUser').addEventListener('click',()=>{edit();message('');});
document.querySelector('#cancelEdit').addEventListener('click',()=>{edit();message('');});
document.querySelector('#reloadUsers').addEventListener('click',async()=>{if(busy)return;try{await refresh();edit();message('Lista atualizada.');}catch(error){message(error.message,true);}});
try{const auth=await api('auth/me');me=auth.user;token=auth.token;if(me.role!=='admin'){location.replace('/');}else{await refresh();fields.disabled=false;}}catch(error){message(error.message,true);}
