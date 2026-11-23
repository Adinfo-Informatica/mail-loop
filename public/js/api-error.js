export async function apiError(response, operation) {
    let data;
    try { data = await response.json(); } catch { }
    const hint = typeof data?.error === 'string' ? data.error : ({
        401: 'Sessão expirada. Entre novamente.',
        403: 'Acesso recusado. Atualize o painel e confira a permissão de acesso.',
        404: 'Operação não encontrada no servidor. Confira a versão instalada e o encaminhamento da rota.',
        413: 'O conteúdo enviado excede o limite aceito pelo servidor.',
        429: 'Muitas solicitações. Aguarde antes de tentar novamente.',
        502: 'O servidor web não conseguiu acessar a aplicação.',
        503: 'A aplicação está temporariamente indisponível.',
        504: 'O servidor excedeu o tempo de espera pela aplicação.'
    }[response.status] || 'Não foi possível concluir a operação.');
    return new Error(`${hint} (HTTP ${response.status}; ${operation})`);
}
