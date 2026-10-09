# Atualização: trips, roteiros e resumos

As postagens existentes são preservadas. Favoritas/fixadas, estilos de mapa, resumos e WhatsApp funcionam com o banco já instalado. Grupos e roteiros na nuvem precisam desta atualização adicional:

1. No Supabase, abra **SQL Editor → New query**.
2. Copie todo o arquivo [`supabase/trips.sql`](../supabase/trips.sql) e execute. O script é aditivo e pode ser executado novamente; não substitua nem apague suas tabelas.
3. Em outra consulta, execute [`supabase/verify-trips.sql`](../supabase/verify-trips.sql). O teste remove seus dados de teste com `ROLLBACK`. Aguarde o resultado `PASS: trips, invitations, roles, covers and revisions`.
4. Execute [`supabase/collaboration.sql`](../supabase/collaboration.sql) para ativar permissões individuais, galeria e publicação no perfil. Se já instalou as trips antes, comece neste passo: **não execute `trips.sql` novamente depois desta atualização**, pois a versão anterior da função de salvar não verifica as permissões individuais.
5. Em outra consulta, execute [`supabase/verify-collaboration.sql`](../supabase/verify-collaboration.sql). Espere `PASS: collaboration permissions, photos and profile publications`. Fixtures são desfeitas por `ROLLBACK`; o script verifica alterações indevidas, escalada de privilégios, uploads, revogação e visibilidade pública no PostgreSQL real.
6. Abra o Atlas e recarregue com **Ctrl + Shift + R**. Abra **Trips e roteiros**.

## Grupos e roteiros

- Crie uma trip, dê um nome, descrição e foto de capa. Adicione paradas manualmente com coordenadas ou escolha destinos do seu atlas. Apenas nome e coordenadas são copiados; fotos e notas privadas da postagem não são publicadas.
- Use **Adicionar viagens já feitas** para escolher uma ou mais visitas anteriores, com chegada, partida e duração. Visitas futuras, moradias e exemplos não aparecem na seleção. A cópia fica no roteiro; editar a postagem original depois não altera a trip. Notas só são copiadas se você marcar **Incluir minhas notas**; fotos permanecem na postagem original. Uma mesma visita não é adicionada duas vezes.
- Defina datas e planos de cada parada; use as setas para mudar a ordem. **Ver no mapa** mostra paradas e linhas entre elas. Não há cálculo de estradas, reservas, preços ou horários de transporte.
- Ao entrar na conta, roteiros são salvos online. Edições offline ficam no formulário aberto e precisam de nova tentativa; não fazem parte da fila automática das postagens. Use **Exportar JSON** antes de fechar uma edição com problema.
- Convide pelo nome de usuário. O perfil precisa estar encontrável. O convite aparece em **Trips e roteiros** da outra conta, sem envio de e-mail. O convidado pode conhecer o roteiro antes de aceitar; um editor só pode editar depois de aceitar.
- O criador escolhe separadamente **Editar roteiro, nome e capa**, **Escrever descrições e planos**, **Adicionar fotos** e **Publicar no próprio perfil**. As mesmas opções aparecem ao lado de cada participante; altere e clique em **Salvar permissões**. Um colaborador pode enviar fotos sem editar paradas ou escrever descrições sem renomear a viagem. As permissões só valem depois de aceitar o convite e são verificadas no servidor, incluindo uploads no Storage. Editores antigos mantêm roteiro e descrições; fotos e publicação começam desautorizadas.
- Só quem organiza pode convidar/remover pessoas, escolher as permissões, tornar a trip pública/privada ou excluir o grupo. Participantes podem sair. Reabra a trip para carregar as permissões alteradas; mesmo com a tela antiga aberta, o servidor rejeita ações revogadas.
- **Fotos da trip → Enviar foto** adiciona uma imagem e legenda à galeria do grupo. São fotos próprias da trip, sem cópia automática das postagens pessoais. A galeria acompanha a privacidade da trip, inclusive links públicos. O criador pode remover qualquer foto; colaboradores autorizados podem remover suas próprias fotos. Até 100 imagens por trip; o compressor aceita JPEG, PNG e WebP até 40 MB/100 megapixels e grava JPEG de até 10 MB no bucket privado `atlas-trip-media`.
- **No meu perfil → Publicar no meu perfil** cria um vínculo visível em **Trips compartilhadas** no perfil. Exige trip pública, perfil encontrável e autorização do criador (o criador também pode publicar no próprio perfil). **Retirar do meu perfil** desfaz a publicação. Revogar a autorização, remover/sair do grupo ou privatizar a trip remove o vínculo; autorizar/publicar novamente não restaura a publicação automaticamente. As postagens pessoais não são copiadas nem a trip entra nas estatísticas de viagens realizadas.
- Roteiros são privados por padrão. **Roteiro público por link** publica nome, capa, descrição, datas, planos e galeria independentemente da privacidade do perfil do organizador. A lista de participantes e suas permissões não são públicas. O link não dá permissão de edição. Autorizar um participante a publicar no perfil não torna o roteiro público; o criador precisa habilitar essa opção.
- As revisões detectam mudanças concorrentes. Se houver conflito, exporte seu JSON e reabra a trip para obter a versão atual. Não existe colaboração em tempo real; clique em **Atualizar** para buscar novidades.
- Roteiros sem login ficam neste navegador e podem ser exportados em JSON. Para migrar um roteiro local, exporte, entre na conta, use **Importar roteiro JSON** e salve. A importação cria uma trip nova privada e não copia participantes. O JSON do roteiro cobre descrição, paradas e capa local; a galeria compartilhada não está incluída. O backup geral continua cobrindo postagens e suas fotos.
- A capa fica no bucket privado `atlas-trip-covers` e a galeria em `atlas-trip-media`. URLs assinadas duram até cinco minutos; um link já emitido pode funcionar até expirar após privatizar ou remover um participante. Imagens substituídas, de trips apagadas ou removidas pelo criador quando foram enviadas por outra pessoa podem permanecer privadas no Storage. O autor consegue apagar o objeto ao remover a própria foto; não há limpeza automática de todos os objetos órfãos.

