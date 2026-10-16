# Pagamentos — implementação em teste, sem cobrança real habilitada

Decisão técnica provisória: Stripe Checkout + Billing + Customer Portal. O Atlas vende diretamente o app Mac e serviços de nuvem fora da App Store. Stripe permite BRL e controle da integração; Murilo continua responsável por tributação, notas, suporte e regras de consumo. Paddle atua como Merchant of Record e simplifica tributos internacionais, mas exige aprovação do produto, tem outra estrutura de tarifas e menor controle. Não integramos dois provedores ao mesmo tempo.

Pix: a documentação atual do Stripe permite pagamentos avulsos em BRL para contas brasileiras; Pix Automático não está disponível para empresas domiciliadas no Brasil. Paddle oferece Pix segundo país/moeda elegíveis. A implementação entregue usa assinatura com cartão, **não** anuncia Pix recorrente. Uma compra Pix com validade definida é uma alternativa futura, após definição comercial e teste de confirmação/reembolso.

Fontes consultadas em 16/10/2026: https://docs.stripe.com/payments/pix ; https://docs.stripe.com/webhooks ; https://developer.paddle.com/concepts/payment-methods/pix/ ; https://developer.paddle.com/get-started/how-paddle-works/ . Confirmar tarifas e elegibilidade no onboarding.

## Arquitetura e deploy de homologação

Node 24, PostgreSQL do Supabase existente, Stripe SDK fixado, API Stripe `2024-06-20` explicitamente fixada (configurar o endpoint de webhook para a mesma versão). Não há migração Firebase no repositório inspecionado. Backend separado do bundle público: `server/`. Nunca colocar DATABASE_URL, service_role, certificado ou chave Stripe em config.js.

1. Criar projeto Supabase **de homologação** e instalar os SQL existentes na ordem de docs/SUPABASE.md, depois `supabase/commercial-billing.sql`. SQL novo é aditivo e repetível; não foi aplicado no projeto de produção. Para controlar histórico, gerar migration com a CLI e incorporar o SQL revisado antes do deploy.
2. `cd server`, `npm ci`, copiar `.env.example` para `.env` no servidor e preencher segredos de homologação. DATABASE_URL deve conectar por TLS com certificado validado; não usar `rejectUnauthorized:false`. Conta de banco backend deve acessar apenas o schema privado comercial, mais as permissões específicas documentadas nas frentes seguintes. Não expor `atlas_commercial` no Data API.
3. Criar produto e preço **recorrente BRL** de teste; preencher STRIPE_PRICE_ID. O valor é DECISÃO DO MURILO. Habilitar Customer Portal com cancelamento ao fim do período e atualização de cartão. Trials e preços com desconto total não habilitam benefícios nesta implementação conservadora.
4. Hospedar `npm start` atrás de proxy HTTPS, limites por IP, timeout e monitoramento; preencher PUBLIC_SITE_URL e ALLOWED_ORIGINS (origem do site e `atlas://app`). Backend verifica bearer token em `/auth/v1/user`, não aceita user_id enviado pelo cliente.
5. Webhook público POST `/webhooks/stripe`, assinatura STRIPE_WEBHOOK_SECRET, eventos `customer.subscription.created/updated/deleted`, `invoice.paid/payment_failed`, `charge.refunded`, `charge.dispute.created`. Desabilitar transformações do corpo no proxy. O SDK valida assinatura e tolerância temporal no corpo bruto. Falhas retornam 5xx para retry.
6. Publicar somente a URL HTTPS em commercialConfig.apiURL. `BILLING_MODE=test` é padrão. `live` exige chave live E ALLOW_LIVE_BILLING=true após homologação e revisão fiscal/jurídica.

Benefícios pagos: nuvem ampliada, nunca o controle do arquivo do usuário. Dados locais e backup permanecem livres. `premium_accounts` é um experimento legado isolado e desabilitado por padrão (`experimentalPoster:false`); pôster gerado no cliente não é prometido como benefício inviolável nem autoriza armazenamento. Apenas a assinatura persistida pelo backend determina cotas de nuvem. A tela de planos consulta o servidor e não guarda um booleano confiável no cliente.

## Garantias e limites

Cliente Stripe vinculado pelo servidor. Checkout com chave idempotente de 30 minutos e lock por usuário. Webhook com chave única por evento e transação compartilhada com atualização de benefícios. Busca estado canônico do provedor sob lock, evitando retroceder assinatura por evento atrasado. Uma fatura paga e período válido são necessários; status active sozinho não libera. Falha após período pago concede 3 dias de carência, configurável 0–7 e sem extensão a cada retry. Reembolso parcial ou integral do período pago revoga o benefício desse período; disputa sem vínculo claro bloqueia conservadoramente. Uma nova fatura paga pode restaurar períodos futuros; bloqueio sem vínculo exige revisão humana. Nenhum cancelamento apaga memórias.

Testes executáveis: `npm --prefix server test`, fixture fictícia Stripe + assinatura real do SDK e banco PostgreSQL em memória PGlite. Cobrem RLS, duplicatas, assinatura forjada/velha, reordenação, falha transacional, pagamento/renovação/carência/cancelamento/reembolso e isolamento. **Não substituem** uma compra no sandbox real. Sem chaves disponíveis, checkout, portal e entrega real de webhook não foram homologados com Stripe.

## Runbook: cancelamento, reembolso e reconciliação

1. Usuário abre Plano e assinatura → Gerenciar assinatura e cancelamento. O Portal mantém acesso até fim do período já pago. Verificar no Dashboard se cancelamento foi agendado e se webhook foi entregue. Para cancelamento imediato, ação administrativa confirmada no Dashboard revoga acesso na atualização canônica.
2. Reembolso: localizar cliente/fatura pelo ID, verificar identidade sem solicitar senha/cartão, registrar motivo e aprovação. No Stripe Dashboard reembolsar parcial/integral. Cancelar assinatura separadamente se não deve renovar: reembolso não equivale a cancelamento. Confirmar refund succeeded e webhook 2xx; não prometer prazo bancário exato.
3. Verificar GET /v1/plan autenticado: acesso pago revogado após reembolso do período. Nenhum dado local é apagado. Conservar apenas registro fiscal necessário segundo política aprovada.
4. Se webhook falhar, corrigir indisponibilidade, reenviar o mesmo evento no Dashboard. Idempotência evita duplicação. Nunca editar uma coluna de benefício por indicação do cliente. Comparar assinatura atual no Stripe com ledger privado e reproduzir evento correspondente. Rever revocations `*` manualmente antes de remover um bloqueio, com registro de auditoria.
5. Rotina diária: conferir webhooks falhos, pagamentos em atraso, divergência entre assinaturas ativas no Stripe e ledger. Monitorar tamanho do ledger de eventos e definir retenção aprovada sem perder janela de idempotência.

## AÇÕES HUMANAS NECESSÁRIAS

1. Confirmar que este é o repositório atual; se Firebase estiver em outro, informar branch/projeto antes de migrar dados ou autenticação.
2. Criar/validar conta Stripe e conta fiscal do negócio; escolher Stripe ou pedir substituição por Paddle.
3. Definir preço, recorrência e política de reembolso/carência com contador e advogado.
4. Criar homologação, produto/preço de teste, segredos e endpoint; habilitar Portal e instalar SQL revisado.
5. Executar compra, renovação simulada, falha, cancelamento e reembolso reais no sandbox e registrar evidências.
6. Somente depois configurar ambiente live, segredos distintos e aprovação do lançamento.
