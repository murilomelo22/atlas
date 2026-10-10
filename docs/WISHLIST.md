# Wish list no perfil

A wish list reúne lugares que você quer conhecer, separados das viagens realizadas. Os desejos não pintam países no mapa nem entram nas estatísticas, calendário ou mapa de calor.

## Ativar na nuvem

1. No seu projeto Supabase, abra **SQL Editor → New query**.
2. Depois de `schema.sql` (já instalado para login), copie e execute [`supabase/wishlist.sql`](../supabase/wishlist.sql) inteiro. Esta atualização é repetível, preserva os dados existentes e não depende das migrações de trips ou mídias.
3. Em outra consulta, execute [`supabase/verify-wishlist.sql`](../supabase/verify-wishlist.sql). Deve aparecer **PASS: wish list, privacidade e permissões**. As contas de teste usam IDs aleatórios e são desfeitas por `ROLLBACK`; este script não acessa as tabelas de Storage.
4. Atualize o [Atlas](https://murilomelo22.github.io/atlas/). A instalação e as políticas reais precisam ser verificadas no seu projeto; os testes de navegador usam Supabase simulado.

Sem a migração, as outras funções continuam disponíveis. Uma wish list editada fica neste dispositivo e o site avisa que precisa ativar o SQL. Depois, use **Meu perfil → Sincronizar agora** para enviá-la.

## Como usar

- Abra **Wish list** no menu ou **Meu perfil → Gerenciar minha wish list**.
- Informe o lugar, país opcional e notas. Clique **Adicionar à lista**. Para editar um item, use **Editar → Aplicar alteração**; **Remover** tira o lugar do formulário.
- Escolha **Privada · somente eu** ou **Pública · mostrar no perfil**, e clique **Salvar wish list**. As alterações só são guardadas nesse último passo. Fechar o formulário descarta alterações ainda não salvas.
- A privacidade vale para **a lista inteira**. Ela começa privada. Quando pública, aparece no perfil junto às viagens e trips compartilhadas, desde que seu perfil permita que outras pessoas o encontrem. Um perfil privado oculta também a wish list pública. Visitantes podem ler, sem controles de edição. A lista privada é gerenciada em **Meu perfil**, sem aparecer no perfil de visitantes.
- Espere **Tudo salvo na sua conta** antes de verificar a publicação em outro dispositivo. Reabra ou atualize o perfil para ver alterações recentes. Sem login, a lista é privada e fica somente no navegador; para copiá-la à conta, entre e use **Enviar meus dados locais para minha conta**. A migração é explícita e copia desejos como privados, sem duplicar lugar/país.

## Dados e limites

Até 200 lugares, com nome de até 120 caracteres, país de até 80 e notas de até 2.000. A lista entra no backup pessoal JSON versão 2; backups antigos sem wish list continuam aceitos. A importação une lugares sem duplicar nome/país e torna a lista privada para evitar publicação automática.

Contas usam caches separados. Sair remove a cópia local da conta e limpa o formulário. Alterações offline ficam pendentes até uma sincronização bem-sucedida; sincronize ou exporte backup antes de sair com dados pendentes. A coleção sem login continua independente.

Revisões detectam alterações concorrentes entre dispositivos e preservam sua versão local. Em um conflito, exporte um backup antes de escolher **Meu perfil → Carregar versão da nuvem**, pois essa ação substitui as alterações locais de viagens e wish list. Um envio com resposta perdida pode ser repetido sem duplicar a lista. Nenhuma dependência nova foi instalada.