## Destaques, mapas e compartilhamento

No editor de destino, marque **Favorita** ou **Fixar no topo**. As fixadas aparecem primeiro em qualquer ordenação. Os destaques são sincronizados com a postagem e aparecem no perfil público quando a postagem é pública.

A seleção oferece **Atlas escuro**, **Atlas claro**, **Ruas** e **Atlas sem tiles**. Os três estilos Atlas usam a geometria local, sem logos ou marcas d’água de um fornecedor remoto, e funcionam offline. Ruas usa os tiles padrão OpenStreetMap, com conexão e créditos obrigatórios. CARTO e Viajante foram substituídos; uma preferência antiga por Viajante passa ao Atlas escuro. Os créditos discretos das fontes são mantidos. Desmarque **Mostrar viagens no mapa** para ocultar marcadores, números e rotas, mantendo os países pintados. Ao passar o mouse, o país recebe um destaque no seu próprio contorno e mostra o nome.

**Calor → Por visitas / Por dias** sobrepõe cores aos lugares registrados. Visitas soma as visitas por destino, incluindo as sem datas; Dias usa durações manuais ou o período informado, limitado até hoje nas visitas em andamento. Moradias, exemplos e visitas com chegada futura são excluídos. Dias sem duração não geram calor. A escala é relativa à concentração dos pontos visíveis no mapa; pontos próximos se somam. A preferência fica neste navegador e funciona com todos os estilos, mesmo com marcadores ocultos. No perfil de outra pessoa, usa apenas as postagens públicas carregadas. Os pontos vêm das suas postagens: o Atlas não coleta GPS nem inventa trajetos por ruas entre destinos.

No formulário do destino, escolha **Casa / moradia** para marcar onde você mora ou morou. A moradia tem símbolo de casa e seu país recebe azul (ou borda azul se também houver viagens). Moradias não entram nos dias, distâncias, continentes e países visitados, resumos nem na seleção de viagens realizadas; continuam na coleção de destinos. A privacidade é a mesma de uma postagem: começa privada na conta.

Os contornos locais usam Natural Earth 1:50 milhões, com recorte no meridiano de 180° para não desenhar faixas sobre outros territórios. A identificação de um ponto até 3 km de uma costa simplificada pode usar o país mais próximo, com aviso no formulário. Essa aproximação não amplia o contorno desenhado; ilhas pequenas e detalhes costeiros seguem limitados pela escala da base.

Moradias, visitas copiadas e mapa de calor usam os dados existentes e não exigem SQL adicional. As novas permissões, fotos de grupo e publicação no perfil exigem `collaboration.sql`.

O WhatsApp abre uma mensagem para você escolher o destinatário e enviar. Perfis/postagens usam o endereço público. Um roteiro privado pode ser compartilhado como texto após confirmar o conteúdo que será enviado, sem torná-lo público. Um roteiro público inclui seu link.

## Resumos mensais e anuais

**Resumos** apresenta calendário de atividades, tabela mensal, destinos, países, dias e distância. Os exemplos não editados e visitas sem datas não entram no calendário. Datas sobrepostas contam uma vez em dias registrados. Visitas que atravessam meses contribuem apenas nos dias correspondentes a cada mês.

A distância soma linhas retas entre chegadas dentro do período, em ordem de data; trajetos anteriores/externos ao período não entram. A equivalência a pé usa 5 km/h por 8 horas/dia (40 km/dia), arredondando para cima. É uma comparação ilustrativa, não uma rota real ou orientação de caminhada.

Baixe a imagem **SVG** para usar em publicações ou campanhas e a tabela **CSV** para planilhas. No perfil de outra pessoa, o resumo usa apenas as postagens públicas carregadas. Compartilhar seu próprio resumo expõe os números escolhidos, sem publicar automaticamente suas postagens.

## Validação

`npm test` executa testes desktop/mobile do atlas e das novas funções com HTTP Supabase simulado. Esses testes não substituem `verify-trips.sql` e `verify-collaboration.sql` no PostgreSQL do seu projeto nem a conferência real em duas contas. Não há downloads adicionais de bibliotecas nem novas dependências de execução.
