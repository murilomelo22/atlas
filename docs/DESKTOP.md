# Atlas Pessoal 0.1.1 para Mac

O aplicativo inclui Electron e todos os arquivos do Atlas. A janela abre pelo protocolo interno `atlas://app/`, sem servidor HTTP, Python, Safari ou Terminal. O instalador universal atende Macs Apple Silicon e Intel.

## Instalar e abrir

1. Baixe `Atlas-Pessoal-0.1.1-universal.dmg` na versão desktop publicada.
2. Abra o DMG e arraste **Atlas Pessoal** para **Aplicativos**.
3. Ejete o DMG e abra o Atlas pela pasta Aplicativos.
4. Para manter no Dock, clique com o botão direito no ícone → **Opções → Manter no Dock**.

Esta versão de acesso antecipado tem assinatura local ad hoc, sem certificado Developer ID nem notarização Apple. Se o macOS bloquear a primeira abertura, confira a procedência do download e use **Ajustes do Sistema → Privacidade e Segurança → Abrir Mesmo Assim**, quando essa opção estiver disponível. Não é necessário desativar as proteções do sistema.

## Memórias e conta

O aplicativo mantém seu próprio armazenamento persistente na pasta de dados do Atlas Pessoal do usuário. Atualizar os arquivos do aplicativo não remove esse armazenamento. Dados do Safari, do site e da PWA local não migram automaticamente: entre na mesma conta para sincronizar ou use **Exportar** na versão anterior e **Importar** no aplicativo.

Login, confirmação de cadastro, recuperação de senha e sincronização exigem internet. Confirmação e recuperação abrem pelo endereço público do Atlas já configurado; depois de confirmar o email ou alterar a senha, volte ao aplicativo e entre na conta. Links compartilhados usam o endereço público, acessível mesmo por pessoas sem o aplicativo instalado.

O mapa local e os registros disponíveis no aparelho funcionam sem servidor e sem internet. A busca de lugares, mapas de ruas e mídias ainda não baixadas precisam de conexão. Use **Meu perfil → Baixar mídias para uso offline** antes de viajar. Exporte backups periodicamente.

## Compilar e testar

```bash
npm ci
npm --prefix desktop ci
npm run desktop:prepare
npm --prefix desktop start
npm run test:desktop
```

Para gerar o DMG e o ZIP universal em macOS:

```bash
npm run desktop:mac
```

Os arquivos ficam em `desktop/release/`. A geração do aplicativo ocorre em macOS no workflow `Atlas Desktop para Mac`, na branch `desktop-v0.1.1`. O fluxo instala dependências fixadas, testa o aplicativo, gera o DMG/ZIP, verifica assinatura e integridade e abre novamente o executável empacotado antes de publicar os arquivos em uma versão de acesso antecipado.

O processo principal mantém o renderer isolado, sem Node e com sandbox. O protocolo interno limita arquivos ao pacote, define CSP e não permite navegação remota na janela. Links HTTP/HTTPS explícitos abrem no navegador padrão; outros protocolos e permissões não utilizadas são recusados. Não há serviço HTTP em localhost, migração de banco ou chave administrativa nova.
