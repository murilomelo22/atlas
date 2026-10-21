# Wish list: mapa, lista e perfil

A wish list reúne lugares que você quer conhecer, separados das viagens realizadas. Os desejos aparecem em seu próprio mapa; não pintam países no mapa de memórias nem entram nas estatísticas, calendário ou mapa de calor.

## Mapa e etapas · versão 35

- **Mapa e lista** mostra os pontos e a lista lado a lado no computador e empilhados no celular. **Só lista** oculta o mapa. **Ver no mapa** abre o ponto de um lugar; **Enquadrar lugares** reúne os pontos do filtro atual. Pontos próximos são agrupados e se separam ao aproximar o mapa.
- Para localizar um desejo, use **Buscar localização**, escolha um resultado, toque no mapa ou preencha **Localização e coordenadas**. Nome, país e nota continuam editáveis. A busca é opcional; sem coordenadas, o item fica identificado como **Sem localização** na lista. Lugares antigos não recebem coordenadas por aproximação ou buscas automáticas.
- Escolha **Quero conhecer**, **Planejando** ou **Já visitei** e filtre os lugares por etapa. O botão **Já visitei** também altera a etapa diretamente na lista; **Voltar a desejar** desfaz essa escolha. As etapas organizam a wish list: registrar uma viagem e suas estatísticas continua sendo uma ação separada em **Adicionar destino**.
- Guarde o motivo do desejo em **Notas do desejo**. Nome, país, notas, localização e etapa são preservados ao editar, sincronizar e exportar/importar o backup. Latitude e longitude são tratadas como uma única localização na resolução de conflitos entre aparelhos.
- Primeiro use **Adicionar à lista** ou **Aplicar alteração**, depois **Salvar wish list**. Fechar descarta o formulário não salvo. Um lugar em edição precisa ser aplicado ou cancelado antes de usar sua ação rápida de etapa.

O mapa usa os países locais do Atlas, sem tiles remotos. Depois do primeiro carregamento e da instalação do cache, a visualização permanece disponível offline. A busca de novos lugares exige internet e envia somente o texto pesquisado ao Nominatim/OpenStreetMap; notas e a lista não são enviadas a esse serviço. Também é possível localizar por mapa/coordenadas sem internet.

As regras de privacidade continuam valendo para a lista inteira. Visitantes do perfil público veem nome, país, notas e etapa, sem ações de edição. O mapa de gerenciamento fica na própria wish list.

## Ativar na nuvem

1. No seu projeto Supabase, abra **SQL Editor → New query**.
2. Depois de `schema.sql` (já instalado para login), copie e execute [`supabase/wishlist.sql`](../supabase/wishlist.sql) inteiro. Esta atualização é repetível, preserva os dados existentes e não depende das migrações de trips ou mídias.
3. Para os novos campos de mapa e etapa, execute [`supabase/migrations/20261021191932_atlas_wishlist_map.sql`](../supabase/migrations/20261021191932_atlas_wishlist_map.sql). Em instalações que já têm wish list, execute somente essa nova migração. Ela é repetível e substitui apenas o validador dos itens: mantém as listas existentes, a RPC de escrita, revisões, visibilidade e permissões. Não reaplique o `wishlist.sql` antigo por cima da migração do mapa.
4. A verificação local `npm run test:wishlist-map-db` executa a migração duas vezes em PostgreSQL embutido, preserva um item antigo, testa dados inválidos, revisão, replay e leituras públicas/privadas com os papéis `anon` e `authenticated`. Os testes de navegador usam endpoints Supabase simulados; a migração não é aplicada automaticamente ao projeto de produção.
5. Atualize o [Atlas](https://murilomelo22.github.io/atlas/) depois de publicar a versão 35. A instalação e as políticas reais precisam ser verificadas no seu projeto.

Sem a migração, as outras funções continuam disponíveis. Uma wish list editada fica neste dispositivo e o site avisa que precisa ativar o SQL. Depois, use **Meu perfil → Sincronizar agora** para enviá-la.

## Como usar

- Abra **Wish list** no menu ou **Meu perfil → Gerenciar minha wish list**.
- Informe o lugar, país opcional e notas. Clique **Adicionar à lista**. Para editar um item, use **Editar → Aplicar alteração**; **Remover** tira o lugar do formulário.
- Escolha **Privada · somente eu** ou **Pública · mostrar no perfil**, e clique **Salvar wish list**. As alterações só são guardadas nesse último passo. Fechar o formulário descarta alterações ainda não salvas.
- A privacidade vale para **a lista inteira**. Ela começa privada. Quando pública, aparece no perfil junto às viagens e trips compartilhadas, desde que seu perfil permita que outras pessoas o encontrem. Um perfil privado oculta também a wish list pública. Visitantes podem ler, sem controles de edição. A lista privada é gerenciada em **Meu perfil**, sem aparecer no perfil de visitantes.
- Espere **Tudo salvo na sua conta** antes de verificar a publicação em outro dispositivo. Reabra ou atualize o perfil para ver alterações recentes. Sem login, a lista é privada e fica somente no navegador; para copiá-la à conta, entre e use **Enviar meus dados locais para minha conta**. A migração é explícita e copia desejos como privados, sem duplicar lugar/país.

## Dados e limites

Até 200 lugares, com nome de até 120 caracteres, país de até 80 e notas de até 2.000. Localização e etapa são opcionais nos dados; itens antigos começam em **Quero conhecer**, sem localização. Coordenadas aceitam latitude entre −90 e 90 e longitude entre −180 e 180, inclusive zero. A lista entra no backup pessoal JSON versão 2; backups antigos sem wish list continuam aceitos. A importação evita duplicações e torna a lista privada para evitar publicação automática. Lugares de mesmo nome e país com coordenadas diferentes são preservados separadamente.

Contas usam caches separados. Sair remove a cópia local da conta e limpa o formulário. Alterações offline ficam pendentes até uma sincronização bem-sucedida; sincronize ou exporte backup antes de sair com dados pendentes. A coleção sem login continua independente.

Revisões detectam alterações concorrentes entre dispositivos. A wish list guarda a última versão confirmada da nuvem para combinar automaticamente alterações independentes: novos lugares, edições em campos diferentes e exclusões de itens que não foram editados no outro aparelho. Há no máximo uma nova tentativa após um conflito, evitando ciclos de gravação.

Se os dois aparelhos mudarem o mesmo campo de formas diferentes, ou se o cache antigo não tiver a versão necessária para comparação, abra a wish list e use **Revisar e combinar listas**. A revisão mantém os lugares das duas listas; versões diferentes de um mesmo lugar aparecem separadamente. Confira os itens, remova cópias que não deseja e clique em **Salvar wish list**. A lista combinada começa privada. Abrir a revisão não altera os dados salvos, e fechar sem salvar descarta somente o formulário. Uma mudança posterior na nuvem continua protegida pela revisão; o site não sobrescreve a nuvem sem verificar sua versão.

**Meu perfil → Carregar versão da nuvem** continua substituindo alterações locais de viagens e wish list após confirmação. Exporte um backup antes de usá-la com dados pendentes. Um envio com resposta perdida pode ser repetido sem duplicar a lista. A reconciliação não exige migração adicional; para os campos de mapa/etapa, execute a migração indicada acima. Nenhuma biblioteca nova de execução foi adicionada.
