/**
 * Content-Security-Policy (F-315) — unit tests for the SSOT + report collector.
 */
import {
  buildCspHeader, cspHeaderName, reportToHeader, hardeningHeaders, generateNonce,
  parseViolationReport, CSP_DIRECTIVES, CSP_MODE_COOKIE, CSP_REPORT_GROUP,
} from '@/lib/csp';
import { recordViolations, getCspReportStats, __resetCspReports } from '@/lib/gateway/cspReports';

describe('policy builder', () => {
  it('renders every directive plus report-uri/report-to', () => {
    const p = buildCspHeader();
    for (const d of CSP_DIRECTIVES) expect(p).toContain(d.name);
    expect(p).toContain('report-uri /api/csp-report');
    expect(p).toContain(`report-to ${CSP_REPORT_GROUP}`);
  });

  it('hardens against framing + object injection', () => {
    const p = buildCspHeader();
    expect(p).toContain("frame-ancestors 'none'");
    expect(p).toContain("object-src 'none'");
    expect(p).toContain("base-uri 'self'");
  });

  it('a nonce replaces unsafe-inline in script-src', () => {
    const p = buildCspHeader({ nonce: 'abc123' });
    expect(p).toContain("'nonce-abc123'");
    // the script-src segment must no longer carry 'unsafe-inline'
    const scriptSeg = p.split('; ').find((s) => s.startsWith('script-src'))!;
    expect(scriptSeg).not.toContain("'unsafe-inline'");
    // but style-src still may
    expect(p).toContain("style-src 'self' 'unsafe-inline'");
  });

  it('header name reflects the mode', () => {
    expect(cspHeaderName('enforce')).toBe('Content-Security-Policy');
    expect(cspHeaderName('report-only')).toBe('Content-Security-Policy-Report-Only');
  });

  it('Report-To pairs the group with the collector', () => {
    const rt = JSON.parse(reportToHeader());
    expect(rt.group).toBe(CSP_REPORT_GROUP);
    expect(rt.endpoints[0].url).toBe('/api/csp-report');
  });

  it('hardening headers include nosniff + a referrer policy', () => {
    const h = hardeningHeaders();
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['Referrer-Policy']).toBeTruthy();
  });

  it('exposes a cookie name and a nonce', () => {
    expect(CSP_MODE_COOKIE).toBe('zinbit_csp_mode');
    const n = generateNonce();
    expect(n).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(n.length).toBeGreaterThan(10);
  });
});

describe('violation report parsing', () => {
  it('parses the legacy csp-report shape', () => {
    const v = parseViolationReport({ 'csp-report': { 'document-uri': '/console', 'violated-directive': "script-src 'self'", 'effective-directive': 'script-src', 'blocked-uri': 'https://evil.example/x.js' } });
    expect(v).toHaveLength(1);
    expect(v[0].effectiveDirective).toBe('script-src');
    expect(v[0].blockedUri).toBe('https://evil.example/x.js');
    expect(v[0].documentUri).toBe('/console');
  });

  it('parses a Reporting API batch', () => {
    const v = parseViolationReport([
      { type: 'csp-violation', body: { documentURL: '/console/keys', effectiveDirective: 'img-src', blockedURL: 'https://cdn.evil/pixel.png', disposition: 'enforce' } },
      { type: 'network-error', body: {} },
    ]);
    expect(v).toHaveLength(1);
    expect(v[0].effectiveDirective).toBe('img-src');
    expect(v[0].disposition).toBe('enforce');
  });

  it('never throws on garbage', () => {
    expect(parseViolationReport(null)).toEqual([]);
    expect(parseViolationReport('nope')).toEqual([]);
    expect(parseViolationReport({})).toEqual([]);
    expect(parseViolationReport(42)).toEqual([]);
  });
});

describe('report collector', () => {
  beforeEach(() => __resetCspReports());

  it('is seeded so the feed reads as a running system', () => {
    const s = getCspReportStats();
    expect(s.total).toBeGreaterThan(0);
    expect(s.recent.length).toBeGreaterThan(0);
  });

  it('records new violations at the head and aggregates by directive', () => {
    const before = getCspReportStats().total;
    const parsed = parseViolationReport({ 'csp-report': { 'effective-directive': 'script-src', 'blocked-uri': 'https://a.test/x.js', 'document-uri': '/console' } });
    recordViolations(parsed);
    const after = getCspReportStats();
    expect(after.total).toBe(before + 1);
    expect(after.recent[0].blockedUri).toBe('https://a.test/x.js');
    expect(after.byDirective.find((d) => d.directive === 'script-src')?.count).toBeGreaterThan(0);
  });

  it('topBlocked counts distinct hosts', () => {
    __resetCspReports();
    recordViolations(parseViolationReport({ 'csp-report': { 'effective-directive': 'img-src', 'blocked-uri': 'https://x.test/a.png', 'document-uri': '/' } }));
    recordViolations(parseViolationReport({ 'csp-report': { 'effective-directive': 'img-src', 'blocked-uri': 'https://x.test/a.png', 'document-uri': '/' } }));
    const hit = getCspReportStats().topBlocked.find((b) => b.uri === 'https://x.test/a.png');
    expect(hit?.count).toBe(2);
  });
});
