const { app, BrowserWindow, Menu, dialog, net, protocol, session, shell } = require('electron');
const path = require('node:path');
const { existsSync } = require('node:fs');
const { ORIGIN, localURL, assetHandler, externalURL, documentationURL } = require('./protocol.cjs');
const { initializeUpdater } = require('./updater.cjs');
let updateController;

app.setName('Atlas Pessoal');
const requestedData = app.commandLine.getSwitchValue('user-data-dir');
if (requestedData) app.setPath('userData', path.resolve(requestedData));
protocol.registerSchemesAsPrivileged([{ scheme:'atlas', privileges:{ standard:true, secure:true, supportFetchAPI:true, corsEnabled:true, stream:true } }]);

let window;
const root = path.join(__dirname, 'app');
function openExternal(url) {
  if (externalURL(url)) shell.openExternal(url).catch(() => {});
}
function openDocumentation(url) {
  if(!documentationURL(url))return false;
  const reader=new BrowserWindow({width:800,height:850,parent:window,webPreferences:{contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true,devTools:!app.isPackaged}});
  reader.webContents.setWindowOpenHandler(({url})=>{if(!openDocumentation(url))openExternal(url);return {action:'deny'};});
  reader.webContents.on('will-navigate',(event,url)=>{if(!documentationURL(url)){event.preventDefault();openExternal(url);}});
  reader.webContents.on('will-attach-webview',event=>event.preventDefault());reader.loadURL(url).catch(()=>reader.close());return true;
}
function menu() {
  const mac = process.platform === 'darwin';
  const template = [
    ...(mac ? [{ label:'Atlas Pessoal', submenu:[{ role:'about', label:'Sobre o Atlas Pessoal' }, { type:'separator' }, { role:'services', label:'Serviços' }, { type:'separator' }, { role:'hide', label:'Ocultar Atlas Pessoal' }, { role:'hideOthers', label:'Ocultar outros' }, { role:'unhide', label:'Mostrar todos' }, { type:'separator' }, { role:'quit', label:'Sair do Atlas Pessoal' }] }] : []),
    { label:'Arquivo', submenu:[{ role:'close', label:'Fechar janela' }, ...(!mac ? [{ role:'quit', label:'Sair' }] : [])] },
    { label:'Editar', submenu:[{ role:'undo', label:'Desfazer' }, { role:'redo', label:'Refazer' }, { type:'separator' }, { role:'cut', label:'Recortar' }, { role:'copy', label:'Copiar' }, { role:'paste', label:'Colar' }, { role:'selectAll', label:'Selecionar tudo' }] },
    { label:'Visualizar', submenu:[{ role:'resetZoom', label:'Tamanho real' }, { role:'zoomIn', label:'Ampliar' }, { role:'zoomOut', label:'Reduzir' }, { type:'separator' }, { role:'togglefullscreen', label:'Tela cheia' }] },
    { label:'Janela', submenu:[{ role:'minimize', label:'Minimizar' }, { role:'zoom', label:'Zoom' }, ...(mac ? [{ role:'front', label:'Trazer todas para frente' }] : [])] },
    { role:'help', label:'Ajuda', submenu:[{ label:'Verificar atualizações…', click:() => updateController.check() }, { label:'Downloads do Atlas', click:() => openExternal('https://github.com/murilomelo22/atlas/releases') }, { label:'Abrir site do Atlas', click:() => openExternal('https://murilomelo22.github.io/atlas/') }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
function createWindow() {
  window = new BrowserWindow({
    width:1340, height:920, minWidth:820, minHeight:600, show:false,
    title:'Atlas Pessoal', backgroundColor:'#14251e', icon:path.join(__dirname, 'assets/icon.png'),
    webPreferences:{ contextIsolation:true, sandbox:true, nodeIntegration:false, webSecurity:true, devTools:!app.isPackaged },
  });
  window.once('ready-to-show', () => window.show());
  window.on('closed', () => { window = null; });
  window.webContents.setWindowOpenHandler(({ url }) => { if(!openDocumentation(url))openExternal(url); return { action:'deny' }; });
  window.webContents.on('will-navigate', (event, url) => { if(documentationURL(url)){event.preventDefault();openDocumentation(url);}else if (!localURL(url)) { event.preventDefault(); openExternal(url); } });
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.loadURL(`${ORIGIN}/`).catch(() => {
    dialog.showErrorBox('Não foi possível abrir o Atlas', 'Os arquivos do aplicativo não puderam ser carregados. Instale novamente o pacote completo. Suas memórias ficam separadas dos arquivos do aplicativo.');
  });
}
const ownsInstance = app.requestSingleInstanceLock();
if (!ownsInstance) app.quit();
else {
  app.on('second-instance', () => { if (!window) createWindow(); else { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
  app.whenReady().then(() => {
    if (!existsSync(path.join(root, 'index.html')) || !existsSync(path.join(root, 'styles.css'))) {
      dialog.showErrorBox('Atlas incompleto', 'Os arquivos do aplicativo estão incompletos. Instale novamente o pacote do Atlas.'); app.quit(); return;
    }
    protocol.handle('atlas', assetHandler(root, net));
    const allowedPermissions = new Set(['clipboard-sanitized-write', 'fullscreen']);
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => callback(localURL(contents.getURL()) && allowedPermissions.has(permission)));
    session.defaultSession.setPermissionCheckHandler((contents, permission, origin) => localURL(origin || contents?.getURL()) && allowedPermissions.has(permission));
    session.defaultSession.on('will-download', (_event, item) => {
      item.setSaveDialogOptions({ title:'Salvar arquivo do Atlas', buttonLabel:'Salvar', defaultPath:path.join(app.getPath('downloads'), path.basename(item.getFilename())) });
    });
    app.setAboutPanelOptions({ applicationName:'Atlas Pessoal', applicationVersion:app.getVersion(), version:'Desktop · Acesso antecipado', copyright:'Seu mundo, revisitado.' });
    updateController=initializeUpdater({app,dialog,config:require('./update-config.json'),updater:require('electron-updater').autoUpdater});
    menu(); createWindow();
    if(require('./update-config.json').enabled)setTimeout(()=>updateController.check({silent:true}),30000).unref();
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  });
}
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
