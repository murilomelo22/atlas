const {verifyFeed,serveVerifiedManifest}=require('./signed-feed.cjs');
function initializeUpdater({app,dialog,config,updater,fetcher=fetch}) {
 updater.on?.('error',()=>{});
 let busy=false;
 async function check({silent=false}={}) {
  if(busy)return;busy=true;let local;
  try {
   if(!config.enabled||!app.isPackaged||process.platform!=='darwin') {
    if(!silent)await dialog.showMessageBox({type:'info',message:'Atualização automática ainda não está habilitada nesta distribuição.',detail:'A primeira instalação após 0.1.1 é manual. Seus dados ficam separados do aplicativo.'});return;
   }
   const url=new URL(config.feedURL);if(url.protocol!=='https:'||url.username||url.password)throw new Error('Feed inseguro.');
   const r=await fetcher(url,{signal:AbortSignal.timeout(15000),cache:'no-store'});
   if(!r.ok||Number(r.headers.get('content-length'))>100000)throw new Error('Feed indisponível.');
   const raw=await r.text();if(Buffer.byteLength(raw)>100000)throw new Error('Feed excede o limite.');
   const manifest=verifyFeed(JSON.parse(raw),config.publicKey,app.getVersion());local=await serveVerifiedManifest(manifest);
   updater.autoDownload=false;updater.autoInstallOnAppQuit=false;updater.allowDowngrade=false;updater.allowPrerelease=false;updater.logger=null;
   updater.setFeedURL({provider:'generic',url:local.url});const result=await updater.checkForUpdates();
   if(result?.updateInfo?.version!==manifest.version)throw new Error('Versão divergente.');
   const choice=await dialog.showMessageBox({type:'info',buttons:['Depois','Baixar atualização'],defaultId:0,cancelId:0,message:`Atlas ${manifest.version} disponível`,detail:'O download e a assinatura Apple são verificados. Salve alterações abertas antes de reiniciar.'});
   if(choice.response!==1)return;await updater.downloadUpdate();
   const install=await dialog.showMessageBox({type:'question',buttons:['Depois','Reiniciar e instalar'],defaultId:0,cancelId:0,message:'Atualização pronta',detail:'Memórias e conta ficam preservadas. Feche formulários com alterações antes de continuar.'});
   if(install.response===1)updater.quitAndInstall(false,true);
  }catch{if(!silent)await dialog.showMessageBox({type:'warning',message:'Não foi possível verificar uma atualização segura.',detail:'O aplicativo atual e seus dados foram preservados. Tente novamente mais tarde.'});}
  finally{local?.close();busy=false;}
 }
 return {check};
}
module.exports={initializeUpdater};
