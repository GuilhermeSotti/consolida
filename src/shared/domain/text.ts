/**
 * Character-level helpers shared by input validation and file-name sanitisation.
 *
 * Implemented with code-point checks instead of regular expressions that embed control
 * characters, which are easy to get wrong and are rejected by the linter (no-control-regex).
 */

/** C0 control characters (U+0000–U+001F) and DEL (U+007F). */
export function isControlCharacter(char: string): boolean {
  const code = char.codePointAt(0);
  return code !== undefined && (code <= 0x1f || code === 0x7f);
}

const TEXT_LAYOUT_CONTROLS = new Set(['\t', '\n', '\r']);

/** True when the text contains control characters other than tab, line feed and carriage return. */
export function hasDisallowedControlCharacters(text: string): boolean {
  for (const char of text) {
    if (isControlCharacter(char) && !TEXT_LAYOUT_CONTROLS.has(char)) return true;
  }
  return false;
}
