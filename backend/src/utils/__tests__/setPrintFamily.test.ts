import {
  numberLooksSecretRare,
  setLooksLikeSubsetPrint,
  setsSharePrintFamily,
} from '../setPrintFamily';

describe('setPrintFamily', () => {
  it('treats Shiny Vault / Trainer Gallery as subset prints', () => {
    expect(setLooksLikeSubsetPrint('Hidden Fates')).toBe(false);
    expect(setLooksLikeSubsetPrint('Pokemon Hidden Fates')).toBe(false);
    expect(setLooksLikeSubsetPrint('Hidden Fates Shiny Vault')).toBe(true);
    expect(setLooksLikeSubsetPrint('Hidden Fates: Shiny Vault')).toBe(true);
    expect(setLooksLikeSubsetPrint('Brilliant Stars Trainer Gallery')).toBe(true);
  });

  it('detects letter-prefixed collector numbers', () => {
    expect(numberLooksSecretRare('9')).toBe(false);
    expect(numberLooksSecretRare('212')).toBe(false);
    expect(numberLooksSecretRare('SV49')).toBe(true);
    expect(numberLooksSecretRare('sv49')).toBe(true);
    expect(numberLooksSecretRare('TG03')).toBe(true);
    expect(numberLooksSecretRare('GG44')).toBe(true);
  });

  it('does not treat parent Hidden Fates as the Shiny Vault set', () => {
    expect(setsSharePrintFamily('Hidden Fates', 'Hidden Fates Shiny Vault')).toBe(false);
    expect(setsSharePrintFamily('Pokemon Hidden Fates', 'Hidden Fates')).toBe(true);
    expect(
      setsSharePrintFamily('Hidden Fates: Shiny Vault', 'Hidden Fates Shiny Vault')
    ).toBe(true);
  });
});
