import {
  namesCompatible,
  pickEnglishCounterpart,
  setFamily,
  type CounterpartCandidate,
} from '../moneyFlowImages';

const me2: CounterpartCandidate[] = [
  {
    matchName: 'Oricorio ex',
    setId: 'me2',
    cardNumber: '18',
    rarity: 'Double Rare',
    imageSmall: 'https://images.pokemontcg.io/me2/18.png',
    imageLarge: null,
  },
  {
    matchName: 'Oricorio ex',
    setId: 'me2',
    cardNumber: '110',
    rarity: 'Ultra Rare',
    imageSmall: 'https://images.pokemontcg.io/me2/110.png',
    imageLarge: null,
  },
  {
    matchName: 'Piplup',
    setId: 'me2',
    cardNumber: '27',
    rarity: 'Common',
    imageSmall: 'https://images.pokemontcg.io/me2/27.png',
    imageLarge: null,
  },
  {
    matchName: 'Piplup',
    setId: 'me2',
    cardNumber: '98',
    rarity: 'Illustration Rare',
    imageSmall: 'https://images.pokemontcg.io/me2/98.png',
    imageLarge: null,
  },
  {
    matchName: 'Mega Charizard X ex',
    setId: 'me2',
    cardNumber: '109',
    rarity: 'Ultra Rare',
    imageSmall: 'https://images.pokemontcg.io/me2/109.png',
    imageLarge: null,
  },
  {
    matchName: 'Mega Charizard X ex',
    setId: 'me2',
    cardNumber: '125',
    rarity: 'Special Illustration Rare',
    imageSmall: 'https://images.pokemontcg.io/me2/125.png',
    imageLarge: null,
  },
];

describe('moneyFlowImages counterparts', () => {
  it('pairs Japanese Mega / e-series set ids with English catalog sets', () => {
    expect(setFamily('M2')).toBe(setFamily('me2'));
    expect(setFamily('M1L')).toBe(setFamily('me1'));
    expect(setFamily('E2')).toBe(setFamily('ecard2'));
    expect(setFamily('CP1')).toBe(setFamily('dc1'));
  });

  it('matches JP match names onto English print titles without grabbing a random same-species card', () => {
    expect(namesCompatible('Oricorio EX', 'Oricorio ex')).toBe(true);
    expect(namesCompatible('Charizard', 'Mega Charizard X ex')).toBe(true);
    expect(namesCompatible('Kyogre EX', "Team Aqua's Kyogre-EX")).toBe(true);
    expect(namesCompatible('Pikachu [Battle Festa 2017]', 'Pikachu')).toBe(false);
    expect(namesCompatible('Oricorio EX', 'Oricorio')).toBe(false);
  });

  it('copies the English chase print, not the bulk version in the same set', () => {
    const oricorio = pickEnglishCounterpart(
      {
        matchName: 'Oricorio EX',
        setId: 'M2',
        cardNumber: '111',
        rarity: 'Special illustration rare',
      },
      me2
    );
    expect(oricorio?.cardNumber).toBe('110');

    const piplup = pickEnglishCounterpart(
      { matchName: 'Piplup', setId: 'M2', cardNumber: '085', rarity: 'Illustration rare' },
      me2
    );
    expect(piplup?.cardNumber).toBe('98');

    const zard = pickEnglishCounterpart(
      {
        matchName: 'Charizard',
        setId: 'M2',
        cardNumber: '110',
        rarity: 'Special illustration rare',
      },
      me2
    );
    expect(zard?.cardNumber).toBe('125');
  });

  it('does not pick an English card from an unrelated set', () => {
    const picked = pickEnglishCounterpart(
      { matchName: 'Oricorio EX', setId: 'M2', rarity: 'Special illustration rare' },
      [
        {
          matchName: 'Oricorio ex',
          setId: 'sv2',
          cardNumber: '33',
          rarity: 'Rare',
          imageSmall: 'https://images.pokemontcg.io/sv2/33.png',
          imageLarge: null,
        },
      ]
    );
    expect(picked).toBeNull();
  });
});
