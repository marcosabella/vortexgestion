const hex = (bytes: ArrayBuffer | Uint8Array) => Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
export const secreto = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export const hashTerminal = async (token: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
export async function hashPin(pin: string, salt: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 210000 }, key, 256));
}
