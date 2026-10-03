import { ONLINE, SERVER } from './config.js';

/** Çevrim içi özellikler açık mı (config.js → ONLINE). */
export const onlineEnabled = () => ONLINE.web;

/**
 * WebSocket adresi. Statik sitede (izpesinde.josephuz.com) config.js → SERVER; sayfa sunucunun kendisinden açıldıysa
 * (localhost, IP adresi, doğrudan sunucu adresi) aynı adres.
 */
export function serverUrl() {
  const h = location.hostname, self = h === SERVER || h === 'localhost' || /^[\d.]+$|^\[/.test(h);
  return self ? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}` : 'wss://' + SERVER;
}
