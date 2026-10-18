# Oferta e preço — DECISÃO DO MURILO

Hipóteses para validar, sem preço cadastrado no código ou promessa de plano familiar já existente.

| Público | Problema/benefício principal | Grátis | Pago proposto | Hipótese de faixa mensal |
|---|---|---|---|---|
| Viajante frequente que fotografa | Memórias espalhadas; coleção privada pesquisável no mapa e backup próprio | Coleção local, mapa, wish list, exportação | Nuvem ampliada e continuidade entre dispositivos | R$24–34 para uso típico, somente após validar distribuição de custos |
| Casais que organizam roteiros juntos | Roteiro e lembranças compartilhados sem copiar arquivos em vários chats | Roteiros e convites existentes, coleção local | Mais espaço por conta e compartilhamento já permitido | R$29–49 por conta; não anunciar assinatura compartilhada antes de implementar billing/limites de grupo |
| Família que quer preservar um acervo | Muitas fotos e vídeos, necessidade de portabilidade e organização ao longo dos anos | Experimentar acervo local e backups | Espaço maior e recuperação assistida, após medir suporte | R$49–69, hipótese para usuários de maior uso; plano familiar e recuperação gerenciada não estão implementados |

Todas as faixas são **hipóteses de pesquisa, não preços finais**, com cobrança por conta e sem promessa de armazenamento ilimitado. Benefícios pagos defensáveis ficam na nuvem: cotas e direitos são verificados pelo servidor. Não vender como proteção comercial uma exportação inteiramente executada no cliente. Offline, backup e portabilidade devem continuar disponíveis sem assinatura.

## O que o custo permite

Execute `node tools/cost-model.mjs`. Com premissas didáticas de CUSTOS.md, usuário típico tem piso de aproximadamente R$17,18/mês, alto uso de R$45,95 e piloto de apenas 20 pagantes de R$37,99. Piso já incorpora margem alvo e suporte hipotético, mas não salários/aquisição/Apple/vídeo-worker. Assim, R$24–34 depende de economia de escala, comportamento médio e subsídio cruzado controlado; **não é sustentável garantir alto uso a todos nessa faixa**. Revisar limites/banda e mix antes de lançar. Recalcular taxas, câmbio e impostos reais com contador.

## Validação comercial proposta

1. Entrevistar 5 pessoas de cada hipótese usando um roteiro comum: onde guardam fotos hoje, frequência de organização, perda recente, gasto atual e quem decide pagar. Não coletar fotos pessoais para o teste.
2. Escolher 1 público inicial; observar 10–20 pessoas instalando e criando 3 memórias, um roteiro e um backup. Medir conclusão e dificuldades por observação consentida ou métricas opcionais.
3. Acompanhar retorno em 7 e 30 dias, novas memórias e restauração de backup. Perguntar valor percebido antes de mostrar preço; testar duas faixas sem cobrar silenciosamente.
4. Somente depois de segurança/pagamento/jurídico/assinatura validados, oferecer piloto pago pequeno com termos claros, canal de suporte e cancelamento simples. Definir previamente critério de continuidade, orçamento por usuário e limite de incidentes.

Página de apresentação está em apresentacao.html, com download da versão real 0.1.1 e recursos de acesso antecipado. Não promete a 0.1.2 como lançada, não coleta e-mails sem finalidade/consentimento e não anuncia checkout live. Publicação do novo conteúdo está pendente de integração dos PRs; o site atual não foi alterado.

## AÇÕES HUMANAS NECESSÁRIAS

1. **DECISÃO DO MURILO:** escolher público inicial e benefício principal.
2. Validar custo contratado e cotas com medições; aprovar faixa de preço, recorrência, impostos e política de desconto/reembolso.
3. Conduzir entrevistas/piloto com critérios de sucesso definidos antes da cobrança.
4. Revisar e aprovar apresentação e textos finais; publicar site/plano após homologação das demais frentes.
