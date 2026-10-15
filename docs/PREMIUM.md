# Pôster premium — fase de teste

Na versão 21, **Exportar pôster** fica na navegação e em **Meu perfil → Premium**. A conta precisa ter uma habilitação ativa em `public.premium_accounts`. Esta fase não tem checkout, assinatura ou cobrança.

O usuário escolhe título, tema claro/escuro e A4/A3 em paisagem. PNG inclui metadados de 300 dpi; SVG contém dimensões em milímetros e geometria vetorial, adequado para ampliar. O arquivo usa cartografia Natural Earth local, países visitados e pontos das memórias da coleção pessoal inteira. Não inclui fotos, notas, moradias, exemplos ou visitas exclusivamente futuras. Os filtros da lista não recortam o pôster. Imprima a 100%, sem ajustar à página.

## Instalação e administração

Em uma instalação própria, execute `supabase/premium.sql` após `schema.sql`. O script pode ser repetido. Ele cria uma tabela separada dos perfis editáveis, habilita RLS e concede aos usuários apenas leitura da própria habilitação ativa. Usuários e visitantes não podem inserir, alterar ou excluir habilitações. Não há chave administrativa no navegador.

Para liberar uma conta pelo SQL Editor administrativo, use o nome de usuário exato:

```sql
insert into public.premium_accounts(user_id, source)
select id, 'test' from public.profiles where username = 'nome_de_usuario'
on conflict (user_id) do update set source = 'test', expires_at = null;
```

Sem `expires_at`, o teste continua até revogação administrativa. Para revogar:

```sql
delete from public.premium_accounts
where user_id = (select id from public.profiles where username = 'nome_de_usuario');
```

No projeto Supabase conectado ao Atlas, a instalação foi aplicada e `muriloatlas` foi habilitada para teste em 15/10/2026. A consulta posterior confirmou `source = 'test'`, acesso ativo e nenhuma expiração. Isso não cria assinatura paga.

## Comportamento e limites

A interface verifica o acesso na nuvem ao abrir e imediatamente antes de gerar o arquivo; falha de conexão não libera acesso. A troca de conta e a abertura de perfil público fecham a prévia e cancelam o download em andamento. Renovar a sessão da mesma conta preserva a tela. Não há armazenamento persistente do status premium.

A renderização ocorre no navegador e é uma restrição de interface adequada ao teste. O código de geração de imagens é público e pode ser chamado fora da interface; esta implementação não constitui proteção comercial contra modificação do cliente. Uma futura versão paga que exija essa garantia precisa gerar/entregar arquivos por um serviço autenticado com verificação de entitlement no servidor.

O PNG A3 usa cerca de 70 MB de pixels durante a geração; em aparelhos com pouca memória, escolha A4 ou SVG. Os arquivos não dependem de tiles de terceiros nem acessam mídias na nuvem. SVG usa fontes de sistema, então a tipografia pode variar entre aplicativos de impressão. A cartografia tem a mesma fonte 1:50 milhões do Atlas; aumentar a resolução do arquivo não acrescenta detalhes geográficos ausentes na fonte.

## Verificação

```bash
npm test -- tests/poster.spec.js
npm run test:premium-db
```

Os testes de navegador verificam desktop/celular, restrição de acesso, expiração, revogação, falha de conexão, perfil público, título escapado, tamanho físico SVG, resolução e densidade PNG e limpeza ao sair. O teste PostgreSQL em memória executa a RLS real, incluindo bloqueio de autoativação, isolamento entre contas e instalação repetida.

A inspeção do Supabase após a instalação confirmou RLS habilitada e ausência de permissões de escrita para `authenticated` e leitura para `anon`. O advisor não apontou a tabela premium. Ele listou avisos das funções de trips/wish list já existentes ([funções públicas](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [funções autenticadas](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)) e [proteção de senhas vazadas desativada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Esses itens não foram alterados por esta feature.
