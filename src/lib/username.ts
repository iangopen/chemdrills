// Client-side mirror of the username rule in create_profile. The server is the
// authority (and also checks uniqueness and the blocked-word list); this only
// gives instant feedback while typing.

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

/** Lowercases and drops characters that can never be part of a username. */
export function cleanUsername(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
}
