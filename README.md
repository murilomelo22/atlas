# atlas
Preparação comercial 0.1.2: veja [ROADMAP_COMERCIAL.md](./ROADMAP_COMERCIAL.md) para diagnóstico, validação e ações humanas. O backend encontrado é Supabase; a migração Firebase não está nas branches inspecionadas. Serviços comerciais e distribuição assinada permanecem em homologação, sem cobrança live ou novo release público.

atlas pessoal, teste usando o codex.

## Aplicativo para Mac

A versão desktop 0.1.1 inclui o Atlas em uma janela própria, sem Python ou servidor local. O build universal gera DMG e ZIP para Apple Silicon e Intel. Veja [instalação, migração de memórias, limites e compilação](docs/DESKTOP.md).

## Aplicativo 0.1 — acesso antecipado

O Atlas agora pode ser instalado pela tela inicial do Android/iPhone ou pelo navegador no computador. A versão 0.1 traz identidade visual própria, boas-vindas para novos usuários, navegação inferior no celular, instruções de instalação e indicação de uso offline. Contas e coleções existentes são preservadas. Não há cobrança nesta versão.

Execute `npm run dev` para abrir localmente ou `npm run build` para gerar a distribuição estática em `dist/`. Publique o conteúdo dessa pasta por HTTPS para instalar no celular. Veja [instalação, limites e roteiro do piloto](docs/APP-0.1.md). A versão interna do service worker passa de 21 para 22; a versão do produto é 0.1.0.

## Pôster premium em teste

**Exportar pôster → Premium · teste** cria seu mapa em **A4 ou A3, paisagem**, com título, tema claro/escuro e prévia. Baixe **PNG a 300 dpi** (A3: 4961 × 3508 px; A4: 3508 × 2480 px), com densidade de impressão gravada no arquivo, ou **SVG vetorial** com tamanho físico para ampliar na gráfica. Imprima em tamanho real (100%).

O pôster destaca os países e pontos visitados da coleção pessoal inteira, incluindo memórias sem datas. Exclui moradias, exemplos e viagens futuras; fotos e notas não entram no arquivo. A cartografia Natural Earth é local e a exportação não depende de tiles externos.

O acesso é administrado no Supabase e verificado ao abrir e antes de baixar. Esta fase é de teste, sem cobrança ou assinatura. O perfil mostra o estado em **Meu perfil → Premium**. Instalações próprias precisam executar [premium.sql](supabase/premium.sql) após `schema.sql`; veja [o guia premium](docs/PREMIUM.md). A versão 21 atualiza o cache dos novos módulos.

## Mapa limpo e atalhos da coleção

**Mapa limpo** abre o mapa em tela cheia, com pontos discretos e destaque dos países dos lugares visitados. Painéis, rotas, calor, fotos dos marcadores e tiles de ruas ficam ocultos. Toque em um ponto para ver o lugar e o país; **⌖** reenquadra a coleção e **×** ou **Esc** sai. O mapa anterior, suas preferências e o foco do teclado são restaurados ao sair. Navegadores sem a API de tela cheia usam a área inteira da janela.

O modo limpo e o filtro **Já fui** excluem moradias, exemplos e lugares com apenas visitas futuras. Memórias sem datas continuam incluídas, assim como viagens já iniciadas. Um destino com visitas passadas e futuras aparece uma vez. O enquadramento em tela cheia permite reduzir o zoom para acomodar destinos distantes também no celular.

Os filtros **Todos / Já fui / ★ Favoritas** combinam com busca, país e etiqueta. O contador mostra quantos destinos estão visíveis; **Limpar filtros** restaura a coleção. A busca aceita nomes sem acentos, como “Italia” e “memoria”. Essa atualização não exige migração no Supabase nem altera os registros ou a privacidade das postagens.

A inicialização aguarda a restauração da conta antes de liberar a wish list, o mapa limpo, a edição e os backups; isso evita abrir a coleção temporária durante um carregamento lento.

Verificação: **82 testes passaram** em computador e celular para o atlas local, mapa limpo, filtros, contas e wish list, incluindo tela cheia nativa, fallback, restauração das preferências e carregamento lento. A aparência das duas telas foi conferida com Chromium; os endpoints Supabase foram simulados.

## Uso pessoal e sincronização leve

O Atlas sincroniza primeiro os destinos e os metadados das mídias. Em um dispositivo novo, os originais não são baixados durante o login: as miniaturas aparecem conforme entram na tela, a foto original carrega ao abrir a galeria, vídeos usam o player sob demanda e o movimento de uma Live Photo só carrega ao reproduzir. Uma mídia indisponível não bloqueia o mapa nem os demais destinos. A galeria oferece **Tentar novamente**.

