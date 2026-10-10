# atlas
atlas pessoal, teste usando o codex.
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
- O service worker tenta obter a versão atual dos arquivos pelo servidor e usa o cache em caso de falha. Para alterar a lista de arquivos de execução, atualize `FILES` e a versão de cache em `sw.js`. Seu escopo é a pasta da aplicação.
- A busca cancela resultados obsoletos, usa debounce de 450 ms e respeita ao menos 1 segundo entre requisições. Tem timeout de 10 segundos e mensagens de falha. Tiles e geocodificação enviam ao respectivo serviço a área do mapa e o termo de busca; fotos, notas e backups continuam locais.

Para atualizar os arquivos locais após uma atualização deliberada das dependências instaladas:

```bash
node tools/vendor.mjs
```

Esse comando copia JS, CSS, imagens e licenças, gera o GeoJSON e não acessa a rede. Revise e versione as alterações de `vendor/`. O `package.json` original não tinha lockfile; a aplicação é reproduzível pelos arquivos locais versionados, enquanto novas instalações de dependências de desenvolvimento podem resolver versões diferentes dentro das faixas declaradas.

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
