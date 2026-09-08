/**
 * Risk-based phone OTP at trial activation (F-503) — engine, phone verifier and service tests.
 */
import {
  RISK_CONDITIONS, LOCKED_CONDITIONS, defaultTrialGatePolicy, normalizeTrialGatePatch, applyTrialGatePatch, evaluateTrialRisk,
  seedDirectory, SIGNUP_PERSONAS, domainAgeDays, isIcpIndustry, explainChallenge, emailDomain,
} from '@/lib/auth/trial-gate';
import {
  normalizePhone, maskPhone, classifyLine, verifyPhoneQuality, generateOtp, hashOtp, otpMatches, primaryChannel, nextChannel, simulateDelivery,
  isoFromCountryName, OTP_MAX_ATTEMPTS, OTP_MAX_SENDS_PER_HOUR, PHONE_REJECT_LOCK_THRESHOLD,
} from '@/lib/auth/phone-otp';
import {
  evaluate, createChallenge, resend, verify, override, getPolicy, updatePolicy, getChallengeForAccount, demoInbox, getStats, listEvents,
  listDirectory, abandon, __resetTrialGate,
} from '@/lib/auth/trial-gate-service';

const P = defaultTrialGatePolicy();
const DIR = seedDirectory();
const NOW = Date.parse('2026-09-08T10:00:00Z');
const prof = (email: string, ip: string, extra: Partial<{ referralCode: string; company: string }> = {}) => ({ accountId: `acct_${email}`, email, company: extra.company ?? 'Co', ip, referralCode: extra.referralCode, productId: 'zinbit' });

describe('policy', () => {
  it('six conditions, C2 + C5 locked on; patches clamp and drop, locked stays on', () => {
    expect(RISK_CONDITIONS).toHaveLength(6);
    expect(LOCKED_CONDITIONS.sort()).toEqual(['duplicate_domain', 'low_domain_reputation']);
    const { patch, ignored } = normalizeTrialGatePatch({ conditionsEnabled: { low_domain_reputation: false, small_company: false, bogus: true }, smallCompanyThreshold: 5000, duplicateIpWindowDays: 'x', smsDegradedCountries: ['ng', 'xx1', 'PK'], sharedEgressAllowlist: ['203.0.113.', 'not-an-ip'] });
    expect(patch.conditionsEnabled).toEqual({ small_company: false });
    expect(ignored).toEqual(expect.arrayContaining(['conditionsEnabled.low_domain_reputation (locked on)', 'conditionsEnabled.bogus', 'duplicateIpWindowDays']));
    expect(patch.smallCompanyThreshold).toBe(1000);
    expect(patch.smsDegradedCountries).toEqual(['NG', 'PK']);
    expect(patch.sharedEgressAllowlist).toEqual(['203.0.113.']);
    const next = applyTrialGatePatch(P, { conditionsEnabled: { duplicate_domain: false } as never });
    expect(next.conditionsEnabled.duplicate_domain).toBe(true);
    expect(next.version).toBe(P.version + 1);
  });
});

