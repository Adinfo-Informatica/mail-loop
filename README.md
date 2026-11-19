# MailLoop

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-24%2B-339933?logo=node.js&amp;logoColor=white" alt="Node.js 24 ou superior" />
  <img src="https://img.shields.io/badge/Express-5-000000?logo=express&amp;logoColor=white" alt="Express 5" />
  <img src="https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&amp;logoColor=white" alt="SQLite" />
  <img src="https://img.shields.io/badge/JavaScript-ES_Modules-F7DF1E?logo=javascript&amp;logoColor=black" alt="JavaScript ES Modules" />
</p>

<p align="center">Organize seus contatos, prepare mensagens e acompanhe os envios em uma única central.</p>

<p align="center">
  <a href="#sobre-o-projeto">Sobre</a> ·
  <a href="#funcionalidades">Funcionalidades</a> ·
  <a href="#como-executar">Instalação</a> ·
  <a href="#configuracao">Configuração</a> ·
  <a href="#estrutura">Estrutura</a>
</p>

<a id="sobre-o-projeto"></a>
## Sobre o projeto

O **MailLoop** é uma aplicação web para gerenciar envios de e-mail em servidor próprio. Reúne composição de mensagens, grupos de destinatários, fila persistente, controle de acesso e descadastro em um painel.

A aplicação utiliza uma conta SMTP configurada pelo responsável pela instalação. Os registros ficam em SQLite, com bancos separados para desenvolvimento e produção.

<a id="funcionalidades"></a>
## Funcionalidades

| Recurso | O que oferece |
| --- | --- |
| **Central de envios** | Composição de mensagens e acompanhamento da fila e do histórico. |
| **Grupos de destinatários** | Cadastro e edição de listas, com remoção de endereços duplicados. |
| **Mensagens prontas** | Leitura de modelos por IMAP ou importação de arquivos `.eml`. |
| **Ritmo configurável** | Intervalo entre rodadas e quantidade de destinatários por rodada. |
| **Modo de simulação** | Testes da fila sem realizar envios SMTP. |
| **Descadastro** | Link individual nas mensagens e bloqueio de novos envios ao destinatário. |
| **Usuários e permissões** | Login, contas administrativas e contas comuns. |
| **Hospedagem própria** | Suporte a HTTPS diretamente no Node.js. |

### Perfis de acesso

| Perfil | Permissões |
| --- | --- |
| Usuário comum | Utilizar mensagens, grupos, fila, histórico e consulta de descadastros. |
| Administrador | Todas as funções acima, além de cadastrar e editar contas, redefinir senhas e desativar acessos. |

A área **Usuários** fica disponível para administradores. Alterações em uma conta encerram suas sessões. Não é permitido desativar a própria conta administrativa nem retirar seu perfil de administrador.

<a id="como-executar"></a>
## Como executar

### Requisitos

- Node.js **24 ou superior**, com npm.
- Terminal na pasta do projeto.
- Conta SMTP para envios reais; acesso IMAP para buscar modelos na caixa de e-mail.

### Instalação local

No PowerShell:

```powershell
npm ci

# Crie a configuração somente se o arquivo ainda não existir.
if (!(Test-Path .env.development)) {
    Copy-Item .env.example .env.development
}

npm run setup:admin -- --env=development
npm run start:dev
```

O comando de cadastro solicita usuário e senha no terminal. A senha não aparece durante a digitação e é armazenada como hash. Execute esse comando com a aplicação parada.

Acesse **http://localhost:3100** e entre com a conta cadastrada. O arquivo de exemplo utiliza `DRY_RUN=true`, permitindo testar sem enviar e-mails.

### Comandos disponíveis

| Comando | Finalidade |
| --- | --- |
| `npm start` ou `npm run start:dev` | Iniciar usando `.env.development`. |
| `npm run start:prod` | Iniciar usando `.env.production`. |
| `npm run start:local` | Iniciar usando `.env`, para compatibilidade. |
| `npm run setup:admin -- --env=development` | Cadastrar ou recuperar um administrador no ambiente indicado. |
| `npm run preview:unsubscribe` | Abrir uma demonstração isolada do descadastro. |
| `npm test` | Executar os testes, quando a pasta `tests/` estiver disponível. |

A demonstração de descadastro fica em **http://localhost:3199/demo**, usa dados fictícios em memória e não altera a base da aplicação.

<a id="configuracao"></a>
## Configuração

Use [`.env.example`](.env.example) como referência. Cada execução lê apenas o arquivo do ambiente escolhido; variáveis definidas no processo têm prioridade sobre esse arquivo.

