# Ativar contas, perfis e viagens na nuvem

O código está pronto para o Supabase. A configuração inicial tem URL e chave pública vazias: nesse estado, o site continua funcionando como atlas local e informa que o login ainda não foi ativado. Um projeto real precisa ser criado e configurado antes de contas funcionarem para seus visitantes.

## 1. Criar o projeto

1. Abra <https://supabase.com/dashboard> e entre na sua conta.
2. Escolha **New project**, selecione sua organização e dê um nome como `atlas-pessoal`.
3. Escolha uma região próxima dos seus usuários e uma senha forte para o banco. Guarde essa senha no seu gerenciador de senhas; ela não será colocada no site.
4. Confira o plano, seus limites e eventuais custos antes de criar. Aguarde o projeto terminar de iniciar.

## 2. Instalar o banco e as permissões

1. No projeto, abra **SQL Editor → New query**.
2. No GitHub, abra `supabase/schema.sql` e copie o conteúdo do arquivo pelo botão de copiar ou pela visualização **Raw**. Copie o SQL, não a página HTML do GitHub.
3. Cole no SQL Editor e clique em **Run**.
4. Confira que a execução terminou sem erros. A operação cria `profiles`, `destinations`, `photos`, o perfil automático para novos cadastros, duas funções de gravação com controle de versão e os buckets privados `atlas-media` e `atlas-avatars`.
5. Em uma nova consulta, copie e execute `supabase/verify-policies.sql`. Ele cria dados de teste em uma transação e os remove com `ROLLBACK`. O resultado esperado é `PASS: ownership, private/public profiles, posts, photos and revision conflicts`.

Se o script de verificação falhar, não abra o serviço aos usuários: confira o erro e as políticas existentes no projeto. Os nomes das políticas do Atlas começam com `atlas_`. Use preferencialmente um projeto novo; outras políticas permissivas já existentes podem conceder acesso adicional, pois as permissões RLS são combinadas.

Os scripts SQL foram preparados neste ambiente, mas não foram executados contra um Supabase real, pois nenhum projeto estava conectado. Os testes automáticos HTTP usam um servidor simulado e não provam a aplicação das políticas no seu banco. A etapa acima verifica essas regras no PostgreSQL real.

## 3. Configurar e-mail e redirecionamentos

1. Abra **Authentication → Providers** (ou a seção de métodos de login) e habilite **Email** com senha.
2. Mantenha a confirmação de e-mail habilitada. Em **Authentication → URL Configuration**, use como **Site URL**:

   ```text
   https://murilomelo22.github.io/atlas/
   ```

3. Adicione esse mesmo endereço, com a barra final, à lista de **Redirect URLs** permitidos. Para testes locais reais, adicione separadamente `http://localhost:8000/` ou a origem local que estiver usando. Não use uma lista indiscriminada de redirecionamentos.
4. Confira os modelos de confirmação e recuperação: devem usar o link de confirmação gerado pelo Supabase (`{{ .ConfirmationURL }}`), que redireciona para o site configurado. O frontend aceita a sessão no fragmento da URL, valida o token e remove os tokens do endereço antes de navegar.
5. Para usuários externos, configure um provedor SMTP em **Authentication → SMTP Settings**. O envio padrão do Supabase é limitado e pode aceitar somente destinatários autorizados da sua organização. Siga as instruções do painel e valide envio e recebimento antes de anunciar cadastro público.
6. Configure a política de senhas (ao menos 8 caracteres), os limites de envio e, quando necessário, as proteções de abuso disponíveis no painel. Não habilite uma exigência de CAPTCHA sem integrar também o desafio à interface; esta versão não envia um token de CAPTCHA.

Os rótulos do painel podem mudar; procure as seções indicadas de autenticação, URLs e SMTP dentro do mesmo projeto.

## 4. Conectar o site

1. Na seção **Connect** ou **Project Settings → API / API Keys**, copie a **Project URL**, como `https://SEU-PROJETO.supabase.co`.
2. Copie a chave **publishable** (`sb_publishable_…`). Em projetos antigos, a chave pública **anon** também é aceita.
3. No GitHub, abra `config.js` → botão de editar. Preencha somente os dois campos:

   ```js
   export const supabaseConfig = {
     url: 'https://SEU-PROJETO.supabase.co',
     publishableKey: 'SUA_CHAVE_PUBLICA_PUBLISHABLE_OU_ANON',
   };
   ```

4. Faça o commit na `main`, aguarde o GitHub Pages publicar e recarregue o site com **Ctrl + Shift + R**.

A URL e a chave publishable/anon são configurações públicas, projetadas para o navegador. A proteção vem da autenticação e das políticas RLS. **Nunca coloque `service_role`, `sb_secret`, senha do banco ou token administrativo no GitHub, no JavaScript ou na conversa.** Se uma chave administrativa foi publicada por engano, revogue-a no Supabase e substitua-a; removê-la de um commit não apaga o histórico.

