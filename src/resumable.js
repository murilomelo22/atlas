// TUS 1.0.0; no credential is persisted. Cache contains only a scoped opaque upload URL.
export async function resumableUpload({ endpoint, bucket, path, blob, token, cache, fetcher = fetch, valid = () => true }) {
  const base = new URL(endpoint), key = `${bucket}:${path}:${blob.size}`, chunkSize = 6 * 1024 * 1024;
  const headers = async extra => ({ 'Tus-Resumable':'1.0.0', Authorization:`Bearer ${await token()}`, ...extra });
  const allowed = value => { const u=new URL(value,base); if(u.origin!==base.origin || !u.pathname.startsWith(base.pathname+'/')) throw new Error('Destino de upload inválido.');return u.href; };
  const verify = () => { if(!valid()) throw new DOMException('Conta alterada.','AbortError'); };
  let uploadURL = await cache.get(key), offset=0;
  for(let attempt=0;attempt<3;attempt++) {
    try {
      verify();
      if(uploadURL) {
        uploadURL=allowed(uploadURL);
        const head=await fetcher(uploadURL,{method:'HEAD',headers:await headers(),signal:AbortSignal.timeout(20000)});
        if([404,410].includes(head.status)) {uploadURL=null;await cache.delete(key);}
        else {if(!head.ok) throw new Error('Não foi possível retomar o upload.');offset=Number(head.headers.get('Upload-Offset'));if(!Number.isSafeInteger(offset)||offset<0||offset>blob.size)throw new Error('Posição de upload inválida.');}
      }
      if(!uploadURL) {
        const metadata=Object.entries({bucketName:bucket,objectName:path,contentType:blob.type,cacheControl:'3600'}).map(([k,v])=>`${k} ${btoa(v)}`).join(',');
        const create=await fetcher(base.href,{method:'POST',headers:await headers({'Upload-Length':String(blob.size),'Upload-Metadata':metadata}),signal:AbortSignal.timeout(20000)});
        if(!create.ok) throw new Error('O servidor recusou o upload. Confira espaço e limite de mídia.');
        uploadURL=allowed(create.headers.get('Location'));await cache.set(key,uploadURL);offset=0;
      }
      while(offset<blob.size) {
        verify();const end=Math.min(offset+chunkSize,blob.size);
        const response=await fetcher(uploadURL,{method:'PATCH',headers:await headers({'Content-Type':'application/offset+octet-stream','Upload-Offset':String(offset)}),body:blob.slice(offset,end),signal:AbortSignal.timeout(120000)});
        if(response.status!==204||Number(response.headers.get('Upload-Offset'))!==end)throw new Error('Upload interrompido; será retomado sem perder as partes enviadas.');
        offset=end;
      }
      verify();await cache.delete(key);return;
    } catch(error) {if(error.name==='AbortError'||!valid()||attempt===2)throw error;}
  }
}
