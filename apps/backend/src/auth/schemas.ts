export const emailPattern =
  "^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$";
export const credentialsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['email', 'password'],
  properties: {
    email: {
      type: 'string',
      minLength: 3,
      maxLength: 254,
      pattern: emailPattern,
    },
    password: { type: 'string', minLength: 1, maxLength: 128 },
  },
} as const;
export type Credentials = { email: string; password: string };

export const logoutSchema = {
  type: 'object',
  additionalProperties: false,
} as const;