| Variável | Finalidade |
| --- | --- |
| `HOST` / `PORT` | Endereço de escuta e porta do painel. |
| `ALLOWED_HOSTS` | Domínios ou IPv4 permitidos, separados por vírgula, sem protocolo ou porta. |
| `DRY_RUN` | `true` para simulação; `false` para habilitar envios reais. |
| `SMTP_HOST` / `SMTP_PORT` | Servidor SMTP e sua porta. |
| `SMTP_SECURE` | `true` para TLS direto; `false` para conexão com STARTTLS. |
| `SMTP_USER` / `SMTP_PASS` | Credenciais da conta de envio. |
| `MAIL_FROM` | Endereço remetente autorizado. |
| `IMAP_HOST` / `IMAP_PORT` | Servidor IMAP e porta para consultar modelos. |
| `IMAP_USER` / `IMAP_PASS` | Credenciais IMAP, quando configuradas separadamente. |
| `IMAP_CAMPAIGN_FOLDER` | Pasta dos modelos de mensagem; padrão: `Campanhas`. |
| `UNSUBSCRIBE_BASE_URL` | Origem HTTPS pública do descadastro, sem caminho. |
| `UNSUBSCRIBE_PORT` | Porta auxiliar local do serviço de descadastro. |
| `TLS_CERT_FILE` / `TLS_KEY_FILE` | Caminhos dos arquivos PEM de certificado e chave privada. |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH` | Configuração inicial criada pelo comando de cadastro. |

Se não forem informadas credenciais IMAP separadas, o sistema pode reutilizar as credenciais SMTP quando servidor e usuário correspondem à mesma conta. Os parâmetros de SMTP e TLS devem seguir as orientações do provedor utilizado.

Depois da criação inicial, as contas são gerenciadas pelo banco de dados. Alterar os campos administrativos do `.env` não sobrescreve usuários existentes. Utilize o painel ou o comando local de recuperação com o processo parado.

### Produção

1. Crie `.env.production` a partir do exemplo, sem sobrescrever configurações existentes.
2. Configure SMTP, domínio permitido, endereço de escuta e certificado HTTPS válido.
3. Configure `UNSUBSCRIBE_BASE_URL`, por exemplo: `https://mail.example.com`.
4. Cadastre o administrador com `npm run setup:admin -- --env=production`.
5. Inicie com `npm run start:prod` e valide login e descadastro antes dos envios reais.

O HTTPS é obrigatório em produção e para escuta fora do endereço local. Sem proxy, o servidor HTTPS principal atende tanto o painel quanto `/unsubscribe/TOKEN`; o descadastro é público e não exige login. A porta auxiliar de descadastro permanece restrita ao acesso local.

DNS, certificado, firewall e execução como serviço devem ser configurados no servidor. A aplicação não provisiona essa infraestrutura. Mantenha `DRY_RUN=true` durante os testes iniciais; o envio real também depende da configuração da URL pública de descadastro.

## Operação

- A fila inicia pausada após cada reinício. O padrão é um destinatário a cada cinco minutos.
- Falhas de envio exigem revisão; não há repetição automática de tentativas com resultado incerto.
- Pausar a fila não interrompe uma conexão SMTP que já começou. Sair do painel não pausa os envios.
- O estado **Aceito pelo SMTP** não confirma entrega na caixa de entrada.
- O descadastro bloqueia novas inclusões e cancela envios pendentes para o endereço. Preserve seus registros e tokens ao migrar ou restaurar dados.
- Faça backup do banco completo com a aplicação parada. Desenvolvimento e produção possuem bases independentes.
- Modelos de e-mail têm o HTML sanitizado. Anexos e imagens incorporadas não são aceitos; imagens externas são omitidas.

## Segurança e dados locais

Credenciais, bancos, backups, chaves privadas e dados de destinatários devem permanecer fora do repositório. O [`.gitignore`](.gitignore) inclui regras para esses arquivos. O `.env.example` contém apenas uma estrutura de configuração, sem credenciais reais.

Use contas individuais e conceda o perfil de administrador somente a quem gerencia os acessos. Não há cadastro público de usuários nem recuperação de senha por e-mail.

<a id="estrutura"></a>
## Estrutura do projeto

```text
public/                 # Páginas da aplicação
  css/                  # Estilos
  js/                   # Scripts da interface
src/
  config/               # Configuração e caminhos
  infrastructure/       # Controle de instância
  modules/
    auth/               # Login, sessões e usuários
    campaigns/          # Modelos de mensagem
    groups/             # Grupos de destinatários
    queue/              # Fila e persistência dos envios
    unsubscribe/        # Descadastro e bloqueios
  server.js             # Inicialização e rotas
scripts/                # Cadastro administrativo e demonstração
docs/                   # Documentação complementar, quando disponível
tests/                  # Testes locais
data/                   # Dados locais; fora do Git
.env.example            # Modelo de configuração
```

## Testes e limitações

Os testes locais cobrem fila, configuração, descadastro, autenticação e permissões, sem enviar e-mails reais. A pasta `tests/` está atualmente ignorada pelo Git e não acompanha um clone do repositório; `npm test` exige que ela esteja disponível.

A aplicação ainda não automatiza o tratamento de devoluções e reclamações. A entrega depende também da autenticação do domínio, da reputação do remetente e das regras do provedor. Não há garantia de entrega fora da pasta de spam.
