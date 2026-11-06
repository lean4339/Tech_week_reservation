import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const N = 2 ** 17;
let running = 0;
export class PasswordBusyError extends Error {}
export class InvalidPasswordError extends Error {}
const common = new Set([
  'passwordpassword',
  'password12345678',
  '123456789012345',
  '1234567890123456',
  'qwertyuiopasdfgh',
  'adminadminadmin',
]);

export function validPassword(password: string) {
  return (
    [...password].length >= 15 &&
    [...password].length <= 128 &&
    Buffer.byteLength(password, 'utf8') <= 512 &&
    !common.has(password.toLowerCase())
  );
}

async function derive(password: string, salt: Buffer): Promise<Buffer> {
  if (running >= 2)
    throw new PasswordBusyError('Password hashing capacity reached');
  running++;
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      scrypt(
        password,
        salt,
        64,
        { N, r: 8, p: 1, maxmem: 256 * 1024 * 1024 },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        },
      );
    });
  } finally {
    running--;
  }
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await derive(password, salt);
  return `scrypt$${N}$8$1$${salt.toString('hex')}$${hash.toString('hex')}`;
}

// Same expensive operation for unknown accounts; never a usable account credential.
const dummy = `scrypt$${N}$8$1$${'00'.repeat(16)}$${'00'.repeat(64)}`;
export async function verifyPassword(
  password: string,
  encoded: string = dummy,
) {
  const match = /^scrypt\$131072\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(
    encoded,
  );
  if (!match) throw new Error('Invalid stored password encoding');
  const actual = await derive(password, Buffer.from(match[1]!, 'hex'));
  return timingSafeEqual(actual, Buffer.from(match[2]!, 'hex'));
}
