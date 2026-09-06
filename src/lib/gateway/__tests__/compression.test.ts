import {
  negotiateEncoding, compressPayload, recordCompression, getCompressionStats,
  MIN_COMPRESS_BYTES, __resetCompression,
} from '@/lib/gateway/compression';
import { gunzipSync, brotliDecompressSync } from 'zlib';

const bigJson = () => JSON.stringify({ items: Array.from({ length: 100 }).map((_, i) => ({ id: i, name: `Employee Number ${i}`, department: 'Engineering' })) });

describe('payload compression (F-080)', () => {
  beforeEach(() => __resetCompression());

  describe('negotiateEncoding', () => {
    it('prefers brotli, then gzip, else identity', () => {
      expect(negotiateEncoding('br, gzip')).toBe('br');
      expect(negotiateEncoding('gzip, deflate')).toBe('gzip');
      expect(negotiateEncoding('deflate')).toBe('identity');
      expect(negotiateEncoding('')).toBe('identity');
      expect(negotiateEncoding(null)).toBe('identity');
    });
    it('does not mistake "brotli"-less tokens for br', () => {
      expect(negotiateEncoding('gzip;q=1.0')).toBe('gzip');
    });
  });

  describe('compressPayload', () => {
    it('brotli-compresses a large payload and it round-trips', () => {
      const json = bigJson();
      const r = compressPayload(json, 'br');
      expect(r.encoding).toBe('br');
      expect(r.compressedBytes).toBeLessThan(r.originalBytes);
      expect(r.savedPct).toBeGreaterThan(0);
      expect(r.ratio).toBeLessThan(1);
      const restored = brotliDecompressSync(Buffer.from(r.body as Uint8Array)).toString('utf8');
      expect(restored).toBe(json);
    });

    it('gzip-compresses and round-trips', () => {
      const json = bigJson();
      const r = compressPayload(json, 'gzip');
      expect(r.encoding).toBe('gzip');
      const restored = gunzipSync(Buffer.from(r.body as Uint8Array)).toString('utf8');
      expect(restored).toBe(json);
    });

    it('leaves tiny payloads uncompressed (below the threshold)', () => {
      const small = JSON.stringify({ ok: true });
      expect(small.length).toBeLessThan(MIN_COMPRESS_BYTES);
      const r = compressPayload(small, 'br');
      expect(r.encoding).toBe('identity');
      expect(r.body).toBe(small);
      expect(r.savedBytes).toBe(0);
      expect(r.ratio).toBe(1);
    });

    it('identity encoding is a passthrough', () => {
      const json = bigJson();
      const r = compressPayload(json, 'identity');
      expect(r.encoding).toBe('identity');
      expect(r.compressedBytes).toBe(r.originalBytes);
    });

    it('is deterministic for the same input', () => {
      const json = bigJson();
      expect(compressPayload(json, 'br')).toEqual(compressPayload(json, 'br'));
    });
  });

  describe('stats registry', () => {
    it('accumulates savings and computes an overall ratio', () => {
      __resetCompression();
      const json = bigJson();
      const r = compressPayload(json, 'br');
      recordCompression(r);
      recordCompression(compressPayload(json, 'gzip'));
      recordCompression({ encoding: 'identity', originalBytes: 50, compressedBytes: 50 });
      const stats = getCompressionStats();
      expect(stats.total_responses).toBeGreaterThanOrEqual(3);
      expect(stats.compressed_responses).toBeGreaterThanOrEqual(2);
      expect(stats.total_saved_bytes).toBeGreaterThan(0);
      expect(stats.avg_ratio).toBeLessThan(1);
      const br = stats.by_encoding.find((e) => e.encoding === 'br')!;
      expect(br.saved_bytes).toBeGreaterThan(0);
    });

    it('seeds demo history so the console is populated on first load', () => {
      __resetCompression();
      const stats = getCompressionStats();
      expect(stats.total_saved_bytes).toBeGreaterThan(0);
      expect(stats.by_encoding.length).toBe(3);
    });
  });
});
