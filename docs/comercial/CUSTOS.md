# Limites e custos — hipóteses para homologação

**Não são preços de venda aprovados nem orçamento contratado.** Valores unitários são entradas de simulação, substituir pelos preços contratados da região/provedor e medir por 30 dias. As cotas iniciais são uma suposição conservadora, DECISÃO DO MURILO antes de oferta pública.

| Plano | Nuvem | Objetos (originais + miniaturas + movimento + avatar) | Tamanho por objeto | Destinos | Escritas/mês |
|---|---:|---:|---:|---:|---:|
| Gratuito | 256 MiB | 500 | 50 MiB (avatar 1 MiB) | 200 | 100 MiB |
| Pago | 10 GiB | 20.000 | 50 MiB (avatar 1 MiB) | 10.000 | 1 GiB |

`commercial-limits.sql` aplica limites no banco, com lock transacional por proprietário, independentemente do cliente. Contabiliza todos os três buckets. Não transforma plano por um campo enviado pelo app. Downgrade não apaga objetos existentes; bloqueia crescimento até adequação. RLS existente continua determinando acesso a cada objeto. Uma viagem colaborativa compartilha apenas o que foi explicitamente permitido; privado nunca deve ser visível a outro usuário. Perfis/roteiros voluntariamente públicos continuam públicos.

Fotos já são recodificadas em JPEG até 1600px e miniatura 240px, sem EXIF original. Vídeos já têm prévia JPEG e validação de duração/dimensões/50 MB, mas **ainda não são transcodificados**. TUS usa chunks de 6 MiB, renova token e retoma a posição após falha da conexão dentro da mesma tentativa lógica; grava URL opaca no cache da conta, sem token. A geração atual de novo caminho em um novo save limita retomada após reiniciar o app: ensaio real/caminho estável ainda pendente. Não prometer retomada entre reinícios.

## Limitações que bloqueiam oferta ilimitada

O contador de sincronização entregue mede bytes de linhas escritas (PostgreSQL), **não todo o tráfego de rede**. Leituras via REST e URLs assinadas de mídia ainda precisam passar por um gateway metrado/CDN com orçamento e rate limiting antes de prometer limite rígido de banda. Há limite de requisições de escrita, mas ataques de leitura anônima a conteúdo público exigem rate limiting no provedor/WAF. Nunca alegar banda rígida aplicada só porque há um contador. Aplicar storage trigger em staging: a plataforma deve preencher `metadata.size`; se omitir, o upload falha de forma segura. Validar TUS/copy/cleanup e permissões da role de Storage; não aplicar cegamente em produção.

## Modelo reproduzível

`node tools/cost-model.mjs` gera JSON a partir das premissas. Custos em USD, preço sugerido em BRL:

`custo = GiB_armazenado × tarifa_storage + GiB_saida × tarifa_banda + operacoes/1e6 × tarifa_operacao + custo_fixo/usuarios_pagantes + suporte_mensal`

`preco_minimo = (custo × cambio + tarifa_fixa_pagamento) / (1 - taxas_percentuais - impostos - reserva_estornos - margem_alvo)`

Premissas de exemplo: storage US$0,025/GiB/mês, saída US$0,09/GiB, operações US$1/milhão, fixo US$25, câmbio R$5,50, taxa 5% + R$0,50, impostos 6%, estornos 2%, margem alvo 50%, suporte US$0,50/ativo/mês, 100 pagantes. São hipóteses explícitas, não cotações. Não incluem salários/desenvolvimento, Apple Developer, aquisição, vídeo-worker, variação cambial e excedentes inesperados. O custo de usuários gratuitos deve ser rateado entre pagantes, não ignorado. Conferir em https://supabase.com/pricing e no provedor escolhido, sem depender de free tier.

## Confiabilidade e recuperação

Rodar suíte completa, incluindo testes existentes de backup/importação com mídia, conta offline, resposta perdida, conflitos de viagem/wish list e migração local. Novo teste SQL usa PostgreSQL real em memória para limites/isolamento, não simulação de ACL. Testes HTTP do cliente continuam sendo fixtures, portanto falta ensaio em staging com 2 contas e 2 dispositivos.

Procedimento: exportar JSON completo, guardar cópia criptografada; importar em perfil limpo, comparar destinos/fotos/wish list e abrir offline; editar mesmo item em 2 dispositivos, sincronizar fora de ordem e preservar ambas versões. Exportação local não contém viagens colaborativas ainda só na nuvem — portabilidade de servidor trata isso na frente C. Fazer restauração mensal e registrar contagens/hash sem conteúdo pessoal. Definir backup gerenciado/PITR e versionamento do bucket conforme plano contratado; retenção é decisão jurídica/operacional.

## AÇÕES HUMANAS NECESSÁRIAS

1. Aprovar cotas, custo suportado de gratuitos e região de dados.
2. Aplicar SQL em staging, rodar verificações RLS existentes e ensaio de Storage/TUS com metadata real.
3. Contratar/ativar limites de gastos, alertas e WAF/gateway de banda; configurar limiares a partir de orçamento aprovado.
4. Medir custos reais/usuário, definir processo de órfãos e validar worker de compressão de vídeo antes de aumentar cotas.
5. Escolher backup/PITR e executar restauração em staging; aprovar preço apenas após essas medições.
