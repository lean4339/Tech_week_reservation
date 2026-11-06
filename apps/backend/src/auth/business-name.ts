export class InvalidBusinessNameError extends Error {}

export function normalizeBusinessName(value: string) {
  const name = value.trim();
  if (
    [...name].length < 2 ||
    [...name].length > 120 ||
    [...name].some(
      (character) =>
        character.codePointAt(0)! < 32 || character.codePointAt(0) === 127,
    )
  )
    throw new InvalidBusinessNameError();
  return name;
}