Depois da primeira sincronização, uma lista compacta de IDs e revisões identifica viagens alteradas e excluídas. Apenas as viagens alteradas e seus registros de mídia são consultados por completo. Arquivos já baixados continuam no cache quando seus caminhos imutáveis são os mesmos; sincronizar metadados não apaga downloads concluídos. Links temporários são reutilizados por até quatro minutos e leituras com falhas temporárias têm no máximo duas novas tentativas espaçadas, sem repetir gravações automaticamente.

**Meu perfil → Baixar mídias para uso offline** baixa os originais, miniaturas e movimentos com até dois arquivos simultâneos. É possível interromper e retomar; cada parte concluída é salva, e a retomada busca somente o que falta. Ao sair da conta, a cópia privada do navegador é removida, incluindo esses downloads. Perfis públicos continuam usando somente as mídias permitidas, sem salvar os arquivos de visitantes no banco pessoal.

**Exportar** continua produzindo um backup completo: arquivos que ainda estão apenas na nuvem são baixados durante a exportação. Se algum arquivo falhar, nenhum JSON incompleto é entregue; as partes já baixadas são preservadas para a próxima tentativa. Um backup de mídias ainda não baixadas precisa de conexão com a nuvem.

Essa atualização não exige migração SQL, plano pago ou serviço novo. O teste com 100 fotos confirma zero downloads de originais ao sincronizar um dispositivo novo. A redução de CPU no projeto real depende do volume, das consultas e dos limites do Supabase; deve ser medida no painel. Consulte [o guia de desempenho](docs/PERFORMANCE.md).

Verificação: **162 testes passaram na suíte completa**, em computador e celular. Depois do limite compartilhado de transferências, **18 testes específicos de sincronização leve passaram**, incluindo 15 pedidos simultâneos, interrupção, retomada e isolamento de contas. As duas interfaces foram conferidas com Chromium, sem erros de JavaScript ou transbordamento. Os endpoints Supabase foram simulados.

## Backups

**Exportar** produz um único JSON com todos os destinos, visitas, legendas, capa e imagens em base64. **Importar** valida o arquivo e as imagens antes de gravar tudo em uma transação. Destinos com o mesmo ID, ou o mesmo nome e coordenadas arredondadas a cinco casas, são atualizados sem duplicação. Outros destinos locais são preservados. Os metadados e fotos dos destinos presentes no backup substituem os correspondentes locais; reimportar o mesmo arquivo é idempotente. O país é recalculado pelas coordenadas na importação. Miniaturas são reconstruídas.

O armazenamento depende da origem e do perfil do navegador. Limpar dados do site, usar outro perfil ou a remoção automática pelo navegador pode apagar a coleção. Exporte backups regularmente. O JSON contém suas fotos e notas sem criptografia; guarde-o como um arquivo pessoal. Nenhuma conta ou sincronização remota é necessária.

## Testes

As dependências de desenvolvimento estão declaradas no `package.json` e já estão instaladas neste ambiente. Não é necessário baixar nada para executar a verificação aqui:

```bash
npm test
```

Ou use `npx --no-install playwright test`. O Playwright inicia automaticamente o servidor Python na porta 8000. Execute na raiz do projeto e evite outro servidor usando essa porta. A configuração usa `/usr/bin/chromium` quando disponível, um navegador gerenciado pelo Playwright em outros ambientes ou o caminho definido em `CHROMIUM_PATH`.

```bash
# Rodar uma das telas
npm test -- --project=desktop
npm test -- --project=mobile
```

A suíte usa contextos isolados e simula tiles e Nominatim com `page.route`, sem acesso a serviços externos. Cobre exemplos, país por polígono, inclusão por clique/busca/coordenadas, datas inválidas, duração manual, múltiplas visitas, duas fotos e compressão, capa/legenda/remoção, galeria e gesto, edição/exclusão, confirmação, filtros/ordenação, clustering/rota/cores, backup com fotos e deduplicação, persistência após recarregar, cache offline e mensagens para imagem/JSON/rede/cota inválidos. As telas têm 1440 × 980 e 390 × 844 px. Falhas geram screenshot e trace em `test-results/`.

Resultado da entrega: **24 testes passaram**, correspondendo a 12 cenários executados nas duas telas com Chromium. A preparação de `vendor/` também foi repetida sem gerar diferenças, e as duas interfaces foram inspecionadas visualmente.

