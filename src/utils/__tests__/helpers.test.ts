import { describe, it, expect } from 'vitest';

// Example utility tests - add your actual utility functions here
describe('Utility Functions', () => {
  describe('formatPrice', () => {
    it('formats price correctly', () => {
      const formatPrice = (price: number) => `$${price.toFixed(2)}`;
      expect(formatPrice(10)).toBe('$10.00');
      expect(formatPrice(99.99)).toBe('$99.99');
    });
  });

  describe('sortByPrice', () => {
    it('sorts cards by price', () => {
      const cards = [
        { id: '1', price: 50 },
        { id: '2', price: 10 },
        { id: '3', price: 30 },
      ];
      const sorted = [...cards].sort((a, b) => a.price - b.price);
      expect(sorted[0].price).toBe(10);
      expect(sorted[2].price).toBe(50);
    });
  });
});

