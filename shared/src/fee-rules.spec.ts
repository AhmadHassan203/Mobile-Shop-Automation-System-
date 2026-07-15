import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BLOCK_AMOUNT_MINOR,
  DEFAULT_SEND_FEE_PER_BLOCK_MINOR,
  DEFAULT_WITHDRAWAL_FEE_PER_BLOCK_MINOR,
  type FeeRule,
  FeeRuleError,
  calculateCashImpactMagnitude,
  calculateFee,
  calculateServiceProfit,
  PROTOTYPE_FEE_MODE_MAP,
} from './fee-rules';
import { fromMajor, toMajorString, toMinor } from './money';

/** Default send rule: PKR 10 per PKR 1,000 (13_ §13). */
const SEND_RULE: FeeRule = {
  mode: 'per_started_block',
  blockAmountMinor: DEFAULT_BLOCK_AMOUNT_MINOR,
  feePerBlockMinor: DEFAULT_SEND_FEE_PER_BLOCK_MINOR,
};

/** Default withdrawal rule: PKR 20 per PKR 1,000 (13_ §13). */
const WITHDRAWAL_RULE: FeeRule = {
  mode: 'per_started_block',
  blockAmountMinor: DEFAULT_BLOCK_AMOUNT_MINOR,
  feePerBlockMinor: DEFAULT_WITHDRAWAL_FEE_PER_BLOCK_MINOR,
};

describe('fee calculation — approved default business rules', () => {
  it('charges PKR 10 to send PKR 1,000', () => {
    const result = calculateFee(fromMajor('1000'), SEND_RULE);
    expect(toMajorString(result.feeMinor)).toBe('10.00');
    expect(result.blocksCharged).toBe(1);
  });

  it('charges PKR 20 to withdraw PKR 1,000', () => {
    const result = calculateFee(fromMajor('1000'), WITHDRAWAL_RULE);
    expect(toMajorString(result.feeMinor)).toBe('20.00');
  });

  it('scales linearly across whole blocks', () => {
    expect(toMajorString(calculateFee(fromMajor('5000'), SEND_RULE).feeMinor)).toBe('50.00');
    expect(toMajorString(calculateFee(fromMajor('5000'), WITHDRAWAL_RULE).feeMinor)).toBe('100.00');
    expect(toMajorString(calculateFee(fromMajor('25000'), SEND_RULE).feeMinor)).toBe('250.00');
  });

  it('charges nothing for a zero principal', () => {
    const result = calculateFee(fromMajor('0'), SEND_RULE);
    expect(result.feeMinor).toBe(0);
    expect(result.blocksCharged).toBe(0);
  });
});

describe('fee calculation — partial block behavior (ASM-003)', () => {
  it('per_started_block charges a full block for a partial thousand', () => {
    // PKR 1,500 spans two started blocks -> PKR 20 under the send rule.
    const result = calculateFee(fromMajor('1500'), SEND_RULE);
    expect(result.blocksCharged).toBe(2);
    expect(toMajorString(result.feeMinor)).toBe('20.00');
  });

  it('per_started_block charges one block for any amount up to the block size', () => {
    expect(calculateFee(fromMajor('1'), SEND_RULE).blocksCharged).toBe(1);
    expect(calculateFee(fromMajor('999.99'), SEND_RULE).blocksCharged).toBe(1);
    expect(calculateFee(fromMajor('1000'), SEND_RULE).blocksCharged).toBe(1);
    expect(calculateFee(fromMajor('1000.01'), SEND_RULE).blocksCharged).toBe(2);
  });

  it('proportional_block pro-rates the partial thousand instead', () => {
    const rule: FeeRule = { ...SEND_RULE, mode: 'proportional_block' };
    expect(toMajorString(calculateFee(fromMajor('1500'), rule).feeMinor)).toBe('15.00');
    expect(toMajorString(calculateFee(fromMajor('500'), rule).feeMinor)).toBe('5.00');
  });

  it('the two block modes agree on exact multiples and differ only on partials', () => {
    const proportional: FeeRule = { ...SEND_RULE, mode: 'proportional_block' };
    expect(calculateFee(fromMajor('3000'), SEND_RULE).feeMinor).toBe(
      calculateFee(fromMajor('3000'), proportional).feeMinor,
    );
    expect(calculateFee(fromMajor('3001'), SEND_RULE).feeMinor).not.toBe(
      calculateFee(fromMajor('3001'), proportional).feeMinor,
    );
  });
});