## Estrutura e decisões técnicas

```text
index.html          estrutura, formulários e diálogos acessíveis
styles.css          tema, responsividade, foco e movimento reduzido
src/main.js         inicialização e integração dos fluxos
src/db.js           IndexedDB, exemplos, backup e validação da importação
src/geography.js    ponto em polígono e continentes
src/map.js          Leaflet, clusters, países, marcadores e rota
src/geocoding.js    debounce, cancelamento e limite de 1 pedido/segundo
src/photos.js       compressão, miniaturas e decodificação de backup
src/gallery.js      visualizador, teclado e gesto de deslizar
src/stats.js        estatísticas, cronologia e distância
src/dates.js        datas UTC, duração inclusiva e validação
src/ui.js           lista, detalhes, filtros, mensagens e confirmações
sw.js               cache dos arquivos locais para uso offline
vendor/             bibliotecas e países versionados
tools/vendor.mjs    prepara arquivos a partir de node_modules, sem rede
tests/              testes end-to-end
```

- O runtime usa apenas JavaScript nativo e as versões locais do Leaflet 1.9.4 e markercluster 1.5.3. `topojson-client` e `world-atlas` são usados pela ferramenta de preparação, não pelo navegador. Playwright serve apenas aos testes.
- `countries.geojson` vem do Natural Earth, por meio de `world-atlas/countries-50m.json`. A atribuição de país usa ponto em polígono, com suporte a MultiPolygon, limites e buracos. O nome digitado ou retornado pelo Nominatim não determina o país. A tabela ISO numérico → região em `tools/iso-regions.json` permite gerar nomes em português com `Intl.DisplayNames`; foi extraída do pacote de sistema `iso-codes`.
- Três regiões sem ID no conjunto original recebem IDs locais estáveis e nomes em português: Chipre do Norte, Somalilândia e Kosovo. A geometria segue a fonte; a representação não é uma decisão sobre soberania.
- Continentes seguem uma classificação por país: Rússia e Chipre na Europa; Turquia, Geórgia, Armênia e Azerbaijão na Ásia; América do Norte e do Sul separadas. Territórios franceses austrais são classificados na Antártida. Partes de países transcontinentais compartilham essa classificação.
- Dias são somados por visita, inclusive quando estadias se sobrepõem. Visitas sem datas e sem duração têm tempo desconhecido, contribuindo com zero aos totais. Duração manual não inventa datas e não entra no percurso cronológico.
- A distância usa Haversine sobre uma esfera de raio 6371 km entre visitas ordenadas pela chegada; datas iguais são ordenadas pelo nome. A rota usa arcos interpolados e ajusta cruzamentos de longitude para o caminho curto. É uma indicação visual; não representa estradas, voos ou itinerários reais.
- A intensidade dos países é proporcional ao total de dias, normalizada pelo país com maior duração. Destinos com tempo desconhecido ainda destacam o país, com intensidade mínima. O contador de destinos representa os lugares cadastrados, que podem incluir cidades ou outros pontos.
- Leituras de fotos geram URLs de Blob locais; URLs temporárias são liberadas quando deixam de ser necessárias. Gravação de destino e fotos, exclusão e importação usam transações para manter consistência. Textos são escapados antes de aparecer no HTML.
- O service worker revalida os arquivos locais no servidor, inclusive módulos importados, e usa o cache em caso de falha. A instalação de uma versão ignora arquivos antigos do cache HTTP. O rodapé mostra a versão e **Atualizar site** busca a publicação mais recente, preservando IndexedDB, sessão, filas de sincronização e a rota atual. Uma aba aberta avisa quando chega uma atualização; o site aguarda seu clique, para não interromper edições. Para publicar uma versão, atualize `VERSION` em `sw.js`, a versão no HTML e os parâmetros `v` do CSS e dos dois módulos de entrada. Novos arquivos de execução devem entrar em `FILES`. O escopo do worker é a pasta da aplicação.
- A busca cancela resultados obsoletos, usa debounce de 450 ms e respeita ao menos 1 segundo entre requisições. Tem timeout de 10 segundos e mensagens de falha. Tiles e geocodificação enviam ao respectivo serviço a área do mapa e o termo de busca; fotos, notas e backups continuam locais.

Para atualizar os arquivos locais após uma atualização deliberada das dependências instaladas:

```bash
node tools/vendor.mjs
```

Esse comando copia JS, CSS, imagens e licenças, gera o GeoJSON e não acessa a rede. Revise e versione as alterações de `vendor/`. O `package-lock.json` fixa as dependências de desenvolvimento; use `npm ci` para reinstalá-las. Os arquivos de execução em `vendor/` também são versionados.

