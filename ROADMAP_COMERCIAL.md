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
| parcial | Cotas transacionais de Storage/objetos/tamanho/destinos/escritas, mensagens no app, TUS com retomada de offset, modelo de custo executável e worker/fila FFmpeg com originais preservados | server/test/limits.test.mjs, cost-model.test.mjs e transcode.test.mjs com vídeo sintético; suíte completa no CI | Homologar triggers/TUS/worker reais; selecionar derivado no player, retomada entre reinícios e banda de leitura via gateway ainda pendentes; ver docs/comercial/CUSTOS.md |

## C — Privacidade, LGPD e conta
| Status | Implementado | Como testar | Falta |
|---|---|---|---|
| parcial | Fila de exclusão com etapas/retry, confirmação e login recente; políticas restritivas; manifesto de portabilidade com links de 1h; denúncia/bloqueio e fila privada; documentos explicitamente rascunhos no site/app | server/test/privacy.test.mjs; tests/privacy.spec.js; CI completo | Ensaio real Auth/Storage/Stripe, auditoria RPCs definer, arquivo de portabilidade durável, painel de moderação, retenção e documentos/aceite finais; ver docs/comercial/PRIVACIDADE.md |

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
| bloqueado por humano | Nenhum preço definitivo estabelecido | Revisão do documento de oferta a produzir | Público e preço: DECISÃO DO MURILO |

## Validação e branches

Cada frente usa branch própria e PR em cadeia, sem merge/deploy automático. Base comercial parte do código nativo 0.1.1; mudanças da página de download em main devem ser reconciliadas ao integrar. Baseline completo está em execução; resultados finais e limitações serão registrados aqui antes dos PRs. Testes usam apenas dados fictícios, nunca contas de produção.

## AÇÕES HUMANAS NECESSÁRIAS

1. Confirmar o backend/repositório se a migração Firebase estiver fora das branches disponíveis.
2. Seguir a lista ordenada de cada frente em docs/comercial/; homologar pagamentos primeiro.
3. Aprovar cotas, custos, textos jurídicos e política de retenção antes de usuários pagantes.
4. Preparar Apple Developer/certificados e ambiente de homologação; executar ensaios que exigem macOS e serviços reais.
