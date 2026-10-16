export function createAdmin({url,key}) {
 async function request(path,{method='GET',body}={}) {
  const r=await fetch(`${url}${path}`,{method,headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  if(r.status===404&&method==='DELETE')return null;
  if(!r.ok)throw new Error('Operação administrativa não concluída.');
  const text=await r.text();return text?JSON.parse(text):null;
 }
 const encode=path=>path.split('/').map(encodeURIComponent).join('/');
 return {
  ban:id=>request(`/auth/v1/admin/users/${encodeURIComponent(id)}`,{method:'PUT',body:{ban_duration:'876000h'}}),
  deleteUser:id=>request(`/auth/v1/admin/users/${encodeURIComponent(id)}`,{method:'DELETE'}),
  remove:(bucket,paths)=>request(`/storage/v1/object/${encodeURIComponent(bucket)}`,{method:'DELETE',body:{prefixes:paths}}),
  signedURL:async(bucket,path,seconds)=>{const data=await request(`/storage/v1/object/sign/${encodeURIComponent(bucket)}/${encode(path)}`,{method:'POST',body:{expiresIn:seconds}});return `${url}/storage/v1${data.signedURL||data.signedUrl}`;},
 };
}
