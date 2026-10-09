# Atualização: trips, roteiros e resumos

As postagens existentes são preservadas. Favoritas/fixadas, estilos de mapa, resumos e WhatsApp funcionam com o banco já instalado. Grupos e roteiros na nuvem precisam desta atualização adicional:

1. No Supabase, abra **SQL Editor → New query**.
2. Copie todo o arquivo [`supabase/trips.sql`](../supabase/trips.sql) e execute. O script é aditivo e pode ser executado novamente; não substitua nem apague suas tabelas.
3. Em outra consulta, execute [`supabase/verify-trips.sql`](../supabase/verify-trips.sql). O teste remove seus dados de teste com `ROLLBACK`. Aguarde o resultado `PASS: trips, invitations, roles, covers and revisions`.
4. Abra o Atlas e recarregue com **Ctrl + Shift + R**. Abra **Trips e roteiros**.

## Grupos e roteiros

- Crie uma trip, dê um nome, descrição e foto de capa. Adicione paradas manualmente com coordenadas ou escolha destinos do seu atlas. Apenas nome e coordenadas são copiados; fotos e notas privadas da postagem não são publicadas.
- Defina datas e planos de cada parada; use as setas para mudar a ordem. **Ver no mapa** mostra paradas e linhas entre elas. Não há cálculo de estradas, reservas, preços ou horários de transporte.
- Ao entrar na conta, roteiros são salvos online. Edições offline ficam no formulário aberto e precisam de nova tentativa; não fazem parte da fila automática das postagens. Use **Exportar JSON** antes de fechar uma edição com problema.
- Convide pelo nome de usuário. O perfil precisa estar encontrável. O convite aparece em **Trips e roteiros** da outra conta, sem envio de e-mail. O convidado pode conhecer o roteiro antes de aceitar; um editor só pode editar depois de aceitar.
- **Acompanhar** permite ler; **Editar roteiro** permite modificar nome, capa, descrição e paradas. Só quem organiza pode convidar/remover pessoas, publicar/privatizar ou excluir o grupo. Participantes podem sair.
- Roteiros são privados por padrão. **Roteiro público por link** publica nome, capa, descrição, datas e planos independentemente da privacidade do perfil do organizador. A lista de participantes não é pública. O link não dá permissão de edição.
- As revisões detectam mudanças concorrentes. Se houver conflito, exporte seu JSON e reabra a trip para obter a versão atual. Não existe colaboração em tempo real; clique em **Atualizar** para buscar novidades.
- Roteiros sem login ficam neste navegador e podem ser exportados em JSON. Para migrar um roteiro local, exporte, entre na conta, use **Importar roteiro JSON** e salve. A importação cria uma trip nova privada e não copia participantes. Roteiros têm exportação própria; o backup geral continua cobrindo postagens e fotos.
- A capa fica no bucket privado `atlas-trip-covers`. URLs assinadas duram até cinco minutos; um link já emitido pode funcionar até expirar após privatizar ou remover um participante. Capas substituídas ou de trips apagadas podem permanecer privadas no Storage; não são removidas automaticamente.

## Destaques, mapas e compartilhamento

No editor de destino, marque **Favorita** ou **Fixar no topo**. As fixadas aparecem primeiro em qualquer ordenação. Os destaques são sincronizados com a postagem e aparecem no perfil público quando a postagem é pública.

A seleção de mapa oferece Escuro, Claro, Viajante, Ruas e Atlas sem tiles; a preferência fica neste navegador. Os tiles dependem da conexão e das condições de uso de CARTO/OpenStreetMap. O mapa local de países e os destinos continuam disponíveis sem os tiles.

O WhatsApp abre uma mensagem para você escolher o destinatário e enviar. Perfis/postagens usam o endereço público. Um roteiro privado pode ser compartilhado como texto após confirmar o conteúdo que será enviado, sem torná-lo público. Um roteiro público inclui seu link.

## Resumos mensais e anuais

**Resumos** apresenta calendário de atividades, tabela mensal, destinos, países, dias e distância. Os exemplos não editados e visitas sem datas não entram no calendário. Datas sobrepostas contam uma vez em dias registrados. Visitas que atravessam meses contribuem apenas nos dias correspondentes a cada mês.

A distância soma linhas retas entre chegadas dentro do período, em ordem de data; trajetos anteriores/externos ao período não entram. A equivalência a pé usa 5 km/h por 8 horas/dia (40 km/dia), arredondando para cima. É uma comparação ilustrativa, não uma rota real ou orientação de caminhada.

Baixe a imagem **SVG** para usar em publicações ou campanhas e a tabela **CSV** para planilhas. No perfil de outra pessoa, o resumo usa apenas as postagens públicas carregadas. Compartilhar seu próprio resumo expõe os números escolhidos, sem publicar automaticamente suas postagens.

## Validação

`npm test` executa testes desktop/mobile do atlas e das novas funções com HTTP Supabase simulado. Esses testes não substituem `verify-trips.sql` no PostgreSQL do seu projeto nem a conferência real em duas contas. Não há downloads adicionais de bibliotecas nem novas dependências de execução.
