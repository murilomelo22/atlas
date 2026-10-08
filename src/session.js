// Sessions are separate from travel data; passwords are never persisted.
let database;
function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function db() {
  if (!database) {
    const request = indexedDB.open('atlas-auth', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('session');
    database = await requestValue(request);
  }
  return database;
}
export async function readSession() {
  return requestValue((await db()).transaction('session').objectStore('session').get('current'));
}
export async function writeSession(session) {
  const transaction = (await db()).transaction('session', 'readwrite');
  const done = new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onabort = transaction.onerror = () => reject(transaction.error);
  });
  if (session) transaction.objectStore('session').put(session, 'current');
  else transaction.objectStore('session').delete('current');
  await done;
}
