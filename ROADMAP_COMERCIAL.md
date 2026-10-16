# Roadmap comercial — Atlas 0.1.2 em preparação

Atualizado em 16/10/2026. Nenhum deploy de backend, migração em produção, cobrança live ou release público foi realizado por este trabalho. Estados: **feito** = implementado e verificado no escopo descrito; **parcial** = há código, faltam integrações/validação; **bloqueado por humano** = exige credencial, conta ou decisão.

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
| parcial | Cotas transacionais de Storage/objetos/tamanho/destinos/escritas, mensagens no app, TUS com retomada de offset, modelo de custo executável | server/test/limits.test.mjs e cost-model.test.mjs; suíte completa no CI de cada branch | Homologar triggers/TUS reais; retomada entre reinícios, transcodificação de vídeo e banda de leitura via gateway ainda pendentes; ver docs/comercial/CUSTOS.md |

## C — Privacidade, LGPD e conta
| Status | Implementado | Como testar | Falta |
|---|---|---|---|
| parcial | Auditoria de conta e comunidade existente | Suíte social e RLS | Exclusão, portabilidade, consentimento, moderação e rascunhos jurídicos |

## D — Atualizações
| Status | Implementado | Como testar | Falta |
|---|---|---|---|
| parcial | Identificado Electron e update manual atual | desktop/tests | Updater assinado e ensaio 0.1.1→0.1.2; 0.1.1 não possui updater e exigirá primeira instalação manual |

## E — Distribuição
| Status | Implementado | Como testar | Falta |
|---|---|---|---|
| parcial | Build universal e testes Mac já existentes | Workflow anterior 38952823282 | Pipeline Developer ID/notarytool/staple e segredos Apple |

## F — Atendimento e telemetria
| Status | Implementado | Como testar | Falta |
|---|---|---|---|
| parcial | Sem coleta adicional ativada | Inspeção | Suporte/FAQ/diagnósticos opcionais |

## G — Oferta e preço
| Status | Implementado | Como testar | Falta |
|---|---|---|---|
| bloqueado por humano | Nenhum preço definitivo estabelecido | Revisão do documento de oferta a produzir | Público e preço: DECISÃO DO MURILO |

## Validação e branches

Cada frente usa branch própria e PR em cadeia, sem merge/deploy automático. Base comercial parte do código nativo 0.1.1; mudanças da página de download em main devem ser reconciliadas ao integrar. Baseline completo está em execução; resultados finais e limitações serão registrados aqui antes dos PRs. Testes usam apenas dados fictícios, nunca contas de produção.

## AÇÕES HUMANAS NECESSÁRIAS

1. Confirmar o backend/repositório se a migração Firebase estiver fora das branches disponíveis.
2. Seguir a lista ordenada de cada frente em docs/comercial/; homologar pagamentos primeiro.
3. Aprovar cotas, custos, textos jurídicos e política de retenção antes de usuários pagantes.
4. Preparar Apple Developer/certificados e ambiente de homologação; executar ensaios que exigem macOS e serviços reais.
