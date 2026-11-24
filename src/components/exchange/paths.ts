/** Path to a card's research page. */
export function cardPath(id: string) {
  return `/card/${encodeURIComponent(id)}`;
}
