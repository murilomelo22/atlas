import {readFile,writeFile} from 'node:fs/promises';
import {sign,createHash} from 'node:crypto';
const [version,zipPath,artifactURL,out]=process.argv.slice(2);
if(!process.env.ATLAS_UPDATE_PRIVATE_KEY||!version||!zipPath||!artifactURL||!out)throw new Error('Forneça versão, ZIP, URL, saída e ATLAS_UPDATE_PRIVATE_KEY no ambiente do CI.');
const artifact=await readFile(zipPath),payload=JSON.stringify({version,files:[{url:artifactURL,sha512:createHash('sha512').update(artifact).digest('base64'),size:artifact.length}]});
await writeFile(out,JSON.stringify({payload,signature:sign(null,Buffer.from(payload),process.env.ATLAS_UPDATE_PRIVATE_KEY).toString('base64')}));
