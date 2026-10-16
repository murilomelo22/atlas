import {readFile,writeFile} from 'node:fs/promises';
import {createPublicKey} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export function distributionConfig(env) {
 for(const key of ['CSC_LINK','CSC_KEY_PASSWORD','APPLE_ID','APPLE_APP_SPECIFIC_PASSWORD','APPLE_TEAM_ID','APPLE_SIGNING_IDENTITY','ATLAS_UPDATE_PUBLIC_KEY','ATLAS_UPDATE_PRIVATE_KEY','ATLAS_UPDATE_FEED_URL'])if(!env[key])throw new Error(`Configure o segredo ${key}.`);
 if(!env.APPLE_SIGNING_IDENTITY.startsWith('Developer ID Application:'))throw new Error('Exige Developer ID Application.');
 if(!/^[A-Z0-9]{10}$/.test(env.APPLE_TEAM_ID))throw new Error('Team ID inválido.');
 const key=createPublicKey(env.ATLAS_UPDATE_PUBLIC_KEY),privatePublic=createPublicKey(env.ATLAS_UPDATE_PRIVATE_KEY);
 if(key.asymmetricKeyType!=='ed25519'||!key.export({format:'der',type:'spki'}).equals(privatePublic.export({format:'der',type:'spki'})))throw new Error('Par de chaves de atualização não confere.');
 const url=new URL(env.ATLAS_UPDATE_FEED_URL);if(url.protocol!=='https:'||url.username||url.password)throw new Error('URL de atualização deve usar HTTPS.');
 return {mac:{identity:env.APPLE_SIGNING_IDENTITY,hardenedRuntime:true,notarize:false,entitlements:'entitlements.mac.plist',entitlementsInherit:'entitlements.mac.plist',target:[{target:'dmg',arch:['universal']},{target:'zip',arch:['universal']}],publish:null}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
 const config=distributionConfig(process.env);
 await writeFile('desktop/distribution-config.json',JSON.stringify(config));
 await writeFile('desktop/update-config.json',JSON.stringify({enabled:true,feedURL:process.env.ATLAS_UPDATE_FEED_URL,publicKey:process.env.ATLAS_UPDATE_PUBLIC_KEY}));
 const pkg=JSON.parse(await readFile('desktop/package.json','utf8'));
 if(!/^\d+\.\d+\.\d+$/.test(pkg.version))throw new Error('Versão release inválida.');
 console.log(`Distribuição ${pkg.version} preparada; segredos não foram gravados no bundle.`);
}
