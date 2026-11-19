const form=document.querySelector('#login');
form.addEventListener('submit',async event=>{
  event.preventDefault();const button=form.querySelector('button'),error=document.querySelector('#error');button.disabled=true;error.textContent='';
  try{
    const response=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','x-mailloop-login':'1'},body:JSON.stringify({username:form.elements.username.value.trim(),password:form.elements.password.value})});
    if(!response.ok){let data;try{data=await response.json();}catch{}throw Error(data?.error || 'Nao foi possivel entrar. Confira o endereco de acesso.');}
    location.replace('/');
  }catch(err){error.textContent=err.message;form.elements.password.value='';form.elements.password.focus();}finally{button.disabled=false;}
});
