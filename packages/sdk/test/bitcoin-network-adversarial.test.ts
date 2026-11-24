import { describe, expect, it, vi } from 'vitest';
import { fetchWithRetry, readEsploraBody, getAddressStats } from '../src/bitcoin/esplora.js';

describe('Bitcoin indexer resource and cancellation boundaries', () => {
  it.each([
    { retries: -1 },
    { retries: 6 },
    { retries: Infinity },
    { retries: 0.5 },
    { backoffMs: -1 },
    { backoffMs: Infinity },
    { timeoutMs: 0 },
    { timeoutMs: NaN },
    { timeoutMs: 60_001 },
  ])('rejects invalid limits before contacting a provider %#', async (options) => {
    const fetchImpl = vi.fn();
    await expect(fetchWithRetry('https://invalid.test', { ...options, fetchImpl })).rejects.toThrow(
      'limits',
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it.each([429, 500, 503, 400, 404])(
    'cancels HTTP %s bodies before retry/failure',
    async (status) => {
      const cancel = vi.fn();
      const fetchImpl = vi.fn(async () => new Response(new ReadableStream({ cancel }), { status }));
      await expect(
        fetchWithRetry('https://invalid.test', { retries: 1, backoffMs: 0, fetchImpl }),
      ).rejects.toThrow();
      expect(cancel).toHaveBeenCalledTimes(status === 429 || status >= 500 ? 2 : 1);
    },
  );
  it('propagates cancellation after headers to a stalled body', async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    const body = new ReadableStream({ cancel });
    const fetchImpl = vi.fn(async () => new Response(body));
    const pending = getAddressStats('test', undefined, { fetchImpl, signal: controller.signal });
    setTimeout(() => controller.abort(), 10);
    await expect(pending).rejects.toThrow('aborted');
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('releases a stalled body on its deadline', async () => {
    const cancel = vi.fn();
    await expect(
      readEsploraBody(new Response(new ReadableStream({ cancel })), 100, 10),
    ).rejects.toThrow('timed out');
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('bounds accumulated chunks and rejects invalid UTF-8', async () => {
    const response = new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array(5));
          c.enqueue(new Uint8Array(6));
          c.close();
        },
      }),
    );
    await expect(readEsploraBody(response, 10)).rejects.toThrow('size limit');
    await expect(readEsploraBody(new Response(new Uint8Array([0xff])))).rejects.toThrow();
  });
  it.each([0, -1, 8_000_001, NaN, Infinity])('rejects invalid body limit %s', async (limit) => {
    await expect(readEsploraBody(new Response('x'), limit)).rejects.toThrow('limits');
  });
});
