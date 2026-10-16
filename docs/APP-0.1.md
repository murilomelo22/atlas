# Atlas 0.1 — acesso antecipado

O Atlas agora é uma PWA: um aplicativo instalável no computador, Android e iPhone a partir do navegador. A versão do aplicativo é **0.1.0**; a versão interna do cache é **22**, para atualizar instalações anteriores sem confundir a sequência das versões do site.

## O que foi entregue

- Identidade em verde profundo, papel e cobre, com ícones próprios.
- Boas-vindas com atalhos para registrar a primeira memória ou entrar em uma conta. Não aparece automaticamente para coleções pessoais existentes, usuários autenticados ou links de perfis/roteiros/recuperação de conta.
- Instalação nativa quando o navegador oferece o recurso; instruções específicas quando não oferece, incluindo iPhone/iPad.
- Navegação inferior no celular: mapa, memórias, roteiros e perfil. Os controles delegam aos fluxos e às verificações de conta existentes.
- Ajuda de instalação, apresentação acessível novamente e indicação de uso offline.
- Cache dos arquivos do aplicativo, incluindo os novos módulos, manifesto e ícones. A abertura offline também funciona em uma subpasta, com o endereço inicial de instalação.
- Build estático, sem dependências novas no aplicativo.

Contas, memórias, fotos, roteiros, wish list, backup, sincronização e Premium de teste continuam usando as implementações existentes. Esta entrega não instala migrações nem altera dados ou configurações no Supabase. Não há assinatura, cobrança, APK, publicação em lojas ou integração nativa de Live Photos nesta versão.

## Executar e preparar distribuição

```bash
npm run dev
# Abra http://127.0.0.1:8000

npm run build
# A pasta dist/ contém somente os arquivos necessários à publicação.
```

Publique **o conteúdo de dist/** em uma origem HTTPS, preservando as pastas `src`, `vendor` e `assets`. Funciona na raiz e em subpastas, como `/atlas/`. Não abra `index.html` por `file://`: módulos JavaScript, IndexedDB e instalação precisam de um servidor. O endereço local `127.0.0.1` funciona para desenvolvimento; no telefone, a instalação precisa de um endereço HTTPS acessível pelo aparelho.

Prefira atualizar a origem atual do Atlas. O navegador separa dados por origem: publicar em outro domínio não transfere automaticamente os dados locais. Faça um backup antes de mudar de domínio. Contas que já sincronizaram podem recuperar sua coleção entrando na conta. Um novo domínio também deve entrar na lista de redirecionamentos permitidos do Supabase antes de testar confirmação de cadastro e recuperação de senha. A configuração pública `config.js` é preservada; chaves administrativas nunca devem entrar no aplicativo.

## Instalar

- **Android:** abra no Chrome e toque em **Instalar app**. Quando não houver janela nativa, use o menu do Chrome → **Instalar aplicativo / Adicionar à tela inicial**.
- **iPhone/iPad:** abra no Safari → **Compartilhar → Adicionar à Tela de Início**. Links abertos dentro de outros aplicativos devem ser abertos no Safari primeiro.
- **Computador:** use o botão **Instalar app** ou a opção do Chrome/Edge. O Safari do Mac pode oferecer **Arquivo → Adicionar ao Dock**.

A elegibilidade e o texto da instalação dependem do navegador e do sistema. As instruções não afirmam que a instalação foi concluída apenas porque o usuário aceitou a janela.

## Offline e proteção das memórias

Abra o aplicativo com internet pelo menos uma vez e aguarde o mapa carregar. A busca de novos lugares, mapas de ruas, login e sincronização exigem conexão. A cartografia local, dados já carregados e o registro manual de memórias podem funcionar offline. Mídias da conta devem ser baixadas pelo perfil antes de viajar; arquivos ainda não baixados não ficam disponíveis offline automaticamente.

Sem conta, os dados permanecem no navegador. Com conta, aguarde a confirmação de sincronização. Instalar a PWA não substitui backups e não protege contra a limpeza dos dados do navegador/sistema. Use **Exportar** periodicamente. Sair da conta segue removendo a cópia privada local, conforme o funcionamento existente.

## Piloto para validar o produto

Convide um grupo pequeno de viajantes e observe, com consentimento, se conseguem criar uma conta, registrar uma viagem com foto, voltar ao Atlas e registrar outra memória. Verifique também troca de aparelho e recuperação de senha. Registre dificuldades e pedidos recorrentes antes de ampliar o piloto.

Esta versão não adiciona rastreamento, telemetria remota ou coleta automática de opiniões. A validação inicial deve ser acompanhada diretamente; um painel de métricas e um canal de feedback compartilhado são próximos trabalhos.

## Verificação

```bash
npm test -- tests/app-shell.spec.js tests/app-updates.spec.js tests/atlas.spec.js tests/social.spec.js
```

Os testes incluem criação real de memória local, coleção anterior, instalação oferecida/cancelada/concluída, instruções para iPhone, navegação móvel e reabertura offline em subpasta com origem HTTP realmente indisponível. Os testes de contas usam respostas Supabase simuladas. A instalação real pelo sistema e as integrações de produção ainda exigem conferência em Android/iPhone físicos.

Resultado desta entrega: **87 testes distintos passaram** nas suítes `app-shell`, `app-updates`, `atlas`, `social`, `map-focus` e `session-recovery`; um caso exclusivo de navegação móvel foi ignorado no projeto desktop. A verificação visual em Chromium nas larguras de 320, 390, 768 e 1440 px não encontrou erros de JavaScript ou transbordamento horizontal. A indicação de abertura pelo cache offline foi corrigida e verificada novamente em ambas as telas.
