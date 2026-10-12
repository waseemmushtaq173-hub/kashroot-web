/**
 * Passwords people guess first. A password on this list (ignoring case, and
 * ignoring numbers or ! added at the end) is refused at sign-up and reset.
 */
const COMMON = new Set([
  'password', 'passw0rd', 'qwerty', 'qwertyuiop', 'asdfgh', 'abcdef', 'abc', 'abcd', 'iloveyou', 'welcome', 'admin', 'administrator',
  'letmein', 'monkey', 'dragon', 'sunshine', 'princess', 'football', 'cricket', 'india', 'bharat', 'hindustan', 'kashmir', 'srinagar',
  'jammu', 'apple', 'farmer', 'kisan', 'kissan', 'allah', 'bismillah', 'pakistan', 'secret', 'login', 'user', 'test', 'changeme',
  'master', 'shadow', 'superman', 'batman', 'mobile', 'computer', 'internet', 'google', 'facebook', 'whatsapp', 'samsung', 'nokia',
]);

/** The words in a password without digits/symbols at the end ("India@123" → "india"). */
const core = (pw: string) => pw.toLowerCase().replace(/[\d!@#$%^&*._-]+$/, '').replace(/^[\d!@#$%^&*._-]+/, '');

/** An error message, or null when the password is fine. */
export function weakPassword(pw: string, email = ''): string | null {
  if (pw.length < 8) return 'At least 8 characters';
  if (/^(.)\1+$/.test(pw) || /^(0123456789|1234567890|12345678|87654321)/.test(pw)) return 'Too easy to guess';
  if (COMMON.has(core(pw))) return 'This password is one of the first ones attackers try — choose another';
  const name = email.split('@')[0]?.toLowerCase().replace(/[^a-z]/g, '') ?? '';
  if (name.length >= 4 && pw.toLowerCase().includes(name)) return 'Do not use your email name in the password';
  return null;
}