Não é necessário adicionar variáveis ao ambiente do Codex: este site é estático e lê `config.js`, não variáveis de processo. Se quiser que eu conclua a configuração do frontend depois de criar o projeto, informe somente a Project URL e a chave pública. A instalação do SQL e a configuração do provedor de e-mail continuam necessárias no seu painel.

## 5. Conferir o funcionamento real

1. Cadastre uma primeira conta no site e confirme o e-mail recebido. Entre com sua senha.
2. Abra **Meu perfil**, escolha um nome de usuário exclusivo, escreva uma bio e salve. O endereço público será `https://murilomelo22.github.io/atlas/#/perfil/SEU_USUARIO`.
3. Crie uma viagem com uma foto. Deixe **Somente eu** e espere aparecer **Tudo salvo na sua conta**.
4. Abra uma janela anônima: a viagem privada não deve aparecer no perfil público, e seus objetos privados não devem abrir por uma URL de objeto público.
5. Edite a viagem e escolha **Todos no meu perfil público**. Salve, espere sincronizar e confira o perfil na janela anônima: agora a postagem e sua foto devem aparecer.
6. Cadastre uma segunda conta em outro perfil do navegador. Ela pode ver postagens públicas, mas não deve editar, excluir ou acessar viagens privadas da primeira conta. O script de políticas também exercita essas restrições diretamente no banco.
7. Entre na primeira conta em outro dispositivo e confira se a viagem reaparece. Teste recuperação de senha pelo e-mail antes de disponibilizar o serviço a outras pessoas.
8. Volte ao navegador que contém suas viagens antigas e use **Meu perfil → Enviar meus dados locais para minha conta**. Os exemplos não editados são ignorados; as viagens migradas começam privadas. A cópia local original é mantida.

## Comportamento de sincronização e privacidade

- Cada conta tem uma coleção local própria, separada do atlas sem login. Entrar não migra nem publica registros automaticamente.
- Gravações de viagens e exclusões ficam em fila persistente e são enviadas automaticamente após editar ou quando a conexão retorna. **Sincronizar agora** também busca a versão atual da nuvem. Não há atualizações em tempo real ou sincronização contínua entre dispositivos inativos: use o botão ou recarregue.
- Falhas de rede mantêm as alterações pendentes. Fotos são enviadas antes de confirmar os metadados; as permissões públicas passam a valer só depois da transação de metadados.
- Uma revisão identifica cada gravação. Mudanças concorrentes não sobrescrevem silenciosamente a viagem remota. Em conflito, exporte um backup para preservar a versão local e use **Carregar versão da nuvem**, que pede confirmação para descartar mudanças ainda não enviadas desta conta. Você pode importar deliberadamente o backup após carregar a revisão atual; viagens importadas ficam privadas.
- Ao sair, removemos a sessão e o cache local da conta; o atlas original sem login continua intacto. Se houver alterações não enviadas, a saída pede confirmação. Exporte um backup ou sincronize antes de confirmar. Um logout offline não consegue revogar a sessão remota naquele momento, mas remove a sessão neste navegador.
- Sessões (tokens de acesso e renovação) ficam no IndexedDB separado `atlas-auth`; senhas nunca são armazenadas pela aplicação. Uma página comprometida poderia ler tokens do navegador, portanto mantenha o código e a origem de hospedagem sob seu controle. O service worker só armazena arquivos locais da interface, nunca respostas privadas do Supabase.
- Alterações de perfil precisam de conexão. Nome, bio, avatar e usuário são públicos quando **Permitir que outras pessoas encontrem meu perfil** está marcado; e-mails não ficam na tabela de perfis. Perfis privados ocultam também suas postagens públicas para visitantes.
- Os buckets permanecem privados. Fotos públicas são autorizadas por uma política que confere o destino público e o perfil público; fotos privadas exigem o dono. URLs assinadas duram até 5 minutos. Uma URL emitida antes de tornar algo privado pode continuar válida até expirar; quem já baixou uma foto pública mantém sua cópia.
- Arquivos de fotos usam caminhos exclusivos. Objetos não mais usados são removidos após a gravação bem-sucedida, quando possível. Falhas de rede ambíguas e uploads interrompidos podem deixar objetos órfãos privados; revise-os no Storage conforme o crescimento do projeto. Não exclua objetos apenas por não aparecerem em uma tentativa de sincronização: uma gravação pode estar em andamento.
- Likes, seguidores, comentários, exclusão de conta pela interface, administração/moderação e busca por nome completo ainda não foram implementados. A busca desta versão usa nome de usuário. Antes de abrir uma comunidade grande, defina regras de uso, moderação, limites de armazenamento e operação do serviço.

## Verificação de desenvolvimento

Execute `npm test` na raiz do repositório. A suíte original valida o atlas local; `tests/social.spec.js` valida os novos fluxos contra endpoints Supabase simulados, incluindo login, confirmação, recuperação, perfil, fotos, privacidade, migração, contas distintas, reconexão, conflito e renovação de sessão. O teste do SQL real fica em `supabase/verify-policies.sql`, para rodar na instância que você configurar.
