/**
 * The shape of what the account forms answer with, and their starting value.
 *
 * ITS OWN FILE BECAUSE actions.ts IS A "use server" MODULE, and such a module
 * may export async functions and nothing else. `EMPTY` lived there as an
 * `export const`, which builds and renders perfectly well and then throws the
 * moment anything in the file is called as an action:
 *
 *   A "use server" file can only export async functions, found object.
 *
 * That is why changing a password came back as a blank error page with a
 * digest on it. The page was fine; the first click was not, every time. A
 * type-only export (`interface`, `type`) is erased before it gets there and is
 * allowed, which is why `SaveState` was never the problem - but it lives here
 * too, so the next person does not have to know which of the two rules applies
 * to what they are adding.
 */
export interface SaveState {
  error: string | null;
  done: string | null;
}

export const EMPTY: SaveState = { error: null, done: null };
