# Roadmap comercial — Atlas 0.1.2 em preparação

Atualizado em 17/10/2026. Nenhum deploy de backend, migração em produção, cobrança live ou release público foi realizado por este trabalho. Estados: **feito** = implementado e verificado no escopo descrito; **parcial** = há código, faltam integrações/validação; **bloqueado por humano** = exige credencial, conta ou decisão.

## Diagnóstico inicial

Código do app 0.1.1 confirmado na branch/tag desktop-v0.1.1, commit 5304299; main cb05956 contém o site e downloads. Aplicação JavaScript modular sem framework, Leaflet, IndexedDB separado por conta, backup JSON com mídias, sync otimista por revisões/tombstones, frontend público no GitHub Pages. Electron 44.8 empacota arquivos por protocolo atlas://app, renderer sandbox/contextIsolation, sem Node no frontend. Não há servidor local necessário ao usuário.

**Backend real no código inspecionado: Supabase Auth + PostgreSQL/RLS + Storage privado por REST.** Inventário local e árvores das branches main e desktop-v0.1.1 não contêm Firebase SDK, firebase.json, Firestore/Storage Rules ou funções Firebase. Configuração pública aponta a Supabase. Nenhuma credencial administrativa ou acesso à produção está disponível. A afirmação de migração para Firebase não pôde ser confirmada; não inventar uma migração nem trocar identidades. Suposição conservadora: preservar Supabase e documentar eventual migração externa como bloqueio de confirmação.

Fragilidades: Premium legado manual com gate de UI contornável, sem billing; limites sobretudo locais; vídeos originais até 50 MB sem transcodificação; limpeza de objetos best effort; IndexedDB sem estratégia formal de evolução; sincronização tem testes simulados mas exige ensaio real; backups atuais não abrangem toda colaboração remota. Assinatura ad-hoc, sem notarização/auto-update. Sem exclusão de conta/portabilidade integral, suporte operacional, consentimento de telemetria ou documentos legais aprovados. Arquivos locais anteriores foram preservados em /workspace/atlas; este trabalho usa worktree separado.

## A — Pagamento e benefícios
| Status | Implementado | Como testar | Falta |
|---|---|---|---|
| parcial | API Node 24, ledger privado, Stripe Checkout/Portal, webhooks assinados idempotentes, estado canônico, carência e revogações; tela de plano; Premium legado isolado | npm --prefix server test; tests/commercial.spec.js; plano de sandbox em docs/comercial/PAGAMENTOS.md | Deploy, SQL em staging, chaves e homologação real Stripe; nenhum pagamento real testado |
| bloqueado por humano | Comparação Stripe/Paddle/Pix e runbook | Revisar PAGAMENTOS.md | Conta fiscal, preço, política comercial, provedor final |

## B — Limites, custos e confiabilidade
| Status | Implementado | Como testar | Falta |
|---|---|---|---|
| parcial | Cotas transacionais de Storage/objetos/tamanho/destinos/escritas, mensagens no app, TUS com retomada de offset, modelo de custo executável e worker/fila FFmpeg com originais preservados | server/test/limits.test.mjs, cost-model.test.mjs e transcode.test.mjs com vídeo sintético; suíte completa no CI | Homologar triggers/TUS/worker reais; selecionar derivado no player, retomada entre reinícios e banda de leitura via gateway ainda pendentes; ver docs/comercial/CUSTOS.md |

## C — Privacidade, LGPD e conta
| Status | Implementado | Como testar | Falta |
|---|---|---|---|
| parcial | Fila de exclusão com etapas/retry, confirmação e login recente; políticas restritivas, novos perfis privados por padrão e role de backend com privilégios limitados; manifesto de portabilidade com links de 1h; denúncia/bloqueio e fila privada; documentos explicitamente rascunhos no site/app | server/test/privacy.test.mjs; tests/privacy.spec.js; CI completo | Ensaio real Auth/Storage/Stripe, auditoria RPCs definer, arquivo de portabilidade durável, painel de moderação, retenção e documentos/aceite finais; ver docs/comercial/PRIVACIDADE.md |

## D — Atualizações
| Status | Implementado | Como testar | Falta |
|---|---|---|---|
| parcial | electron-updater, envelope Ed25519, bloqueio de downgrade/tamper, confirmação de reinício, versão lógica de dados e rollback compatível com 0.1.1 | server/test/updates.test.mjs; desktop/tests/upgrade.spec.mjs exige binário legado | Assinaturas Apple e ensaio real de instalação; primeiro salto 0.1.1→0.1.2 obrigatoriamente manual; ver docs/comercial/ATUALIZACOES.md |

## E — Distribuição
| Status | Implementado | Como testar | Falta |
|---|---|---|---|
| parcial | Workflow manual com pré-validação de segredos, Developer ID, universal/lipo, hardened runtime, notarytool Accepted, staple app+DMG, spctl, feed assinado e teste de pacote | server/test/distribution.test.mjs + revisão do YAML; execução real bloqueada sem segredos | Criar Apple Developer/certificado/segredos e executar homologação completa; ver docs/comercial/DISTRIBUICAO.md |

## F — Atendimento e telemetria
| Status | Implementado | Como testar | Falta |
|---|---|---|---|
| parcial | FAQ, mailto com versão e relatório de códigos sem conteúdo pessoal, prévia e consentimento separado; métricas/falhas JS opt-in revogáveis, payload restrito e agregação no servidor | server/test/telemetry.test.mjs; tests/support.spec.js; CI completo | Endereço de suporte real, homologar e-mail/coletor, cron de retenção aprovado; crash nativo pendente; ver docs/comercial/SUPORTE.md |