describe('evaluation', () => {
  it('a clean ICP sign-up activates without a phone', () => {
    const ev = evaluateTrialRisk(prof('anita.rao@zerodha.com', '198.51.100.201'), DIR, P, {}, NOW);
    expect(ev.decision).toBe('allow');
    expect(ev.tripped).toEqual([]);
    expect(ev.inputs.companyName).toBeTruthy();
    expect(ev.inputs.icpIndustry).toBe(true);
  });

  it('free-mail trips non-ICP (and not C5, which ignores personal domains)', () => {
    const ev = evaluateTrialRisk(prof('kavya.s+dev@gmail.com', '203.0.113.9'), DIR, P, {}, NOW);
    expect(ev.decision).toBe('challenge');
    expect(ev.tripped).toContain('non_icp');
    expect(ev.tripped).not.toContain('duplicate_domain');
    expect(ev.inputs.personalDomain).toBe(true);
    expect(explainChallenge(ev)).toMatch(/phone check because of/);
  });

  it('duplicate domain and duplicate IP are found in the shared directory; churned and allow-listed do not count', () => {
    const dup = evaluateTrialRisk(prof('priya.nair@meridianlabs.in', '203.0.113.77'), DIR, P, {}, NOW);
    expect(dup.tripped).toContain('duplicate_domain');
    expect(dup.inputs.domainMatches).toEqual(['acct_ml_001']);
    const churned = evaluateTrialRisk(prof('new@contoso-trading.com', '192.0.2.1'), DIR, P, {}, NOW);
    expect(churned.tripped).not.toContain('duplicate_domain');
    const ip = evaluateTrialRisk(prof('sam@quietharbor.co', '203.0.113.42'), DIR, P, {}, NOW);
    expect(ip.tripped).toContain('duplicate_ip');
    expect(ip.inputs.ipMatches.sort()).toEqual(['acct_fx_001', 'acct_ml_001']);
    const allowed = evaluateTrialRisk(prof('sam@quietharbor.co', '203.0.113.42'), DIR, { ...P, sharedEgressAllowlist: ['203.0.113.'] }, {}, NOW);
    expect(allowed.tripped).not.toContain('duplicate_ip');
    expect(allowed.inputs.ipAllowlisted).toBe(true);
    // Outside the look-back window the IP match disappears.
    const old = evaluateTrialRisk(prof('sam@quietharbor.co', '203.0.113.42'), DIR, { ...P, duplicateIpWindowDays: 1 }, {}, NOW);
    expect(old.tripped).not.toContain('duplicate_ip');
  });

  it('disposable domains trip low reputation; small companies trip C4 unless a referral waives it; exemptions win', () => {
    const disp = evaluateTrialRisk(prof('x9f2@mailinator.com', '192.0.2.200'), DIR, P, {}, NOW);
    expect(disp.tripped).toContain('low_domain_reputation');
    const small = evaluateTrialRisk(prof('dev@tinyshop-local.io', '192.0.2.201'), DIR, { ...P, smallCompanyThreshold: 1000 }, {}, NOW);
    if (small.inputs.headcount !== null) {
      expect(small.tripped).toContain('small_company');
      const waived = evaluateTrialRisk(prof('dev@tinyshop-local.io', '192.0.2.201', { referralCode: 'APOLLO2026' }), DIR, { ...P, smallCompanyThreshold: 1000 }, {}, NOW);
      expect(waived.tripped).not.toContain('small_company');
    }
    const paid = evaluateTrialRisk(prof('x9f2@mailinator.com', '192.0.2.200'), DIR, P, { paymentVerified: true }, NOW);
    expect(paid.decision).toBe('exempt');
    expect(paid.exemptReason).toBe('payment_verified');
  });

  it('disabling a non-locked condition removes it from the decision; helpers are deterministic', () => {
    const off = { ...P, conditionsEnabled: { ...P.conditionsEnabled, non_icp: false, domain_unmapped: false } };
    const ev = evaluateTrialRisk(prof('kavya.s+dev@gmail.com', '203.0.113.9'), DIR, off, {}, NOW);
    expect(ev.tripped).not.toContain('non_icp');
    expect(ev.conditions.find((c) => c.id === 'non_icp')).toMatchObject({ enabled: false, tripped: true });
    expect(domainAgeDays('northwind.io')).toBe(domainAgeDays('northwind.io'));
    expect(isIcpIndustry('B2B SaaS')).toBe(true);
    expect(isIcpIndustry('Restaurants')).toBe(false);
    expect(emailDomain('A@Example.COM')).toBe('example.com');
    expect(SIGNUP_PERSONAS.length).toBeGreaterThanOrEqual(5);
  });
});

