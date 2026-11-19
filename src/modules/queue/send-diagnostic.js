// Only allowlisted diagnostic fields are persisted. Never store raw SMTP messages,
// responses, addresses, credentials or AUTH command arguments.
export function sendDiagnostic(error={}, interrupted=false) {
 if(!error || typeof error!=='object')error={};
 const known={EAUTH:['Autenticação','Confira as credenciais e a autorização da conta SMTP.'],ECONNECTION:['Conexão','Confira o servidor, a porta SMTP e o acesso de rede.'],ECONNREFUSED:['Conexão','O servidor recusou a conexão. Confira a porta e o serviço SMTP.'],EDNS:['DNS','Não foi possível resolver o servidor SMTP. Confira o endereço e o DNS.'],ETIMEDOUT:['Tempo limite','O servidor não respondeu no prazo. Confira a conexão e os registros SMTP antes de reenviar.'],ESOCKET:['Conexão','A conexão foi interrompida. Confira a rede e os registros SMTP antes de reenviar.'],ETLS:['TLS','Confira o certificado e a configuração de segurança SMTP.'],EENVELOPE:['Destinatário','O servidor não aceitou o remetente ou destinatário. Confira a conta e o endereço.'],EMESSAGE:['Mensagem','Não foi possível preparar ou transmitir a mensagem.'],UNSUBSCRIBE_NOT_READY:['Descadastro','Configure e valide a URL pública de descadastro.'],SMTP_NOT_ACCEPTED:['Aceitação SMTP','O servidor não confirmou a aceitação do destinatário.']};
 const code=interrupted?'PROCESS_INTERRUPTED':Object.hasOwn(known,error.code)?error.code:'SMTP_ERROR';
 const command=typeof error.command==='string'?error.command.toUpperCase():'';
 const phase=['CONN','EHLO','HELO','STARTTLS','DATA','QUIT'].includes(command)?command:command.startsWith('AUTH')?'AUTH':command.startsWith('MAIL FROM')?'MAIL FROM':command.startsWith('RCPT TO')?'RCPT TO':'Não informada';
 const smtpCode=Number.isInteger(error.responseCode)&&error.responseCode>=400&&error.responseCode<=599?error.responseCode:null;
 const [category,guidance]=interrupted?['Interrupção','O processo parou durante uma tentativa. A entrega pode ter ocorrido; confira os registros SMTP antes de reenviar.']:known[code] || ['Envio','Falha sem diagnóstico específico. Consulte os registros do servidor SMTP antes de reenviar.'];
 return {code,phase,smtpCode,category,guidance};
}
