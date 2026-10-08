# Atlas Pessoal

Um mapa das suas viagens e das memórias que vieram com elas. Aplicação em português do Brasil, com tema escuro, mapa interativo, visitas múltiplas, fotografias, filtros e backup. Os dados ficam no seu navegador.

## Executar

Na pasta do projeto:

```bash
python3 -m http.server 8000
```

Abra `http://localhost:8000` no navegador. Não abra o HTML diretamente com `file://`: os módulos ES, o GeoJSON e o cache offline precisam de HTTP. Não há backend, build, CDN ou necessidade de npm para usar a aplicação. A pasta `vendor/` já contém os arquivos de execução.

Use sempre a mesma origem (protocolo, endereço e porta) para acessar os mesmos dados. `localhost:8000` e `127.0.0.1:8000` têm armazenamentos diferentes. Para hospedagem externa, use HTTPS para habilitar o service worker.

## Registrar suas viagens

- Clique no mapa, busque uma cidade ou país ou preencha latitude e longitude em **Adicionar destino**. A busca oferece sugestões depois de uma pausa na digitação.
- Registre chegada e partida em cada visita. As duas datas contam: de 1 a 3 são **3 dias**; de 1 a 15 são **2 semanas e 1 dia**. Use **Não lembro as datas** para informar dias manualmente. **Adicionar outra visita** mantém várias estadias no mesmo destino.
- Adicione notas, avaliação de 1 a 5 e etiquetas separadas por vírgula. Campos sem informação podem ficar vazios, exceto nome e coordenadas.
- Selecione várias fotos ou arraste-as para a área de upload. Edite legendas, escolha a capa e remova fotos no formulário. As alterações só são gravadas ao salvar o destino.
- Clique em um destino para ver suas visitas e galeria. No visualizador, use os botões, as setas do teclado ou deslize horizontalmente; Escape fecha a galeria.
- Busque na coleção, filtre por país/etiqueta e ordene por data, nome, duração ou avaliação. **Ver todos** enquadra a coleção; **Rota cronológica** desenha o percurso das visitas com datas.
- A primeira execução inclui Milão, Verona, Veneza, Florença e Roma. As coordenadas são reais; as datas de maio de 2024 são ilustrativas. **Limpar exemplos** pede confirmação e remove somente exemplos ainda não editados. Eles não são criados novamente ao recarregar.

## Offline, fotos e backup

O IndexedDB possui stores separados para metadados (`destinations`), fotos como `Blob` (`photos`) e inicialização (`meta`). Não usamos localStorage. Fotos e miniaturas não são enviadas a nenhum serviço. Antes de salvar, o navegador decodifica a imagem, limita o maior lado a 1600 px, converte para JPEG com qualidade 0,85 e gera uma miniatura de até 240 px. A transparência é composta sobre fundo escuro.

Depois do primeiro carregamento bem-sucedido e da ativação do service worker, os arquivos locais ficam em cache. A aplicação reabre sem internet, com destinos, países, edição, estatísticas e fotos. Os tiles do CARTO Dark Matter são opcionais: se falharem, o GeoJSON continua visível sobre fundo escuro. A busca depende do Nominatim; uma falha oferece a alternativa de mapa ou coordenadas. O cache não armazena tiles nem resultados de geocodificação.

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
- `countries.geojson` vem do Natural Earth, por meio de `world-atlas/countries-110m.json`. A atribuição de país usa ponto em polígono, com suporte a MultiPolygon, limites e buracos. O nome digitado ou retornado pelo Nominatim não determina o país. A tabela ISO numérico → região em `tools/iso-regions.json` permite gerar nomes em português com `Intl.DisplayNames`; foi extraída do pacote de sistema `iso-codes`.
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

O mapa 1:110 milhões é deliberadamente compacto. Ilhas pequenas e pontos muito próximos da costa podem não pertencer a nenhum polígono; nesses casos, mostramos **País não identificado** e permitimos salvar. As fronteiras e a classificação dos continentes dependem do conjunto e das convenções descritas acima. Os testes não consultam os serviços públicos reais: disponibilidade, políticas e limites externos continuam sob responsabilidade desses serviços.

O editor permite até 100 fotos por destino, até 40 MB por imagem de entrada e até 100 megapixels. Importação aceita JSON até 250 MB, 10 mil destinos e 20 mil fotos; coleções grandes exigem memória temporária para exportar/importar base64. JPEG não mantém transparência ou animação. HEIC depende do suporte do navegador e, quando incompatível, mostra uma orientação para JPEG, PNG ou WebP. A qualidade de fotos importadas é novamente normalizada pelo mesmo compressor.

Próximos passos possíveis: países com maior resolução, busca configurável com um serviço próprio, importação/exportação por fluxo para coleções maiores, persistência de armazenamento solicitada ao navegador e testes adicionais em Firefox/Safari e dispositivos físicos. A versão atual usa os recursos de navegadores modernos e foi verificada com Chromium.

Licenças das bibliotecas estão em `vendor/`; dados Natural Earth são de domínio público. Créditos de tiles e geometria aparecem no mapa.
