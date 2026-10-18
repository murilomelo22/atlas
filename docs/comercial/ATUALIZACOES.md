# Atualizações e dados

Alternativa escolhida ao Sparkle: electron-updater 6.8.9, adequado ao Electron existente. A versão estável 26 do builder não fornece a funcionalidade de manifesto assinado anunciada na documentação de desenvolvimento v27; por isso o Atlas verifica seu próprio envelope Ed25519 em `desktop/signed-feed.cjs` antes de entregar um manifesto imutável ao updater. A ponte HTTP existe apenas em loopback, porta aleatória e caminho aleatório, durante a atualização; não é servidor do aplicativo nem exige Terminal. O ZIP continua verificado por SHA-512 e pela assinatura Apple do Squirrel.Mac. Não desabilitamos validação de assinatura do updater.

Configuração pública `desktop/update-config.json`: disabled por padrão. Pipeline de distribuição habilita somente com Developer ID, URL HTTPS e chave pública Ed25519. Chave privada existe exclusivamente no segredo ATLAS_UPDATE_PRIVATE_KEY do CI. `tools/sign-update.mjs` assina os bytes exatos de um JSON com versão/URL/hash/tamanho. `verifyFeed` recusa assinatura inválida, downgrade/replay de versão, host fora do repositório e artefato não universal. Instalação exige confirmação para reiniciar; não fecha formulários automaticamente. Falha preserva app e userData.

**Limite inevitável:** a 0.1.1 distribuída não contém atualizador nem chave pública e tem assinatura ad-hoc. Não pode receber retroativamente atualização automática segura para Developer ID. Primeiro salto é instalação manual de 0.1.2 assinada sobre o app, mantendo `~/Library/Application Support/Atlas Pessoal`. Daí em diante o menu Ajuda → Verificar atualizações usa o feed. Não marcar 0.1.1→0.1.2 automático como testado.

Evolução de dados: IndexedDB físico continua na versão 1 (compatibilidade de rollback); metadado lógico data-schema 2 com checkpoint de versão anterior. Nesta versão só adicionamos metadados: destinos, blobs, wish list e sessão não são reescritos. Transação aborta em versão desconhecida. Migração destrutiva futura exige backup completo, validação e plano próprio; o checkpoint atual não é cópia de todas as mídias.

Testes: assinatura, alteração de hash, chave incorreta, replay, destino estrangeiro e transições lógicas em `server/test/updates.test.mjs`. `desktop/tests/upgrade.spec.mjs` exige ATLAS_LEGACY_EXECUTABLE apontando para binário original 0.1.1; cria memória fictícia, abre na nova versão e volta à antiga com mesmo perfil. Sem binário, teste é skipped, nunca aprovado ficticiamente. Ainda é necessário ensaio de download/instalação automático com dois apps Developer ID assinados pelo mesmo Team ID.

## AÇÕES HUMANAS NECESSÁRIAS

1. Cumprir contas/certificados da frente E e guardar chave Ed25519 privada em segredo do CI, pública na configuração da distribuição.
2. Definir canal/URL HTTPS de `atlas-update.json`; controlar quem pode publicar e manter recuperação segura da chave.
3. Instalar manualmente a primeira versão assinada sobre 0.1.1 e executar teste de perfil/mídias/conta/backup em Mac de homologação.
4. Publicar uma versão assinada posterior de teste para validar descoberta, assinatura, download, reinício e preservação/rollback; só então habilitar para usuários.