describe('fee calculation — parity with the approved prototype', () => {
  // prototype/assets/digital.js calcFee:
  //   SLAB -> Math.ceil(amount / blockSize) * feePerBlock, then min/max clamp.
  // Seeded rules: SENT {blockSize:1000, feePerBlock:10, minimumFee:10}
  //               RECEIVED {blockSize:1000, feePerBlock:20, minimumFee:20}
  const PROTOTYPE_SEND: FeeRule = { ...SEND_RULE, minFeeMinor: fromMajor('10') };
  const PROTOTYPE_RECEIVED: FeeRule = { ...WITHDRAWAL_RULE, minFeeMinor: fromMajor('20') };

  function prototypeSlabFee(amountRupees: number, blockSize: number, feePerBlock: number, minimumFee: number): number {
    if (!amountRupees) return 0;
    return Math.round(Math.max(Math.ceil(amountRupees / blockSize) * feePerBlock, minimumFee));
  }

  it('reproduces the prototype SLAB fee for send across a range of amounts', () => {
    for (const rupees of [1, 500, 999, 1000, 1001, 1500, 2000, 4999, 5000, 25000, 100000]) {
      const expected = prototypeSlabFee(rupees, 1000, 10, 10);
      const actual = calculateFee(fromMajor(String(rupees)), PROTOTYPE_SEND).feeMinor;
      expect(toMajorString(actual), `send ${rupees}`).toBe(expected.toFixed(2));
    }
  });

  it('reproduces the prototype SLAB fee for withdrawal across a range of amounts', () => {
    for (const rupees of [1, 500, 1000, 1500, 3000, 7500, 50000]) {
      const expected = prototypeSlabFee(rupees, 1000, 20, 20);
      const actual = calculateFee(fromMajor(String(rupees)), PROTOTYPE_RECEIVED).feeMinor;
      expect(toMajorString(actual), `withdrawal ${rupees}`).toBe(expected.toFixed(2));
    }
  });

  it('maps prototype mode names to production modes, including the PROPORTIONAL trap', () => {
    // The prototype's "PROPORTIONAL" is a percentage of principal, not a pro-rated block.
    expect(PROTOTYPE_FEE_MODE_MAP.SLAB).toBe('per_started_block');
    expect(PROTOTYPE_FEE_MODE_MAP.PROPORTIONAL).toBe('percentage');
    expect(PROTOTYPE_FEE_MODE_MAP.FLAT).toBe('fixed');
  });
});

describe('fee calculation — other modes', () => {
  it('applies a flat fee regardless of principal', () => {
    const rule: FeeRule = { mode: 'fixed', feePerBlockMinor: fromMajor('50') };
    expect(toMajorString(calculateFee(fromMajor('1000'), rule).feeMinor)).toBe('50.00');
    expect(toMajorString(calculateFee(fromMajor('100000'), rule).feeMinor)).toBe('50.00');
  });

  it('applies a percentage of principal', () => {
    const rule: FeeRule = { mode: 'percentage', percentageRate: 1.5 };
    expect(toMajorString(calculateFee(fromMajor('1000'), rule).feeMinor)).toBe('15.00');
  });

  it('rounds percentage fees to whole paisa', () => {
    const rule: FeeRule = { mode: 'percentage', percentageRate: 0.333 };
    const result = calculateFee(fromMajor('1000'), rule);
    expect(Number.isInteger(result.feeMinor)).toBe(true);
    expect(toMajorString(result.feeMinor)).toBe('3.33');
  });
});

