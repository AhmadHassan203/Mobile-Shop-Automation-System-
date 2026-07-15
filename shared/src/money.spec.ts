import { describe, expect, it } from 'vitest';
import {
  MoneyError,
  add,
  allocateByWeights,
  allocateEvenly,
  formatMoney,
  fromMajor,
  multiplyByQuantity,
  percentOf,
  roundToMinor,
  subtract,
  sum,
  toMajorString,
  toMinor,
  zero,
} from './money';

describe('money — minor unit conversion', () => {
  it('converts rupee strings to paisa exactly', () => {
    expect(fromMajor('0')).toBe(0);
    expect(fromMajor('1')).toBe(100);
    expect(fromMajor('1234.56')).toBe(123456);
    expect(fromMajor('0.01')).toBe(1);
    expect(fromMajor('-45.50')).toBe(-4550);
  });

  it('pads short fractions', () => {
    expect(fromMajor('1.5')).toBe(150);
    expect(fromMajor('0.5')).toBe(50);
  });

  it('rejects a trailing decimal point as malformed', () => {
    expect(() => fromMajor('1.')).toThrow(MoneyError);
  });

  it('rejects values with more precision than the currency supports', () => {
    // 0.001 rupee cannot be represented; silently truncating would lose money.
    expect(() => fromMajor('1.234')).toThrow(MoneyError);
  });

  it('rejects malformed input', () => {
    expect(() => fromMajor('abc')).toThrow(MoneyError);
    expect(() => fromMajor('')).toThrow(MoneyError);
    expect(() => fromMajor('1,234.56')).toThrow(MoneyError);
  });

  it('round-trips through the major string form', () => {
    for (const value of ['0.00', '1.00', '1234.56', '-45.50', '999999.99']) {
      expect(toMajorString(fromMajor(value))).toBe(value === '0.00' ? '0.00' : value);
    }
  });

  it('renders minor units with correct padding', () => {
    expect(toMajorString(toMinor(5))).toBe('0.05');
    expect(toMajorString(toMinor(50))).toBe('0.50');
    expect(toMajorString(toMinor(-5))).toBe('-0.05');
  });

  it('rejects non-integer minor units', () => {
    expect(() => toMinor(1.5)).toThrow(MoneyError);
  });
});

describe('money — arithmetic', () => {
  it('adds and subtracts exactly', () => {
    expect(add(fromMajor('0.1'), fromMajor('0.2'))).toBe(30);
    expect(subtract(fromMajor('1.00'), fromMajor('0.99'))).toBe(1);
  });

  it('avoids the classic float error', () => {
    // 0.1 + 0.2 === 0.30000000000000004 in floating point. Minor units make it exact.
    expect(toMajorString(add(fromMajor('0.1'), fromMajor('0.2')))).toBe('0.30');
  });

  it('sums a list', () => {
    expect(sum([fromMajor('1.10'), fromMajor('2.20'), fromMajor('3.30')])).toBe(660);
    expect(sum([])).toBe(0);
  });

  it('multiplies by an integer quantity', () => {
    expect(multiplyByQuantity(fromMajor('249.99'), 3)).toBe(74997);
  });

  it('rejects fractional quantities', () => {
    expect(() => multiplyByQuantity(fromMajor('10.00'), 1.5)).toThrow(MoneyError);
  });
});

describe('money — rounding', () => {
  it('rounds half away from zero by default', () => {
    expect(roundToMinor(2.5)).toBe(3);
    expect(roundToMinor(-2.5)).toBe(-3);
    expect(roundToMinor(2.4)).toBe(2);
  });

  it('supports bankers rounding', () => {
    expect(roundToMinor(2.5, 'half_even')).toBe(2);
    expect(roundToMinor(3.5, 'half_even')).toBe(4);
  });

  it('supports up and down', () => {
    expect(roundToMinor(2.1, 'up')).toBe(3);
    expect(roundToMinor(2.9, 'down')).toBe(2);
  });

  it('computes percentages', () => {
    expect(percentOf(fromMajor('1000.00'), 17)).toBe(17000);
    expect(percentOf(fromMajor('99.99'), 10)).toBe(1000); // 999.9 paisa -> 1000
  });
});

describe('money — allocation', () => {
  it('never loses or invents a paisa when splitting evenly', () => {
    const shares = allocateEvenly(fromMajor('100.00'), 3);
    expect(shares).toEqual([3334, 3333, 3333]);
    expect(sum(shares)).toBe(fromMajor('100.00'));
  });

  it('allocates by weights and reconciles exactly', () => {
    // Landed cost of PKR 1,000 split across units costing 3:1
    const shares = allocateByWeights(fromMajor('1000.00'), [3, 1]);
    expect(sum(shares)).toBe(fromMajor('1000.00'));
    expect(shares).toEqual([75000, 25000]);
  });

  it('gives the leftover to the largest fractional remainders', () => {
    const shares = allocateByWeights(toMinor(10), [1, 1, 1]);
    expect(sum(shares)).toBe(10);
    expect(shares).toEqual([4, 3, 3]);
  });

  it('handles negative amounts (e.g. reversal) without drift', () => {
    const shares = allocateByWeights(fromMajor('-100.00'), [1, 1, 1]);
    expect(sum(shares)).toBe(fromMajor('-100.00'));
  });

  it('rejects invalid weights', () => {
    expect(() => allocateByWeights(fromMajor('10'), [])).toThrow(MoneyError);
    expect(() => allocateByWeights(fromMajor('10'), [0, 0])).toThrow(MoneyError);
    expect(() => allocateByWeights(fromMajor('10'), [-1, 2])).toThrow(MoneyError);
  });

  it('rejects invalid part counts', () => {
    expect(() => allocateEvenly(fromMajor('10'), 0)).toThrow(MoneyError);
    expect(() => allocateEvenly(fromMajor('10'), 1.5)).toThrow(MoneyError);
  });
});

describe('money — formatting', () => {
  it('formats with grouping and symbol', () => {
    expect(formatMoney(fromMajor('1234567.89'))).toBe('PKR 1,234,567.89');
    expect(formatMoney(fromMajor('0.05'))).toBe('PKR 0.05');
  });

  it('formats negatives and suppresses the symbol on request', () => {
    expect(formatMoney(fromMajor('-99.50'))).toBe('PKR -99.50');
    expect(formatMoney(fromMajor('10.00'), 'PKR', { withSymbol: false })).toBe('10.00');
  });

  it('formats zero', () => {
    expect(formatMoney(zero())).toBe('PKR 0.00');
  });
});