## Limitações conhecidas e próximos passos

O mapa 1:50 milhões mantém limites detalhados, com recorte no meridiano de 180° para evitar faixas sobre países vizinhos. Ilhas pequenas e pontos muito próximos da costa podem não pertencer a nenhum polígono; nesses casos, mostramos **País não identificado** e permitimos salvar. As fronteiras e a classificação dos continentes dependem do conjunto e das convenções descritas acima. Os testes não consultam os serviços públicos reais: disponibilidade, políticas e limites externos continuam sob responsabilidade desses serviços.

O editor permite até 100 fotos por destino, até 40 MB por imagem de entrada e até 100 megapixels. Importação aceita JSON até 250 MB, 10 mil destinos e 20 mil fotos; coleções grandes exigem memória temporária para exportar/importar base64. JPEG não mantém transparência ou animação. HEIC depende do suporte do navegador e, quando incompatível, mostra uma orientação para JPEG, PNG ou WebP. A qualidade de fotos importadas é novamente normalizada pelo mesmo compressor.

Próximos passos possíveis: países com maior resolução, busca configurável com um serviço próprio, importação/exportação por fluxo para coleções maiores, persistência de armazenamento solicitada ao navegador e testes adicionais em Firefox/Safari e dispositivos físicos. A versão atual usa os recursos de navegadores modernos e foi verificada com Chromium.

Licenças das bibliotecas estão em `vendor/`; dados Natural Earth são de domínio público. Créditos de tiles e geometria aparecem no mapa.

## Contas, perfis e nuvem (nova versão)

A integração com Supabase adiciona cadastro/login, confirmação e recuperação de senha, perfil com avatar/bio/nome de usuário exclusivo, busca e visualização de perfis públicos, postagens públicas ou privadas e sincronização de viagens e fotos. A coleção sem login é preservada, separada das contas, e a migração para a conta é explícita e privada.

**Este site já está conectado ao projeto Supabase configurado pelo proprietário**, usando apenas a URL e a chave pública em `config.js`. Para uma instalação própria, siga o [guia de ativação](docs/SUPABASE.md): crie o projeto, execute [schema.sql](supabase/schema.sql), verifique as permissões com [verify-policies.sql](supabase/verify-policies.sql), configure os e-mails/redirecionamentos e preencha a URL e a chave pública publishable/anon. Nunca publique chaves administrativas.

O frontend não precisa de build ou nova biblioteca. Contas usam cache IndexedDB separado e uma fila offline; revisões impedem sobrescritas silenciosas entre dispositivos. Ao sair, a sessão e a cópia local privada da conta são removidas. Fotos usam buckets privados e URLs temporárias, conforme explicado no guia.

Verificação: `npm test` passou em **46 testes**, 23 cenários em desktop e celular, incluindo o atlas local e endpoints Supabase simulados. A instalação SQL, as permissões reais, o recebimento de e-mails e a integração de produção ainda precisam ser conferidos no projeto que você configurar.

## Trips, roteiros e resumos

A atualização inclui grupos com convites por usuário e permissões, roteiros com paradas ordenadas e datas, capa, compartilhamento por WhatsApp, favoritas/fixadas, quatro estilos de mapa e resumos mensais/anuais com calendário, tabela e exportação SVG/CSV.

**Para ativar grupos e roteiros na nuvem:** execute `supabase/trips.sql` e depois `supabase/verify-trips.sql` no SQL Editor do seu projeto. As postagens existentes são preservadas. Confira o [guia da atualização](docs/TRIPS.md) para uso, privacidade e limites. Os resumos e destaques não exigem essa migração.

## Colaboradores, galeria e mapa de calor

O criador agora escolhe permissões individuais para editar roteiro/nome/capa, escrever descrições/planos, adicionar fotos e publicar uma trip pública no próprio perfil. A galeria segue a privacidade da trip. Publicações no perfil são vínculos revogáveis, sem copiar postagens privadas.

**Para ativar:** depois de `schema.sql` e `trips.sql`, execute [collaboration.sql](supabase/collaboration.sql) e [verify-collaboration.sql](supabase/verify-collaboration.sql) no Supabase. Instalações que já têm trips começam pela atualização de colaboração; não reaplique a função antiga de `trips.sql` por cima dela. Confira as instruções de uso e limites no [guia de trips](docs/TRIPS.md).