describe('fee calculation — min/max clamping', () => {
  it('raises a fee below the configured minimum', () => {
    const rule: FeeRule = { ...SEND_RULE, minFeeMinor: fromMajor('25') };
    const result = calculateFee(fromMajor('1000'), rule);
    expect(toMajorString(result.feeMinor)).toBe('25.00');
    expect(result.clampedByMin).toBe(true);
    expect(toMajorString(result.rawFeeMinor)).toBe('10.00');
  });

  it('caps a fee above the configured maximum', () => {
    const rule: FeeRule = { ...SEND_RULE, maxFeeMinor: fromMajor('100') };
    const result = calculateFee(fromMajor('50000'), rule);
    expect(toMajorString(result.feeMinor)).toBe('100.00');
    expect(result.clampedByMax).toBe(true);
    expect(toMajorString(result.rawFeeMinor)).toBe('500.00');
  });

  it('explains why a clamp applied', () => {
    const rule: FeeRule = { ...SEND_RULE, minFeeMinor: fromMajor('25') };
    expect(calculateFee(fromMajor('1000'), rule).explanation).toContain('minimum fee');
  });
});

describe('fee calculation — invalid configuration', () => {
  it('rejects a negative principal', () => {
    expect(() => calculateFee(toMinor(-1), SEND_RULE)).toThrow(FeeRuleError);
  });

  it('rejects block modes without a positive block size', () => {
    expect(() => calculateFee(fromMajor('1000'), { mode: 'per_started_block', feePerBlockMinor: toMinor(10) })).toThrow(
      FeeRuleError,
    );
  });

  it('rejects percentage mode without a rate', () => {
    expect(() => calculateFee(fromMajor('1000'), { mode: 'percentage' })).toThrow(FeeRuleError);
  });
});

describe('service profit', () => {
  it('is fee minus provider charge minus direct expense', () => {
    // Customer charged PKR 20; provider took PKR 8; PKR 2 other cost -> PKR 10 profit.
    const profit = calculateServiceProfit({
      customerFeeMinor: fromMajor('20'),
      providerChargeMinor: fromMajor('8'),
      otherDirectExpenseMinor: fromMajor('2'),
    });
    expect(toMajorString(profit)).toBe('10.00');
  });

  it('treats omitted costs as zero', () => {
    expect(toMajorString(calculateServiceProfit({ customerFeeMinor: fromMajor('20') }))).toBe('20.00');
  });

  it('reports a real loss rather than clamping to zero', () => {
    const profit = calculateServiceProfit({
      customerFeeMinor: fromMajor('10'),
      providerChargeMinor: fromMajor('15'),
    });
    expect(toMajorString(profit)).toBe('-5.00');
  });

  it('never counts the principal as profit', () => {
    // Sending PKR 50,000 for a PKR 500 fee yields PKR 500 of revenue, not PKR 50,500.
    const profit = calculateServiceProfit({
      customerFeeMinor: calculateFee(fromMajor('50000'), SEND_RULE).feeMinor,
      providerChargeMinor: fromMajor('0'),
    });
    expect(toMajorString(profit)).toBe('500.00');
  });
});

describe('cash impact', () => {
  it('includes principal and fee only when configured to affect the drawer', () => {
    const both = calculateCashImpactMagnitude({
      principalMinor: fromMajor('1000'),
      customerFeeMinor: fromMajor('10'),
      principalAffectsCash: true,
      feeAffectsCash: true,
    });
    expect(toMajorString(both)).toBe('1010.00');
  });

  it('can count the fee alone when the provider settles the principal directly', () => {
    const feeOnly = calculateCashImpactMagnitude({
      principalMinor: fromMajor('1000'),
      customerFeeMinor: fromMajor('10'),
      principalAffectsCash: false,
      feeAffectsCash: true,
    });
    expect(toMajorString(feeOnly)).toBe('10.00');
  });

  it('can be zero when neither leg touches cash', () => {
    const none = calculateCashImpactMagnitude({
      principalMinor: fromMajor('1000'),
      customerFeeMinor: fromMajor('10'),
      principalAffectsCash: false,
      feeAffectsCash: false,
    });
    expect(none).toBe(0);
  });
});
