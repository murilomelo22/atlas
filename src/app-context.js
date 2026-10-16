// Desktop links must remain usable by friends and by email clients that do
// not have the application installed. Web installations retain their own base.
export function publicAppBase() {
  return location.protocol === 'atlas:' && location.hostname === 'app'
    ? new URL('https://murilomelo22.github.io/atlas/')
    : new URL('./', location.href);
}
