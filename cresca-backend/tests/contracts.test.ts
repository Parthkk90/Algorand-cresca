/**
 * Contract Constants Tests
 * ========================
 * Verifies that the backend's contract constants match the deployed
 * contracts and the wallet service layer.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTRACT_APP_IDS,
  CALENDAR_METHODS,
  BUCKET_METHODS,
  BOX_PREFIXES,
  PYTH_PRICE_FEEDS,
  TRACKED_ASSETS,
  buildBoxKey,
  uint64ToBytes,
} from '../shared/contracts.js';

// ─── Source-of-truth values from deployed_contracts.json ─────
const DEPLOYED = {
  CrescaPayments: 758849047,
  CrescaCalendarPayments: 758849049,
  CrescaBucketProtocol: 758849061,
  CrescaDartSwap: 758849063,
};

describe('CONTRACT_APP_IDS', () => {
  it('CrescaPayments matches deployed_contracts.json', () => {
    assert.equal(CONTRACT_APP_IDS.CrescaPayments, DEPLOYED.CrescaPayments);
  });

  it('CrescaCalendarPayments matches deployed_contracts.json', () => {
    assert.equal(CONTRACT_APP_IDS.CrescaCalendarPayments, DEPLOYED.CrescaCalendarPayments);
  });

  it('CrescaBucketProtocol matches deployed_contracts.json', () => {
    assert.equal(CONTRACT_APP_IDS.CrescaBucketProtocol, DEPLOYED.CrescaBucketProtocol);
  });

  it('CrescaDartSwap matches deployed_contracts.json', () => {
    assert.equal(CONTRACT_APP_IDS.CrescaDartSwap, DEPLOYED.CrescaDartSwap);
  });
});

describe('CALENDAR_METHODS ABI signatures', () => {
  it('execute_schedule matches Python contract', () => {
    // Python: def execute_schedule(self, payer: arc4.Address, schedule_id: arc4.UInt64) -> arc4.Bool
    assert.equal(CALENDAR_METHODS.execute_schedule, 'execute_schedule(address,uint64)bool');
  });

  it('is_executable matches Python contract', () => {
    assert.equal(CALENDAR_METHODS.is_executable, 'is_executable(address,uint64)bool');
  });

  it('get_next_execution_time matches Python contract', () => {
    assert.equal(CALENDAR_METHODS.get_next_execution_time, 'get_next_execution_time(address,uint64)uint64');
  });

  it('get_user_schedule_count matches Python contract', () => {
    assert.equal(CALENDAR_METHODS.get_user_schedule_count, 'get_user_schedule_count(address)uint64');
  });

  it('fund_contract matches Python contract (takes pay arg)', () => {
    assert.equal(CALENDAR_METHODS.fund_contract, 'fund_contract(pay)bool');
  });
});

describe('BUCKET_METHODS ABI signatures', () => {
  it('update_oracle matches Python contract', () => {
    // Python: def update_oracle(self, asset_ids: DynamicArray[UInt64], asset_prices: DynamicArray[UInt64]) -> Bool
    assert.equal(BUCKET_METHODS.update_oracle, 'update_oracle(uint64[],uint64[])bool');
  });

  it('liquidate_position matches Python contract', () => {
    assert.equal(BUCKET_METHODS.liquidate_position, 'liquidate_position(address,uint64)bool');
  });

  it('get_collateral_balance matches Python contract', () => {
    assert.equal(BUCKET_METHODS.get_collateral_balance, 'get_collateral_balance(address)uint64');
  });

  it('get_unrealized_pnl matches Python contract', () => {
    assert.equal(BUCKET_METHODS.get_unrealized_pnl, 'get_unrealized_pnl(address,uint64)uint64');
  });

  it('get_total_positions matches Python contract', () => {
    assert.equal(BUCKET_METHODS.get_total_positions, 'get_total_positions()uint64');
  });

  it('fund_contract matches Python contract', () => {
    assert.equal(BUCKET_METHODS.fund_contract, 'fund_contract(pay)bool');
  });
});

describe('BOX_PREFIXES', () => {
  it('SCHEDULE_COUNT matches cresca_calendar_payments.py key_prefix=b"cnt_"', () => {
    assert.equal(BOX_PREFIXES.SCHEDULE_COUNT, 'cnt_');
  });

  it('SCHEDULE matches cresca_calendar_payments.py key_prefix=b"sch_"', () => {
    assert.equal(BOX_PREFIXES.SCHEDULE, 'sch_');
  });

  it('BUCKET_COUNT matches cresca_bucket_protocol.py key_prefix=b"bkc_"', () => {
    assert.equal(BOX_PREFIXES.BUCKET_COUNT, 'bkc_');
  });

  it('BUCKET matches _bucket_key() prefix b"bkt_"', () => {
    assert.equal(BOX_PREFIXES.BUCKET, 'bkt_');
  });

  it('COLLATERAL matches cresca_bucket_protocol.py key_prefix=b"col_"', () => {
    assert.equal(BOX_PREFIXES.COLLATERAL, 'col_');
  });

  it('POSITION matches _position_key() prefix b"pos_"', () => {
    assert.equal(BOX_PREFIXES.POSITION, 'pos_');
  });

  it('PRICE matches _price_key() prefix b"prc_"', () => {
    assert.equal(BOX_PREFIXES.PRICE, 'prc_');
  });
});

describe('PYTH_PRICE_FEEDS', () => {
  it('has ALGO feed ID matching pythOracleService.ts', () => {
    assert.equal(
      PYTH_PRICE_FEEDS.ALGO,
      '0x08f781a893bc9340140c5f89c8a96f438bcfae4d1474cc0f688e3a52892c7318',
    );
  });

  it('has BTC feed ID', () => {
    assert.equal(
      PYTH_PRICE_FEEDS.BTC,
      '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
    );
  });

  it('has ETH feed ID', () => {
    assert.equal(
      PYTH_PRICE_FEEDS.ETH,
      '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
    );
  });

  it('has SOL feed ID', () => {
    assert.equal(
      PYTH_PRICE_FEEDS.SOL,
      '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
    );
  });

  it('has USDC feed ID', () => {
    assert.equal(
      PYTH_PRICE_FEEDS.USDC,
      '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a',
    );
  });
});

describe('TRACKED_ASSETS', () => {
  it('includes ALGO with asaId=0', () => {
    const algo = TRACKED_ASSETS.find((a) => a.symbol === 'ALGO');
    assert.ok(algo, 'ALGO not found in TRACKED_ASSETS');
    assert.equal(algo.asaId, 0);
    assert.equal(algo.decimals, 6);
  });

  it('includes USDC with correct testnet ASA ID', () => {
    const usdc = TRACKED_ASSETS.find((a) => a.symbol === 'USDC');
    assert.ok(usdc, 'USDC not found in TRACKED_ASSETS');
    assert.equal(usdc.asaId, 10458941);
    assert.equal(usdc.decimals, 6);
  });
});

describe('buildBoxKey', () => {
  it('produces correct bytes for a schedule count key', () => {
    const pubKey = new Uint8Array(32).fill(0xAB);
    const key = buildBoxKey('cnt_', pubKey);
    assert.equal(key.length, 36); // 4 + 32
    assert.equal(Buffer.from(key.subarray(0, 4)).toString(), 'cnt_');
    assert.deepEqual(key.subarray(4), pubKey);
  });

  it('produces correct bytes for a schedule key (with schedule_id)', () => {
    const pubKey = new Uint8Array(32).fill(0xCD);
    const scheduleIdBytes = uint64ToBytes(42);
    const key = buildBoxKey('sch_', pubKey, scheduleIdBytes);
    assert.equal(key.length, 44); // 4 + 32 + 8
    assert.equal(Buffer.from(key.subarray(0, 4)).toString(), 'sch_');
    assert.deepEqual(key.subarray(4, 36), pubKey);
    assert.equal(Buffer.from(key.subarray(36, 44)).readBigUInt64BE(0), 42n);
  });

  it('produces correct bytes for a price key', () => {
    const asaIdBytes = uint64ToBytes(10458941);
    const key = buildBoxKey('prc_', asaIdBytes);
    assert.equal(key.length, 12); // 4 + 8
    assert.equal(Buffer.from(key.subarray(0, 4)).toString(), 'prc_');
    assert.equal(Buffer.from(key.subarray(4, 12)).readBigUInt64BE(0), 10458941n);
  });
});

describe('uint64ToBytes', () => {
  it('encodes 0 correctly', () => {
    const bytes = uint64ToBytes(0);
    assert.equal(bytes.length, 8);
    assert.equal(Buffer.from(bytes).readBigUInt64BE(0), 0n);
  });

  it('encodes 1 correctly', () => {
    const bytes = uint64ToBytes(1);
    assert.equal(Buffer.from(bytes).readBigUInt64BE(0), 1n);
  });

  it('encodes large number correctly', () => {
    const bytes = uint64ToBytes(758849063);
    assert.equal(Buffer.from(bytes).readBigUInt64BE(0), 758849063n);
  });

  it('encodes BigInt correctly', () => {
    const bytes = uint64ToBytes(BigInt('18446744073709551615'));
    assert.equal(Buffer.from(bytes).readBigUInt64BE(0), 18446744073709551615n);
  });
});
