import { passwordValidationError } from '../auth/password.js';

export async function readAdminPassword(io: {
  readHidden: (label: string) => Promise<string>;
  write: (message: string) => void;
}) {
  io.write(
    'Contraseña: entre 15 y 128 caracteres; se permiten espacios y Unicode.\n' +
      'No se exigen mayúsculas, números ni símbolos. No se aceptan contraseñas comunes bloqueadas.\n' +
      'La entrada está oculta. Los espacios cuentan y la confirmación debe coincidir exactamente.\n',
  );
  for (;;) {
    const password = await io.readHidden('Contraseña (oculta): ');
    const error = passwordValidationError(password);
    if (error) {
      io.write(`${error} Volvé a intentarlo.\n`);
      continue;
    }
    const confirmation = await io.readHidden(
      'Confirmá la contraseña (oculta): ',
    );
    if (password !== confirmation) {
      io.write(
        'Las contraseñas no coinciden. Volvé a ingresar ambas; se conserva el email.\n',
      );
      continue;
    }
    return password;
  }
}
