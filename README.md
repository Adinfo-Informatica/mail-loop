# Central de envios — versão inicial

Aplicação local para Node.js 24 e Windows. Não exige hospedagem em nuvem. O SMTP configurado faz a entrega: usar Locaweb significa utilizar o serviço SMTP dela, embora o programa rode na empresa.

## Executar no Windows

Abra o PowerShell nesta pasta e execute:

```powershell
npm install
Copy-Item .env.example .env.development
npm start
```

Abra http://127.0.0.1:3100. O modo inicial é SIMULAÇÃO. Cadastre uma mensagem, adicione destinatários e clique em Iniciar fila. A primeira rodada pode começar imediatamente; as seguintes respeitam o intervalo. Padrão: um destinatário a cada cinco minutos. Um lote envia mensagens individuais sequenciais. A lista não se repete automaticamente.

Se `.env.development` já existe, pule a cópia para preservar suas configurações.

## Ambientes e configurações da empresa

- `npm start` ou `npm run start:dev`: carrega somente `.env.development`.
- `npm run start:prod`: carrega somente `.env.production`.
- `npm run start:local`: carrega somente `.env`, para compatibilidade com o formato inicial.
- Arquivo ausente gera erro; não há tentativa de usar credenciais de outro ambiente.
- Variáveis definidas no processo têm prioridade sobre as do arquivo selecionado.

O aplicativo reconhece `MAIL_SYSTEM_HOST`, `MAIL_SYSTEM_PORT`, `MAIL_SYSTEM_USER` e `MAIL_SYSTEM_PASSWORD`. Os equivalentes `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` e `SMTP_PASS` têm prioridade quando definidos, inclusive se estiverem vazios. Os grupos `MAIL_GMAIL_*`, `MAIL_ADINFO_*` e `MAILBOX_*` não são utilizados.

Se `MAIL_FROM` não estiver definido, o remetente será o usuário SMTP quando ele for um endereço de e-mail válido. Confirme a autorização dessa conta antes do envio real. Sem `SMTP_SECURE`, a porta 465 seleciona TLS direto; as demais selecionam STARTTLS obrigatório. O administrador pode definir `SMTP_SECURE=true` ou `false` explicitamente.

`DRY_RUN` ausente significa simulação. Apenas o valor exato `false` habilita envio real. `APPLICATION_TEST_MODE` não controla os envios; as demais configurações do projeto original (diretórios, porta, tokens e senhas) também não são utilizadas. Para alterar a porta do painel, use `PORT`; o padrão permanece 3100.

Desenvolvimento usa `data/queue-development.sqlite` e produção usa `data/queue-production.sqlite`, para não misturar testes e envios. O banco anterior `data/queue.sqlite` permanece preservado e é usado apenas por `start:local`. Pare a instância anterior antes de iniciar outra na mesma porta.

## Segurança e operação

- O painel escuta apenas em 127.0.0.1. No servidor Windows, acesse por sessão local ou Área de Trabalho Remota. Não exponha na rede antes de implementar login e HTTPS.
- Somente uma instância do processo deve usar esta pasta/banco. Não execute duas cópias contra o mesmo banco.
- SQLite guarda mensagens e destinatários no banco do ambiente dentro de `data/`. Restrinja o acesso à pasta à conta de serviço e administradores. Faça backup com o processo parado e defina retenção conforme a política da empresa.
- A fila sempre volta pausada após um reinício. Reiniciar não reenvia registros simulados, aceitos, cancelados ou que exigem revisão.
- Simulados são finais: para um teste real, cadastre uma nova mensagem para uma caixa controlada pela empresa.
- Uma falha pausa a fila e exige revisão manual; não existe repetição automática. Interrupções durante SMTP ficam com resultado incerto para evitar duplicatas. Consulte os registros do provedor antes de cadastrar novamente.
- Pausar ou cancelar pendentes não cancela uma conexão SMTP já iniciada.
- Mantenha `.env` e `data` fora do Git. Nunca compartilhe credenciais no chat.

## SMTP real — após confirmar infraestrutura

Preencha no arquivo do ambiente selecionado o host, porta, tipo de TLS, usuário, senha e remetente autorizados pelo administrador. Não adivinhe os parâmetros da Locaweb. Porta 465 normalmente usa `SMTP_SECURE=true`; STARTTLS normalmente usa 587 e `SMTP_SECURE=false`. O aplicativo exige TLS e valida certificados. A falta de senha impede iniciar em modo real, mas permite simulação.

`DRY_RUN=false` habilita envio real após reiniciar. A fila continuará pausada até clicar em Iniciar fila. Teste primeiro com um endereço próprio. Não há garantia de caixa de entrada; aceitação SMTP é somente uma etapa.

Confirme domínio, SPF, DKIM, DMARC, remetente autorizado e limites de volume/velocidade do plano. Com SMTP da Locaweb, a reputação e o DNS reverso do IP de entrega são responsabilidade da infraestrutura de envio dela; o IP fixo do servidor do aplicativo não substitui isso.

O descadastro e o bloqueio por solicitação do destinatário estão implementados. Esta versão ainda não automatiza devoluções nem reclamações. Antes de campanhas comerciais em produção, validar a URL pública, o domínio e a origem/autorização da lista. Não usar listas compradas. Não rotacionar remetentes para contornar limites.

## Descadastro

Cada mensagem nova inclui um botão HTML e uma alternativa em texto com link individual. O link usa um token aleatório de 256 bits, sem expor o endereço do destinatário na URL; somente seu hash é guardado no banco. Acessar o link por GET/HEAD não altera o cadastro. Um POST confirma o descadastro. Também são aceitos os POSTs one-click do RFC 8058 em formato urlencoded ou multipart, sem login, cookies ou redirecionamento.

