# Privacidade e operação de conta

Código preparado, **não aplicado em produção**. Instalar SQL de billing/limits e depois `commercial-privacy.sql`. Node server inicia worker a cada 5 segundos somente se SUPABASE_SERVICE_ROLE_KEY existir no servidor. A API autentica no Supabase; exclusão exige login recente (10 minutos) e confirmação literal. Fila privada é idempotente e persistente, com lease de 5 minutos, SKIP LOCKED e retry após falha. Prazo operacional proposto de 7 dias precisa ser aprovado e acompanhado; não há contrato final nesta versão.

Etapas: registrar pedido e negar acesso por RLS; bloquear renovação de sessão no Auth; cancelar assinaturas Stripe atuais; remover até 100 objetos por ciclo pela API de Storage; excluir usuário Auth, cujo cascade remove dados relacionais e PII da fila comercial. Nunca apagar diretamente linhas storage.objects, o que deixaria arquivos órfãos. Falha externa mantém a etapa para retomada. Configurar alerta para job com deadline próximo e log ACCOUNT_DELETION_RETRY. Não habilitar endpoint sem worker operacional.

Antes de produção: ensaiar 2 workers e interrupção em cada etapa, verificar signed URLs já emitidas (expiram em até 5 minutos; links de portabilidade em até 1 hora), caches de CDN e backups. JWT já emitido não é invalidado só pela exclusão: as políticas restritivas verificam existência/estado do dono. Funções SECURITY DEFINER legadas de colaboração precisam de auditoria adicional para bloqueios de conta/usuário; não afirmar cobertura integral dessas funções. Bloqueio não elimina conteúdo público da internet ou cópias de terceiros.

Portabilidade: `/v1/export` gera manifesto JSON das linhas próprias, roteiros compartilhados aos quais a conta tem acesso e arquivos próprios com URLs assinadas de 1 hora. É complementar ao backup local existente, que contém mídias baixadas. Manifesto não é arquivo autossuficiente. Falta empacotar mídias da nuvem em arquivo durável para grandes contas; documentado como parcial.

Comunidade: `/v1/moderation` aceita denúncia de perfil/destino/trip e bloqueio/desbloqueio de usuário. Limite de 10 denúncias/dia por conta. Fila `atlas_commercial.reports`, apenas backend/admin. Moderação humana por consulta administrativa: ordenar pending por created_at, investigar o recurso no escopo autorizado, registrar decisão status reviewed/actioned/dismissed e ação concreta de retirar publicação quando cabível. Não há painel web administrativo nem classificação automática. Nome de usuário é resolvido no servidor; usuário não escolhe quem é o autor da denúncia. Antes do lançamento, designar responsável, prazo, procedimento de recurso e resposta a conteúdo ilegal.

Documentos em `legal/` são **RASCUNHOS NÃO APROVADOS**, contêm campos pendentes de controlador/contato/região/retenção. legalApproved permanece false. Não coletamos aceite fictício de contrato final. Para ativar cobrança live, revisão jurídica deve preencher/ versionar os documentos, implementar aceite obrigatório no signup/checkout e guardar versão/data no ledger consents. Tabela preparada; fluxo de aceite contratual definitivo ainda bloqueado pela aprovação dos textos. Preferências de telemetria são consentimentos independentes e revogáveis na frente F.

## AÇÕES HUMANAS NECESSÁRIAS

1. Identificar controlador (razão social/CPF ou CNPJ/endereço), contato de privacidade e responsável por moderação/suporte.
2. Advogado revisar rascunhos e definir bases legais, transferências internacionais, períodos de retenção por categoria, tratamento de menores, prazo de exclusão, atendimento e direito de arrependimento; contador definir retenção fiscal.
3. Preencher documentos, publicar versões finais e aprovar fluxo de aceite obrigatório antes de cobrar.
4. Configurar service role apenas no servidor, permissões mínimas do banco, worker e alertas de fila; executar exclusão e exportação completas em staging com assinatura/mídia fictícias.
5. Auditar SECURITY DEFINER e expiração de links/backups, completar pacote durável de portabilidade e processo de moderação antes de comunidade comercial.
