/**
 * Ports the domain needs but must not construct for itself.
 *
 * `Date.now()` and random ids inside a service would make its output
 * unrepeatable, and tests would have to compare "everything except a
 * timestamp" by convention instead of by contract. Injecting both instead
 * means a test can assert full equality, and `docs/story-engine-implementation.md`
 * documents why: two publishes of the same content, same clock and same
 * generator produce byte-identical output.
 *
 * Neither port mints or alters a *published curriculum id*: they only ever
 * produce this feature's own technical ids (`StoryId`, `StoryVersionId`, ...).
 */

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  /** A fresh, unique technical id carrying the given kind's prefix. */
  next(kind: string): string;
}