O descadastro bloqueia todos os novos envios deste disparador para o endereço no ambiente selecionado. Mensagens ainda pendentes passam a `Descadastrado`; novas inclusões desse endereço são ignoradas e contadas no aviso do painel. Há uma nova verificação antes de cada tentativa, inclusive dentro de lotes. Uma mensagem já em transmissão pode concluir. Não existe botão de reinscrição automática.

Os registros persistem no mesmo SQLite da fila. Não apague tokens nem a tabela de bloqueios ao limpar o histórico. Os links não expiram automaticamente. Faça backup do banco completo; mantenha o domínio e os links funcionando. Quem tiver o link de uma mensagem encaminhada poderá descadastrar o destinatário original. A página não mostra seu endereço.

### Teste local, sem SMTP

```powershell
npm run preview:unsubscribe
```

Abra http://127.0.0.1:3199/demo para ver uma mensagem fictícia, clicar no botão e confirmar. A demonstração usa banco em memória, não envia mensagens e não altera a lista real. Reiniciar essa demonstração restaura os dados fictícios.

### Configuração externa pendente

Como ainda não há um domínio HTTPS público definido, o envio real fica bloqueado, mesmo com `DRY_RUN=false`. O painel explica o bloqueio; é possível usar simulação. Definir a URL libera a configuração, mas não comprova que DNS, certificado e proxy estejam funcionando: valide o fluxo externamente antes de iniciar.

No arquivo do ambiente escolhido:

```env
UNSUBSCRIBE_BASE_URL=https://emails.seudominio.com.br
UNSUBSCRIBE_PORT=3101
```

O endereço acima é ilustrativo: não o copie como endereço de produção. Use somente a origem HTTPS, sem caminho. O serviço em `127.0.0.1:3101` contém apenas as rotas `/unsubscribe/:token`. Configure um proxy reverso no servidor da empresa com certificado público válido encaminhando GET, HEAD e POST dessas rotas a essa porta. Se o proxy estiver em outro servidor, planeje a conexão entre eles; o aplicativo continua escutando apenas em loopback. Não encaminhe a porta administrativa 3100 à internet e não adicione autenticação/CAPTCHA à rota de descadastro.

Restrinja tamanho de corpo no proxy, mantenha POSTs sem redirecionamento e evite registrar tokens completos nos logs de acesso. O aplicativo limita corpos a 8 KiB. Não há instalação de DNS, certificados, proxy ou serviço Windows nesta entrega.

Desenvolvimento e produção possuem bancos independentes. Antes de começar campanhas, escolha um ambiente definitivo. Ao migrar um ambiente que já fez envios reais, pare os processos e migre o banco completo (tokens e bloqueios inclusos); começar com um banco vazio perde descadastros e invalida links antigos.

### Cabeçalhos e validação de entrega

São enviados `List-Unsubscribe` e `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Para o provedor oferecer o botão nativo, o servidor SMTP precisa assinar esses dois cabeçalhos com DKIM. Verifique a lista `h=` da assinatura de uma mensagem real após configurar o endereço público. A presença dos cabeçalhos por si só não garante a exibição desse botão. O botão no corpo é independente.

Referências: https://www.rfc-editor.org/rfc/rfc8058 e https://support.google.com/mail/answer/81126?hl=pt-BR . O teste fornecido para rdmakes.com.br mostrou DMARC FAIL; a causa deve ser investigada nos cabeçalhos completos e no DNS antes de ampliar os envios. Não foram alterados registros DNS.

## Servidor Windows

Para um piloto supervisionado, execute `npm start` em sessão local. A instalação como serviço Windows ou tarefa na inicialização deve ser feita depois de confirmar o servidor, a conta de execução e a política operacional. Esta entrega não instala serviços nem configura DNS. Como o reinício pausa a fila, o operador precisa retomá-la; defina uma política de retomada antes de operação sem supervisão.

## Testes

`npm test` testa intervalos, deduplicação, validação, pausa em falhas, concorrência e ausência de envio em simulação. Nenhum teste envia e-mail real.

## Estrutura do projeto

- `src/server.js`: inicializacao do servidor, rotas do painel e processamento da fila.
- `src/config/`: leitura dos ambientes e caminhos absolutos do projeto.
- `src/infrastructure/`: controle de instancia unica.
- `src/modules/campaigns/`: modelos recebidos por IMAP ou arquivos EML.
- `src/modules/groups/`: cadastro de grupos e destinatarios.
- `src/modules/queue/`: persistencia e processamento dos envios.
- `src/modules/unsubscribe/`: descadastro, bloqueios e pagina publica.
- `public/`: paginas HTML; estilos em `css/` e scripts em `js/`.
- `tests/`: testes automatizados, executados com `npm test`.
- `scripts/`: ferramentas auxiliares, como a previa local de descadastro.
- `docs/`: guias do projeto.
- `data/`: bancos e trava de execucao (dados locais, fora do Git).

Os arquivos `.env.development`, `.env.production` e `.env.example` ficam na raiz.
Os comandos continuam sendo `npm run start:dev`, `npm run start:prod` e
`npm run preview:unsubscribe`. Para executar diretamente, use
`node src/server.js --env=development`.
Os caminhos de configuracao, banco e interface sao resolvidos pela localizacao do
projeto, sem depender da pasta atual do terminal. Os bancos existentes nao precisam
ser movidos ou recriados.