## G — Oferta e preço
| Status | Implementado | Como testar | Falta |
|---|---|---|---|
| feito | Documento com 3 hipóteses de público, divisão grátis/pago, faixas provisórias ancoradas em custo e página de apresentação sem checkout fictício | node tools/cost-model.mjs; tests/offer.spec.js | Implementação documental concluída; hipótese não equivale a validação comercial |
| bloqueado por humano | Faixas e entrevista/piloto descritos em docs/comercial/OFERTA.md | Aprovação e pesquisa com público | Público e preço final: DECISÃO DO MURILO |

## Validação e branches

Cada frente usa branch própria e PR em cadeia, sem merge/deploy automático: pagamentos → limites-custos → privacidade-conta → atualizacoes → distribuicao → suporte-telemetria → oferta-preco. A primeira frente parte do código de desktop-v0.1.1 por meio da base isolada comercial/base-0.1.1; main continua com o site/download atual e deverá ser reconciliada numa integração posterior. Branch consolidada: feat/oferta-preco. Nunca fazer merge na branch desktop-v0.1.1 sem revisar seu workflow legado, que publica a release de mesmo nome ao receber push.

Validação local consolidada: 23 testes de backend/lógica passaram, incluindo PostgreSQL/RLS, idempotência, aceite jurídico, fila de exclusão, FFmpeg real, fila de mídia e feed assinado; 14 testes das novas telas passaram em desktop/celular; 6 testes Electron passaram (offline, persistência, backup, isolamento e documentos). Teste com binário legado é skipped no Linux e executado separadamente no CI macOS. A frente A passou no CI [38963541193](https://github.com/murilomelo22/atlas/actions/runs/38963541193): 263 web + 5 Mac, com 1 caso móvel não aplicável skipped. A cópia consolidada anterior (25bcbf7) passou no CI [38964065190](https://github.com/murilomelo22/atlas/actions/runs/38964065190): 273 web, 6 Electron e o ensaio separado de migração/rollback usando o binário Mac 0.1.1 distribuído. Nesse CI anterior, 22 testes de backend passaram e o teste FFmpeg ficou skipped por falta da ferramenta; a configuração final instala FFmpeg e exige sua execução, enquanto os 23 passaram localmente sem skips. Os commits finais de cada frente têm nova execução completa no workflow Atlas commercial verification; consultar o resultado do SHA antes de aprovar PR.

Limites da evidência: HTTP cloud/Stripe nos testes são fixtures fictícias; SQL roda em PostgreSQL em memória PGlite. FFmpeg realmente processou vídeo sintético. Não houve compra Stripe sandbox real, deploy de SQL em produção, medição real de custos, assinatura/notarização Apple ou instalação automática entre dois apps Developer ID. Não confundir teste do mecanismo/estado com homologação externa.

Inventário da cópia consolidada percorreu 172 arquivos de texto (17.414 linhas no momento do levantamento, antes das últimas adições), incluindo código, testes, SQL, docs, build e workflows. Nenhum SDK/configuração Firebase foi encontrado. Dependências vendorizadas e binários de mídia/ícones foram identificados pelo inventário, sem dados de usuários.

## Pendências técnicas ainda abertas

- Gateway para limite rígido de banda de leitura e rate limiting público; homologação de quotas com Storage/TUS real e retomada entre reinícios.
- Entrega dos derivados de vídeo ao player, medição de CPU/órfãos e ensaio do worker com múltiplos processos.
- Portabilidade durável com todos os arquivos em pacote; auditoria adicional das funções SECURITY DEFINER de colaboração e bloqueio/moderação.
- Ensaio de exclusão e pagamento ponta a ponta em staging, painel de moderação e retenção automatizada aprovada.
- Primeira instalação manual da 0.1.2 assinada, seguida de ensaio de atualização automática e rollback entre dois builds Developer ID do mesmo Team ID. 0.1.1 não tem updater.
- Crashes nativos/minidumps e recuperação gerenciada de backups não foram integrados; falhas JS e métricas são opcionais e testadas.

## AÇÕES HUMANAS NECESSÁRIAS

1. Confirmar o repositório/branch que contém Firebase, se existir. Não aplicar estas migrações Supabase a outro backend nem migrar identidades sem um plano específico.
2. Criar homologação separada com Supabase e Stripe de teste; configurar o **frontend e o backend no mesmo projeto de homologação**. Gerar chaves no painel e guardar somente no servidor/GitHub Secrets. Instalar SQL revisado e executar compra/renovação/falha/cancelamento/reembolso com evidências (PAGAMENTOS.md).
3. DECISÃO DO MURILO: aprovar público, cotas, preço, orçamento e carência com base em custo real e piloto. Aprovar fornecedor fiscal/nota e política de reembolso com contador/advogado (CUSTOS.md e OFERTA.md).
4. Advogado preencher/revisar os rascunhos; definir controlador, contato, subprocessadores/região, retenção, exclusão e atendimento. Publicar documentos finais versionados e configurar LEGAL_DOCUMENT_VERSION/ legalApproved. Homologar aceite, portabilidade/exclusão e moderação (PRIVACIDADE.md).
5. Criar Apple Developer, Developer ID Application e senha específica; cadastrar segredos e environment mac-release. Gerar/guardar chave Ed25519 e URL de feed. Rodar pipeline manual e ensaios Mac antes de distribuir (DISTRIBUICAO.md e ATUALIZACOES.md).
6. Criar canal real de suporte, responsáveis, cron de retenção e alertas; homologar consentimentos e incidentes (SUPORTE.md).
7. Revisar PRs na ordem A–G, resolver as pendências técnicas acima, executar piloto com 10–20 pessoas e só então habilitar cobrança live/publicar a versão comercial. Nenhum preço, texto jurídico final ou credencial foi inventado.