describe('phone verifier + OTP primitives', () => {
  it('normalizes national and international input, masks, and infers country', () => {
    expect(normalizePhone('98450 12345', 'IN')?.e164).toBe('+919845012345');
    expect(normalizePhone('+1 (415) 555-2671', 'IN')).toMatchObject({ e164: '+14155552671', iso: 'US' });
    expect(normalizePhone('0044 7911 123456', 'IN')?.iso).toBe('GB');
    expect(normalizePhone('12', 'IN')).toBeNull();
    expect(maskPhone('+919845012345')).toBe('+91 ••••••••45');
    expect(isoFromCountryName('India')).toBe('IN');
    expect(isoFromCountryName('Atlantis')).toBe('IN');
  });

  it('classifies fictional, VoIP, temp-provider and landline numbers; mobiles pass', () => {
    expect(classifyLine(normalizePhone('+1 212 555 0123', 'US')!).lineType).toBe('fictional');
    expect(classifyLine(normalizePhone('+1 500 123 4567', 'US')!).lineType).toBe('voip');
    expect(classifyLine(normalizePhone('07700 900123', 'GB')!).lineType).toBe('fictional');
    expect(classifyLine(normalizePhone('070 1234 5678', 'GB')!).lineType).toBe('voip');
    expect(classifyLine(normalizePhone('99999 12345', 'IN')!).lineType).toBe('temp_provider');
    expect(classifyLine(normalizePhone('1111111111', 'IN')!).lineType).toBe('temp_provider');
    expect(classifyLine(normalizePhone('020 7946 0958', 'GB')!).lineType).toBe('landline');
    const mobile = normalizePhone('98450 12345', 'IN')!;
    expect(verifyPhoneQuality(mobile, { reusedByOther: false, denylisted: false }).ok).toBe(true);
    expect(verifyPhoneQuality(mobile, { reusedByOther: true, denylisted: false })).toMatchObject({ ok: false, reason: 'reused' });
    expect(verifyPhoneQuality(normalizePhone('020 7946 0958', 'GB')!, { reusedByOther: false, denylisted: false }, 'sms')).toMatchObject({ ok: false, reason: 'landline' });
    expect(verifyPhoneQuality(normalizePhone('020 7946 0958', 'GB')!, { reusedByOther: false, denylisted: false }, 'voice').ok).toBe(true);
  });

  it('OTP is 6 digits, deterministic per seed, hashed with constant-time compare; channels fall back in order', () => {
    const code = generateOtp('s', 'chl_1:1');
    expect(code).toMatch(/^\d{6}$/);
    expect(generateOtp('s', 'chl_1:1')).toBe(code);
    expect(generateOtp('s', 'chl_1:2')).not.toBe(code);
    expect(otpMatches(code, 'salt', hashOtp(code, 'salt'))).toBe(true);
    expect(otpMatches('000000', 'salt', hashOtp(code, 'salt'))).toBe(code === '000000');
    expect(nextChannel('sms')).toBe('whatsapp');
    expect(nextChannel('whatsapp')).toBe('voice');
    expect(nextChannel('voice')).toBeNull();
    expect(primaryChannel('NG', ['NG'])).toBe('whatsapp');
    expect(primaryChannel('IN', ['NG'])).toBe('sms');
    const p = normalizePhone('98450 12399', 'IN')!;
    expect(simulateDelivery('sms', p, []).status).toBe('failed');
    expect(simulateDelivery('whatsapp', p, []).status).toBe('delivered');
    expect(simulateDelivery('sms', normalizePhone('98450 12345', 'IN')!, ['IN']).status).toBe('failed');
    expect(simulateDelivery('voice', p, []).status).toBe('delivered');
  });
});