Atlas escuro, Atlas claro e Atlas sem tiles usam o mapa local, sem marcas de um provedor remoto. Ruas usa OpenStreetMap; os créditos das fontes permanecem. **Calor → Por visitas / Por dias** mostra concentração dos lugares registrados, excluindo moradias, exemplos e visitas futuras. Não há rastreamento GPS nem trajetos de rua inventados. No perfil público, o calor considera apenas postagens públicas. Mapas e calor não precisam da nova migração.

A suíte verifica os fluxos locais e contratos HTTP simulados em desktop/celular; as políticas SQL precisam ser verificadas no projeto real com os scripts de verificação. Nenhuma dependência nova foi instalada.

Verificação desta atualização: **86 testes passaram** em desktop e celular, com endpoints Supabase simulados. A conferência visual das duas telas não mostrou transbordamento ou erros de JavaScript. As migrações e verificações PostgreSQL estão prontas para execução pelo proprietário no Supabase; não foram executadas neste ambiente.

## Vídeos e Live Photos

Destinos pessoais e galerias de trips aceitam vídeos MP4/WebM/MOV compatíveis, com controles e áudio preservado. Uma foto e um vídeo com o mesmo nome, selecionados juntos, formam uma Live Photo. O seletor do iPhone pode entregar só a foto; exporte o movimento pelo app Fotos quando necessário.

**Para salvar na nuvem:** execute [media.sql](supabase/media.sql) depois das migrações anteriores e confira com [verify-media.sql](supabase/verify-media.sql). Fotos existentes são preservadas. Vídeos têm limite de 50 MB, e o backup pessoal versão 2 inclui os novos formatos e continua importando backups antigos. Veja o [guia de ativação e uso](docs/MEDIA.md), incluindo os limites de codecs, Storage e backup.

Verificação desta atualização: **108 testes passaram** em desktop e celular, com Supabase simulado, incluindo reprodução real de MP4/MOV/WebM, Live Photos, backup, migração de dados locais, permissões, perda de resposta e limpeza da conta. A revisão visual não encontrou transbordamento ou erros de JavaScript. Os scripts SQL não foram executados neste ambiente; execute a verificação no seu projeto.

## Wish list pública ou privada

O menu **Wish list** e **Meu perfil → Gerenciar minha wish list** permitem salvar até 200 lugares com nome, país opcional e notas. A lista começa privada; publicar a lista inteira exibe os desejos no perfil encontrável, sem alterar viagens realizadas, países visitados ou estatísticas. Inclui cache por conta, fila offline, revisões e backup/migração privados.

**Para ativar na nuvem:** execute [wishlist.sql](supabase/wishlist.sql) e [verify-wishlist.sql](supabase/verify-wishlist.sql), depois do `schema.sql` já instalado. Essa atualização não exige reinstalar trips ou mídias. Veja o [guia de uso e ativação](docs/WISHLIST.md).

Verificação da wish list: **130 testes passaram na suíte completa**, em desktop/celular, e **2 testes adicionais** confirmaram compatibilidade do backup sem a migração. A revisão visual não mostrou transbordamento ou erros de JavaScript. Supabase foi simulado nos testes; execute a instalação e a verificação SQL no seu projeto para conferir as políticas reais.

### Memórias no mapa e fotos nas trips

No mapa em tela cheia, clique em um lugar visitado para ver sua avaliação, notas e fotos. A galeria abre sem sair da tela cheia. Grupos de lugares usam o mesmo marcador com check do mapa em tela cheia; a quantidade permanece no rótulo acessível.

Nas trips salvas, **Importar fotos das avaliações** permite escolher mídias da sua coleção. Ao usar **Adicionar viagens já feitas**, a opção **Incluir fotos e mídias das avaliações** copia também as fotos desses lugares quando você salva o roteiro. As cópias seguem a visibilidade da trip e preservam os originais. Veja [o guia das trips](docs/TRIPS.md).


### Visualização cronológica e links de trips

Use **Visualizar** para abrir o mapa da rota e uma linha do tempo com as fotos de cada lugar. As mídias importadas das avaliações são associadas ao destino; o seletor de lugar permite reorganizar as fotos e manter um álbum geral.

O organizador pode criar um link público para visualização, após confirmar o conteúdo publicado. Visitantes veem a trip sem login; salvar na coleção e pedir participação exigem conta. Pedidos precisam ser aprovados pelo organizador, que define as permissões dos novos participantes. A atualização exige a migração descrita no [guia de trips](docs/TRIPS.md). Verifique as políticas reais com `npm run test:sharing-db` e a interface com os testes de trips. O banco embutido é usado somente nos testes; o navegador continua sem novas bibliotecas.
