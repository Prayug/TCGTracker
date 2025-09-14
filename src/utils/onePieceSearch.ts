/** Fields searched for One Piece browse queries (card effect text is intentionally excluded). */
export interface OnePieceSearchableCard {
  name: string;
  number: string;
  set?: { id?: string; name?: string };
  cardType?: string;
  subTypes?: string;
}

export function cardMatchesOnePieceQuery(
  card: OnePieceSearchableCard,
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return false;

  return (
    card.name.toLowerCase().includes(q) ||
    card.number.toLowerCase().includes(q) ||
    Boolean(card.set?.id?.toLowerCase().includes(q)) ||
    Boolean(card.set?.name?.toLowerCase().includes(q)) ||
    Boolean(card.subTypes?.toLowerCase().includes(q))
  );
}
