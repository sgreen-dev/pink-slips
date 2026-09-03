/** A fresh seed for a match or a pack: the clock mixed with a random word. */
export function newSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0
}
