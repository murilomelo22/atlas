# Atlas para uma coleção pessoal, amigos e família

Esta atualização reduz o trabalho por sincronização sem mudar o projeto Supabase, as regras de acesso ou os arquivos existentes. Não é necessário executar SQL.

## O que muda

| Ação | Comportamento anterior | Comportamento atual |
| --- | --- | --- |
| Entrar em um dispositivo novo | Baixava todas as mídias antes de incorporar a coleção | Incorpora destinos e referências de mídia; originais sob demanda |
| Sincronizar destinos inalterados | Consultava todo o JSON e os registros de fotos | Consulta IDs/revisões; evita reler os registros de fotos |
| Alteração em outro dispositivo | Relia a coleção inteira | Busca os destinos alterados e detecta exclusões pela lista de IDs |
| Original indisponível | Podia interromper a sincronização de todos os destinos | Falha isolada na galeria, com nova tentativa |
| Usar sem internet | Todas as mídias eram baixadas automaticamente | Download completo opcional no perfil |
| Retomar downloads | Dependia de completar a sincronização inteira | Preserva cada parte e busca somente as faltantes |
| Exportar backup | Dependia de originais já presentes no cache | Busca os originais faltantes e só entrega um backup completo |

A consulta de revisões ainda lê um pequeno registro por destino, pois isso permite detectar exclusões sem uma nova tabela de eventos ou migração do banco. Ela não é uma sincronização por cursor no servidor. Leituras completas são filtradas por dono e por lotes de até 40 IDs, usando os índices já definidos no esquema.

## Mídias e cache

- Miniaturas da coleção usam observação de visibilidade. Downloads de arquivos usam uma fila compartilhada de até duas transferências, com prioridade para originais solicitados pelo usuário; o player de vídeo usa streaming separadamente.
- Fotos abertas na galeria são armazenadas no cache privado da conta; vídeos remotos usam URLs temporárias no player. Para guardar o vídeo inteiro, use o download offline ou exporte um backup.
- O movimento de Live Photos é solicitado ao reproduzir. O download offline e o backup incluem imagem e movimento.
- Links assinados expiram no servidor em cinco minutos e são reutilizados no cliente por até quatro minutos. O cache de links é separado por identidade e limpo na troca de conta.
- Downloads são deduplicados enquanto estão em andamento. A gravação do cache exige a mesma conta e os mesmos caminhos da mídia, preservando legendas editadas e evitando recriar arquivos excluídos.
- Trocar de conta, mudar de coleção ou interromper o download cancela transferências pendentes. Sair da conta continua removendo o banco privado do navegador.
- Falhas temporárias de leitura têm no máximo três tentativas no total, com intervalos de 500 ms e 1 s. Falhas de permissão não são repetidas automaticamente; gravações continuam seguindo seus contratos de revisão e recuperação existentes.

## Como usar

No uso diário, basta entrar e abrir o mapa. Abra uma galeria quando quiser ver fotos ou vídeos. Antes de viajar sem conexão, escolha **Meu perfil → Baixar mídias para uso offline** e aguarde a confirmação. Se houver falhas, tente novamente: os arquivos concluídos são mantidos.

O backup continua sendo um JSON pessoal completo. A exportação pode demorar quando há arquivos apenas na nuvem. Se o servidor não permitir baixar uma mídia, a exportação informa o erro e não entrega um arquivo que omitiria essa mídia. Backups grandes continuam sujeitos à memória do navegador e ao limite de importação documentado no README.

## Verificação e limites

### Falhas ao salvar e CPU em 100%

CPU é capacidade de processamento, diferente de armazenamento. Desativar confirmação de email não libera espaço relevante nem corrige consultas lentas. Para poucos usuários, investigue consultas, bloqueios e erros antes de remover funcionalidades ou migrar o serviço. O aviso de CPU, sozinho, não prova a causa de uma gravação recusada.

As mensagens de sincronização distinguem cancelamento por demora (`57014`), falta de permissão (`42501`/HTTP 403), conflito de revisão e migração ausente. Erros sem tradução mostram apenas HTTP/código, sem expor detalhes internos do banco. A wish list aberta acompanha a falha em vez de permanecer indefinidamente em “Aguardando sincronização”. Sua falha não impede que os destinos recebidos sejam incorporados ao mapa.

Edições feitas durante uma sincronização agendam outra passagem depois dela. Uma falha sem novas edições não inicia um ciclo de repetição de gravações, para evitar carga adicional no projeto. A confirmação “Tudo salvo na sua conta” exige sucesso; alterações pendentes continuam locais.

Para diagnóstico real, correlacione o horário de uma tentativa com os logs Postgres/API e a tela Query Performance do projeto. Identifique consultas de maior tempo acumulado e bloqueios; confirme o código HTTP/SQL da gravação antes de alterar políticas ou aplicar SQL. Esses dados exigem acesso administrativo conectado e não são disponíveis pela chave pública do site.

Enquanto houver dados pendentes, exporte um backup e mantenha o navegador da conta. Sair da conta remove o cache privado desse navegador. “Carregar versão da nuvem” substitui alterações locais após confirmação; não é uma correção para uma nuvem indisponível.

Os testes de `tests/light-sync.spec.js` simulam Supabase e cobrem uma coleção de 100 fotos, sincronização por revisões, exclusões em outro dispositivo, original indisponível, repetição na galeria, vídeo e Live Photo sob demanda, backup completo, retomada, cancelamento, cache atualizado durante uma resposta atrasada e isolamento entre contas.

No cenário de 100 fotos, a sincronização inicial recebe 100 referências sem baixar nenhum original. As miniaturas visíveis são carregadas separadamente. Isso evita o fluxo anterior de aproximadamente 400 requisições de assinatura/download para os 100 originais e suas miniaturas; a quantidade atual depende de quais prévias e galerias o usuário abre.

Os testes não medem a CPU do projeto real. Para confirmar o ganho, compare CPU, disco, tráfego e consultas no painel Supabase ao entrar em outro dispositivo e ao repetir uma sincronização sem alterações. O plano gratuito continua sujeito às próprias franquias; guardar muitos vídeos pode atingir armazenamento ou tráfego mesmo com uma sincronização leve.
