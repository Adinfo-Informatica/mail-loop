// Shared authentication behavior for all protected pages, including raw file uploads.
const originalFetch=window.fetch.bind(window);
window.fetch=async(...args)=>{
  const response=await originalFetch(...args);
  if(response.status===401){location.replace('/login');throw Error('Sessao expirada. Entre novamente.');}
  return response;
};
document.addEventListener('DOMContentLoaded',()=>{
  fetch('/api/auth/me').then(response=>{if(!response.ok)throw Error('Falha ao consultar acesso.');return response.json();}).then(({user})=>{
    document.querySelectorAll('[data-admin-only]').forEach(link=>{link.hidden=user.role!=='admin';});
  }).catch(()=>{});
  document.querySelector('#logout')?.addEventListener('click',async()=>{
    try{
      const state=await (await fetch('/api/state')).json();
      const response=await fetch('/api/auth/logout',{method:'POST',headers:{'x-app-token':state.token}});
      if(!response.ok)throw Error('Nao foi possivel sair. Tente novamente.');
      location.replace('/login');
    }catch(error){const notice=document.querySelector('#notice');if(notice)notice.textContent=error.message;}
  });
});
