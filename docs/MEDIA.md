# Fotos, vídeos e Live Photos

Os destinos pessoais e a galeria das trips aceitam fotos, vídeos e Live Photos com legenda. Vídeos têm controles, som e reprodução em tela cheia conforme o navegador; começam pausados. As prévias e capas continuam imagens. Fechar ou mudar de mídia interrompe a reprodução. O vídeo original, incluindo áudio, é preservado; não há compressão ou conversão de vídeo no site.

## Ativar na sua conta

1. Abra seu projeto no Supabase → **SQL Editor → New query**.
2. Se você já executou `schema.sql`, `trips.sql` e `collaboration.sql`, **não precisa executá-los novamente**. Execute somente [`supabase/media.sql`](../supabase/media.sql) inteiro. Em uma instalação nova, execute aqueles três primeiro, nessa ordem, e `media.sql` por último. Reaplicar scripts antigos depois pode reduzir o limite do bucket ou substituir as funções desta atualização; nesse caso execute `media.sql` novamente.
3. Execute [`supabase/verify-media.sql`](../supabase/verify-media.sql) em outra consulta. O resultado deve ser `PASS: mídias, privacidade e permissões`. As contas e objetos de teste são desfeitos por `ROLLBACK`.
4. Atualize o [site](https://murilomelo22.github.io/atlas/). Abra um destino → **Editar destino → Escolha fotos e vídeos** → selecione os arquivos → **Salvar destino**. Aguarde **Tudo salvo na sua conta**. Em uma trip salva, use **Adicionar foto, vídeo ou Live Photo → Enviar mídia**; cada envio cria uma mídia, incluindo um par de Live Photo.

A atualização preserva as fotos existentes e mantém os buckets privados. Sem a migração, fotos continuam funcionando e novas mídias pessoais ficam neste dispositivo, com aviso para executar o SQL; a sincronização pode ser retomada em **Meu perfil → Sincronizar agora** depois da ativação. O aviso não significa que o vídeo já foi enviado. Mídias de grupos só são confirmadas depois do envio e registro na nuvem.

## Como enviar uma Live Photo

Live Photo da Apple é uma foto acompanhada por um vídeo curto. O seletor do navegador no iPhone pode fornecer **apenas a foto**, sem o movimento. O site não consegue recuperar um vídeo que o sistema não entregou.

- Se tiver os dois arquivos, selecione-os **juntos**, com o mesmo nome antes da extensão: `IMG_2487.JPG` + `IMG_2487.MOV` (ou `.MP4`/`.WEBM`). Eles viram uma única **Live Photo** na galeria. Abra e toque **Reproduzir Live Photo**; **Ver foto** volta à imagem. O pareamento só ocorre quando há exatamente uma imagem e um vídeo com aquele nome no mesmo envio.
- No iPhone, abra a Live Photo no app **Fotos**, toque **••• → Salvar como Vídeo**. Depois envie o vídeo criado ao Atlas. Dependendo da versão do iOS, a ação pode aparecer no menu de compartilhamento. Para criar o par, exporte também a foto e dê aos dois arquivos o mesmo nome no app Arquivos antes de selecioná-los juntos. Também é possível enviar apenas o vídeo.
- HEIC/HEIF e MOV/HEVC dependem do suporte do navegador. Se houver erro, exporte a foto como **JPEG** e o vídeo como **MP4 com H.264**. MP4/WebM também dependem dos codecs disponíveis no dispositivo. O site valida se consegue decodificar o arquivo naquele navegador antes de salvá-lo, mas não garante que outro dispositivo tenha os mesmos codecs. Arquivos `.livp`/ZIP e Live Photos recebidas como foto estática não são convertidos automaticamente.

## Limites, backup e privacidade

- Até **40 MB por foto original** e **50 MB por vídeo**, incluindo o movimento de Live Photo. Fotos são reduzidas a 1600 px e vídeos mantêm o tamanho original. Até **100 mídias por destino/trip**; um par de Live Photo conta como uma. O limite total depende do espaço do navegador e do plano de Storage do seu Supabase.
- **Exportar backup** inclui fotos, vídeos e movimento dos destinos pessoais em JSON versão 2. A importação aceita versões 1 e 2 e valida as mídias antes de gravar. O limite de importação continua **250 MB**; vídeos aumentam o JSON em aproximadamente um terço. O backup pessoal não inclui a galeria dos grupos; exportar roteiro preserva as paradas e descrições, sem arquivos de mídia.
- Mídia pessoal segue a visibilidade da postagem e do perfil. A galeria de grupo segue a privacidade da trip. A permissão **Adicionar fotos e vídeos / Live Photos** vale para os três tipos, e exige convite aceito. Remover uma mídia própria também tenta remover seus arquivos; o criador pode remover a mídia de outro colaborador da galeria, mas não apagar os arquivos privados de outra conta. Objetos órfãos podem permanecer no Storage, como nas fotos anteriores.
- URLs assinadas duram até cinco minutos. Um link já emitido pode funcionar até expirar depois de uma mudança de privacidade; reabrir a galeria solicita links novos. Não há link público permanente de um arquivo privado. Sair da conta limpa a cópia local privada e interrompe a reprodução. Vídeos pessoais são baixados com a coleção para uso offline; vídeos de grupo carregam ao abrir a mídia.

Os testes de navegador usam clipes sintéticos H.264/AAC (MP4/MOV) e VP9/Opus (WebM), gerados com FFmpeg já instalado. Verificam reprodução real, pareamento, backup, nuvem simulada, permissões, privacidade e recuperação de envio; não substituem a execução dos scripts SQL no projeto real. Nenhuma dependência foi instalada para esta funcionalidade.
