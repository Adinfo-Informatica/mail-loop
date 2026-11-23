// Attach the current session token centrally to protected same-origin mutations.
// Never retry a mutation automatically: an email operation may already have run.
const originalFetch=window.fetch.bind(window);
let pendingSession=null;
function expiredSession(){location.replace('/login');return new Error('Sessão expirada. Entre novamente.');}
async function currentSession(){
  if(!pendingSession){
    pendingSession=(async()=>{
      const response=await originalFetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'});
      if(response.status===401)throw expiredSession();
      if(!response.ok)throw Error(`Não foi possível validar a sessão (HTTP ${response.status}).`);
      let auth;try{auth=await response.json();}catch{throw Error('Resposta de sessão inválida. Confira a versão instalada no servidor.');}
      if(typeof auth?.token!=='string' || !/^[a-f0-9]{64}$/.test(auth.token))throw Error('O servidor não forneceu um token de sessão válido. Atualize a aplicação no servidor e entre novamente.');
      return auth;
    })().finally(()=>{pendingSession=null;});
  }
  return pendingSession;
}
window.fetch=async(input,options)=>{
  const url=new URL(input instanceof Request?input.url:String(input),location.href);
  const method=(options?.method || (input instanceof Request?input.method:'GET')).toUpperCase();
  const protectedAction=url.origin===location.origin && url.pathname.startsWith('/api/') && url.pathname!=='/api/auth/login' && !['GET','HEAD','OPTIONS'].includes(method);
  if(protectedAction){
    const auth=await currentSession();
    const headers=new Headers(options?.headers || (input instanceof Request?input.headers:undefined));
    headers.set('x-app-token',auth.token);
    options={...options,headers,credentials:'same-origin'};
  }
  const response=await originalFetch(input,options);
  if(url.origin===location.origin && url.pathname.startsWith('/api/') && response.status===401)throw expiredSession();
  return response;
};
document.addEventListener('DOMContentLoaded',()=>{
  currentSession().then(({user})=>{
    document.querySelectorAll('[data-admin-only]').forEach(link=>{link.hidden=user?.role!=='admin';});
  }).catch(error=>{const notice=document.querySelector('#notice');if(notice){notice.textContent=error.message;notice.className='error';}});
  document.querySelector('#logout')?.addEventListener('click',async()=>{
    try{
      const response=await fetch('/api/auth/logout',{method:'POST'});
      if(!response.ok){let data;try{data=await response.json();}catch{}throw Error(`${data?.error || 'Não foi possível sair.'} (HTTP ${response.status})`);}
      location.replace('/login');
    }catch(error){const notice=document.querySelector('#notice');if(notice){notice.textContent=error.message;notice.className='error';}}
  });
});
