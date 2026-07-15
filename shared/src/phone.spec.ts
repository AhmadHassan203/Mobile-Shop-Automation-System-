import { describe, expect, it } from 'vitest';
import { formatPakistanPhone, maskPhone, normalizePakistanPhone } from './phone';

describe('Pakistan phone normalization', () => {
  it('normalizes every common counter format to one E.164 value', () => {
    const forms = [
      '03001234567',
      '0300-1234567',
      '0300 1234567',
      '+92 300 1234567',
      '+923001234567',
      '92-300-1234567',
      '0092 300 1234567',
      '3001234567',
    ];
    for (const form of forms) {
      const result = normalizePakistanPhone(form);
      expect(result.valid, `${form} should be valid`).toBe(true);
      expect(result.normalized, form).toBe('+923001234567');
    }
  });

  it('collapses differently-typed forms of one number to a single value', () => {
    // This is what makes customer lookup and uniqueness work at the counter.
    const normalized = new Set(
      ['03001234567', '+92 300 1234567', '0300-1234567'].map((f) => normalizePakistanPhone(f).normalized),
    );
    expect(normalized.size).toBe(1);
  });

  it('produces a readable national form', () => {
    expect(normalizePakistanPhone('+923001234567').national).toBe('0300-1234567');
  });

  it('accepts other Pakistani mobile prefixes', () => {
    for (const prefix of ['0300', '0321', '0333', '0345', '0311']) {
      expect(normalizePakistanPhone(`${prefix}1234567`).valid, prefix).toBe(true);
    }
  });

  it('rejects empty input', () => {
    expect(normalizePakistanPhone('').valid).toBe(false);
    expect(normalizePakistanPhone(null).valid).toBe(false);
    expect(normalizePakistanPhone(undefined).valid).toBe(false);
  });

  it('rejects numbers of the wrong length', () => {
    expect(normalizePakistanPhone('0300123').valid).toBe(false);
    expect(normalizePakistanPhone('030012345678').valid).toBe(false);
  });

  it('rejects landlines and non-mobile prefixes', () => {
    // 042-35123456 is a full Lahore landline: 10 national digits, so it passes the
    // length check and must be rejected on the prefix rule. Follow-up workflows
    // (demand capture, WhatsApp receipts) target mobiles only.
    const result = normalizePakistanPhone('042-35123456');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('start with 3');
  });

  it('rejects a too-short landline on length', () => {
    const result = normalizePakistanPhone('0421234567');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('10 digits');
  });

  it('rejects non-Pakistani international numbers', () => {
    const result = normalizePakistanPhone('+1 415 555 0100');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('+92');
  });
});

describe('phone display', () => {
  it('formats a stored E.164 number for display', () => {
    expect(formatPakistanPhone('+923001234567')).toBe('0300-1234567');
  });

  it('returns the input unchanged when it cannot be parsed', () => {
    expect(formatPakistanPhone('not-a-number')).toBe('not-a-number');
  });

  it('masks a number for low-trust display', () => {
    expect(maskPhone('+923001234567')).toBe('0300-***4567');
  });

  it('degrades safely when masking unparseable input', () => {
    expect(maskPhone('garbage')).toBe('***');
  });
});
