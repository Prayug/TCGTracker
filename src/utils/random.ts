/**
 * Creates a seeded random number generator.
 * This ensures that for the same seed, the sequence of random numbers will be the same.
 * This is a simple linear congruential generator.
 * @param seed - A string seed.
 * @returns A function that returns a pseudo-random number between 0 and 1.
 */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }

  return function() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  }
} 