describe('service — end to end', () => {
  beforeEach(() => __resetTrialGate());

  it('clean sign-up: evaluate → allow → activated in the directory, no challenge', () => {
    const ev = evaluate({ ...prof('anita.rao@zerodha.com', '198.51.100.201'), accountId: 'acct_clean' }, NOW);
    expect(ev.decision).toBe('allow');
    expect(getChallengeForAccount('acct_clean')).toBeNull();
    expect(listDirectory().find((a) => a.id === 'acct_clean')?.activatedAt).toBeTruthy();
    expect(listEvents().map((e) => e.name)).toEqual(expect.arrayContaining(['trial_risk_evaluated', 'trial_activated']));
  });

  it('flagged sign-up: temp number rejected, real number gets SMS, wrong code counts attempts, right code verifies and activates', () => {
    const ev = evaluate({ ...prof('kavya.s+dev@gmail.com', '203.0.113.9'), accountId: 'acct_flag' }, NOW);
    expect(ev.decision).toBe('challenge');
    const bad = createChallenge({ accountId: 'acct_flag', evaluationId: ev.id, phone: '99999 12345', country: 'IN' }, NOW);
    expect(bad).toMatchObject({ ok: false, error: { code: 'PHONE_REJECTED', reason: 'temp_provider' } });
    const good = createChallenge({ accountId: 'acct_flag', evaluationId: ev.id, phone: '98450 12345', country: 'IN' }, NOW + 1000);
    expect(good.ok).toBe(true);
    if (!good.ok) return;
    expect(good.data.send.channel).toBe('sms');
    expect(good.data.send.deliveryStatus).toBe('delivered');
    expect(good.data.challenge.phoneMasked).toBe('+91 ••••••••45');
    expect(JSON.stringify(good.data.challenge)).not.toContain('9845012345');
    const inbox = demoInbox(good.data.challenge.id);
    expect(inbox[0].code).toMatch(/^\d{6}$/);
    const wrong = verify(good.data.challenge.id, '000000', NOW + 2000);
    expect(wrong).toMatchObject({ ok: false, error: { code: 'CODE_INVALID', attemptsLeft: OTP_MAX_ATTEMPTS - 1 } });
    const right = verify(good.data.challenge.id, inbox[0].code as string, NOW + 3000);
    expect(right.ok).toBe(true);
    expect(getChallengeForAccount('acct_flag')?.state).toBe('verified');
    expect(listDirectory().find((a) => a.id === 'acct_flag')?.activatedAt).toBeTruthy();
    // Verified once → never re-challenged.
    expect(evaluate({ ...prof('kavya.s+dev@gmail.com', '203.0.113.9'), accountId: 'acct_flag' }, NOW + 4000).decision).toBe('exempt');
    // The same number cannot verify another account within the reuse window.
    const ev2 = evaluate({ ...prof('other@gmail.com', '203.0.113.10'), accountId: 'acct_other' }, NOW + 5000);
    expect(createChallenge({ accountId: 'acct_other', evaluationId: ev2.id, phone: '98450 12345', country: 'IN' }, NOW + 6000)).toMatchObject({ ok: false, error: { code: 'PHONE_REJECTED', reason: 'reused' } });
  });

  it('SMS failure → fallback to WhatsApp → voice; earlier codes are invalidated; send limit enforced', () => {
    const ev = evaluate({ ...prof('kavya.s+dev@gmail.com', '203.0.113.9'), accountId: 'acct_fb' }, NOW);
    const c = createChallenge({ accountId: 'acct_fb', evaluationId: ev.id, phone: '98450 12399', country: 'IN' }, NOW);
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.data.send).toMatchObject({ channel: 'sms', deliveryStatus: 'failed' });
    const wa = resend(c.data.challenge.id, undefined, NOW + 5000);
    expect(wa.ok && wa.data).toMatchObject({ channel: 'whatsapp', fallbackFrom: 'sms', deliveryStatus: 'delivered' });
    expect(wa.ok && wa.data.fallbackReason).toMatch(/delivery_failed/);
    const voice = resend(c.data.challenge.id, 'voice', NOW + 10_000);
    expect(voice.ok && voice.data).toMatchObject({ channel: 'voice', fallbackFrom: 'whatsapp', fallbackReason: 'user_choice' });
    // The WhatsApp code is now invalid; only the latest (voice) code works.
    const inbox = demoInbox(c.data.challenge.id);
    expect(inbox).toHaveLength(3);
    const voiceCode = inbox[2].code as string;
    expect(verify(c.data.challenge.id, voiceCode, NOW + 11_000).ok).toBe(true);
    expect(getStats(NOW + 12_000).fallbacks).toBe(2);
    // Send limit: a fresh challenge can only send OTP_MAX_SENDS_PER_HOUR codes per hour.
    const ev2 = evaluate({ ...prof('two@gmail.com', '203.0.113.11'), accountId: 'acct_lim' }, NOW);
    const c2 = createChallenge({ accountId: 'acct_lim', evaluationId: ev2.id, phone: '98450 12346', country: 'IN' }, NOW);
    expect(c2.ok).toBe(true);
    if (!c2.ok) return;
    for (let i = 1; i < OTP_MAX_SENDS_PER_HOUR; i++) expect(resend(c2.data.challenge.id, 'sms', NOW + i * 1000).ok).toBe(true);
    expect(resend(c2.data.challenge.id, 'sms', NOW + 9000)).toMatchObject({ ok: false, error: { code: 'SEND_LIMIT' } });
  });

  it('three rejected numbers lock the challenge for 24h; support override allows with a reason; policy PATCH is floor-clamped', () => {
    const ev = evaluate({ ...prof('kavya.s+dev@gmail.com', '203.0.113.9'), accountId: 'acct_lock' }, NOW);
    const nums = ['99999 12345', '1111111111', '2222222222'];
    let last: ReturnType<typeof createChallenge> | null = null;
    nums.forEach((n, i) => { last = createChallenge({ accountId: 'acct_lock', evaluationId: ev.id, phone: n, country: 'IN' }, NOW + i * 1000); });
    expect(last).toMatchObject({ ok: false, error: { code: 'PHONE_LOCKED' } });
    expect(getChallengeForAccount('acct_lock')?.state).toBe('locked');
    expect(getStats(NOW).phoneRejections).toBe(PHONE_REJECT_LOCK_THRESHOLD);
    expect(override('acct_lock', 'allow', 'support@zintlr.com', 'no', 'zinbit', NOW)).toMatchObject({ ok: false });
    const o = override('acct_lock', 'allow', 'support@zintlr.com', 'Verified on a support call, ticket #4821', 'zinbit', NOW + 5000);
    expect(o.ok).toBe(true);
    expect(getChallengeForAccount('acct_lock')).toMatchObject({ state: 'verified', overrideId: o.ok ? o.data.id : '' });
    expect(listDirectory().find((a) => a.id === 'acct_lock')?.activatedAt).toBeTruthy();
    const upd = updatePolicy('zinbit', { conditionsEnabled: { duplicate_domain: false, small_company: false }, smallCompanyThreshold: 50 }, NOW);
    expect(upd.policy.conditionsEnabled.duplicate_domain).toBe(true);
    expect(upd.policy.conditionsEnabled.small_company).toBe(false);
    expect(upd.policy.smallCompanyThreshold).toBe(50);
    expect(upd.ignored).toContain('conditionsEnabled.duplicate_domain (locked on)');
    expect(getPolicy('zinbit').version).toBe(2);
    expect(getPolicy('zintlr-intent').version).toBe(1); // per product
  });

  it('abandon closes a pending challenge; simulate evaluates without registering', () => {
    const ev = evaluate({ ...prof('kavya.s+dev@gmail.com', '203.0.113.9'), accountId: 'acct_ab' }, NOW);
    const c = createChallenge({ accountId: 'acct_ab', evaluationId: ev.id, phone: '98450 12345', country: 'IN' }, NOW);
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(abandon(c.data.challenge.id, NOW + 1000)?.state).toBe('abandoned');
    const before = listDirectory().length;
    const sim = evaluate({ ...prof('sim@gmail.com', '203.0.113.9'), accountId: 'sim_x', simulate: true }, NOW);
    expect(sim.decision).toBe('challenge');
    expect(listDirectory().length).toBe(before);
    expect(getChallengeForAccount('sim_x')).toBeNull();
  });
});
