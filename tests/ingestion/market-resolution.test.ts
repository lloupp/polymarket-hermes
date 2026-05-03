import { describe, it, expect } from 'vitest';
import {
  fetchMarketResolution,
  fetchMarketResolutions,
  getResolutionExitPrice,
  type MarketResolution,
} from '../../src/ingestion/market-resolution';

function makeClosedMarketFetcher(winningOutcome: 'YES' | 'NO') {
  const yesPrice = winningOutcome === 'YES' ? 1 : 0;
  const noPrice = winningOutcome === 'NO' ? 1 : 0;
  return async () => ({
    id: 'test-market',
    closed: true,
    outcomePrices: JSON.stringify([String(yesPrice), String(noPrice)]),
    outcomes: '["Yes","No"]',
  });
}

function makeOpenMarketFetcher() {
  return async () => ({
    id: 'test-market',
    closed: false,
    outcomePrices: JSON.stringify(['0.65', '0.35']),
    outcomes: '["Yes","No"]',
  });
}

function makeFailingFetcher() {
  return async () => {
    throw new Error('network timeout');
  };
}

function makeInvalidPayloadFetcher() {
  return async () => ({
    notAMarket: true,
  });
}

describe('fetchMarketResolution', () => {
  it('detects YES resolution when market is closed with YES at 1.0', async () => {
    const resolution = await fetchMarketResolution('test-market', {
      fetcher: makeClosedMarketFetcher('YES'),
    });

    expect(resolution.closed).toBe(true);
    expect(resolution.yesPrice).toBe(1);
    expect(resolution.noPrice).toBe(0);
    expect(resolution.winningOutcome).toBe('YES');
  });

  it('detects NO resolution when market is closed with NO at 1.0', async () => {
    const resolution = await fetchMarketResolution('test-market', {
      fetcher: makeClosedMarketFetcher('NO'),
    });

    expect(resolution.closed).toBe(true);
    expect(resolution.yesPrice).toBe(0);
    expect(resolution.noPrice).toBe(1);
    expect(resolution.winningOutcome).toBe('NO');
  });

  it('returns no winning outcome when market is still open', async () => {
    const resolution = await fetchMarketResolution('test-market', {
      fetcher: makeOpenMarketFetcher(),
    });

    expect(resolution.closed).toBe(false);
    expect(resolution.winningOutcome).toBeUndefined();
  });

  it('returns no winning outcome when market is closed but prices are ambiguous', async () => {
    const fetcher = async () => ({
      id: 'test-market',
      closed: true,
      outcomePrices: JSON.stringify(['0.5', '0.5']),
      outcomes: '["Yes","No"]',
    });

    const resolution = await fetchMarketResolution('test-market', { fetcher });

    expect(resolution.closed).toBe(true);
    expect(resolution.winningOutcome).toBeUndefined();
  });

  it('handles invalid payload gracefully', async () => {
    const resolution = await fetchMarketResolution('test-market', {
      fetcher: makeInvalidPayloadFetcher(),
    });

    expect(resolution.marketId).toBe('test-market');
    expect(resolution.closed).toBe(false);
  });

  it('handles network error gracefully', async () => {
    const resolution = await fetchMarketResolution('test-market', {
      fetcher: makeFailingFetcher(),
    });

    expect(resolution.marketId).toBe('test-market');
    expect(resolution.closed).toBe(false);
  });

  it('handles missing outcomePrices gracefully', async () => {
    const fetcher = async () => ({
      id: 'test-market',
      closed: false,
    });

    const resolution = await fetchMarketResolution('test-market', { fetcher });

    expect(resolution.yesPrice).toBe(0);
    expect(resolution.noPrice).toBe(0);
  });
});

describe('fetchMarketResolutions', () => {
  it('fetches resolutions for multiple markets', async () => {
    const fetcher = makeOpenMarketFetcher();
    const resolutions = await fetchMarketResolutions(['m1', 'm2', 'm3'], { fetcher });

    expect(resolutions.size).toBe(3);
    expect(resolutions.has('m1')).toBe(true);
    expect(resolutions.has('m2')).toBe(true);
    expect(resolutions.has('m3')).toBe(true);
  });

  it('returns empty map for empty market IDs list', async () => {
    const resolutions = await fetchMarketResolutions([]);
    expect(resolutions.size).toBe(0);
  });
});

describe('getResolutionExitPrice', () => {
  it('returns 1.0 when position outcome matches winning outcome', () => {
    const resolution: MarketResolution = {
      marketId: 'test',
      closed: true,
      yesPrice: 1,
      noPrice: 0,
      winningOutcome: 'YES',
    };

    expect(getResolutionExitPrice('YES', resolution)).toBe(1.0);
  });

  it('returns 0.0 when position outcome does not match winning outcome', () => {
    const resolution: MarketResolution = {
      marketId: 'test',
      closed: true,
      yesPrice: 1,
      noPrice: 0,
      winningOutcome: 'YES',
    };

    expect(getResolutionExitPrice('NO', resolution)).toBe(0.0);
  });

  it('returns 0.0 for NO position when market resolved YES', () => {
    const resolution: MarketResolution = {
      marketId: 'test',
      closed: true,
      yesPrice: 1,
      noPrice: 0,
      winningOutcome: 'YES',
    };

    expect(getResolutionExitPrice('NO', resolution)).toBe(0.0);
  });

  it('returns 1.0 for NO position when market resolved NO', () => {
    const resolution: MarketResolution = {
      marketId: 'test',
      closed: true,
      yesPrice: 0,
      noPrice: 1,
      winningOutcome: 'NO',
    };

    expect(getResolutionExitPrice('NO', resolution)).toBe(1.0);
  });

  it('returns undefined when market is not closed', () => {
    const resolution: MarketResolution = {
      marketId: 'test',
      closed: false,
      yesPrice: 0.65,
      noPrice: 0.35,
    };

    expect(getResolutionExitPrice('YES', resolution)).toBeUndefined();
  });

  it('returns undefined when market is closed but winning outcome is unknown', () => {
    const resolution: MarketResolution = {
      marketId: 'test',
      closed: true,
      yesPrice: 0.5,
      noPrice: 0.5,
    };

    expect(getResolutionExitPrice('YES', resolution)).toBeUndefined();
  });
});
