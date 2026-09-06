import { createAsyncJob, getAsyncJob, listAsyncJobs, cancelAsyncJob } from '@/lib/gateway/asyncJobs';

// A well-formed sandbox key — billing lazily provisions it with credits.
const KEY = 'sk_test_asyncjobs_unit_0001';

describe('async job endpoints (F-060)', () => {
  it('rejects an empty or non-array input list', () => {
    expect(createAsyncJob({ apiKey: KEY, endpoint: 'people-search', inputs: [] })).toMatchObject({ success: false, code: 'INVALID_PARAMETERS' });
    expect(createAsyncJob({ apiKey: KEY, endpoint: 'people-search', inputs: 'nope' })).toMatchObject({ success: false });
  });

  it('rejects an oversized job', () => {
    const huge = Array.from({ length: 10_001 }, (_, i) => `u${i}@acme.com`);
    expect(createAsyncJob({ apiKey: KEY, endpoint: 'people-search', inputs: huge })).toMatchObject({ success: false, code: 'JOB_TOO_LARGE' });
  });

  it('creates a job that starts queued and charges one credit per input', () => {
    const res = createAsyncJob({ apiKey: KEY, endpoint: 'people-search', inputs: ['a@acme.com', 'b@acme.com', 'c@acme.com'] });
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.job.status).toBe('queued');
    expect(res.job.total).toBe(3);
    expect(res.job.credits_charged).toBe(3);
    expect(res.job.processed).toBe(0);
    expect(res.job.id).toMatch(/^job_/);
  });

  it('advances deterministically from elapsed time and completes', () => {
    const res = createAsyncJob({ apiKey: KEY, endpoint: 'people-search', inputs: ['x@acme.com', 'y@acme.com'] });
    if (!res.success) throw new Error('create failed');
    const id = res.job.id;
    // Rewind created_at by pretending time passed: poll after faking elapsed via a spy.
    const realNow = Date.now;
    try {
      Date.now = () => realNow() + 10_000; // 10s later → well past 2 rows at 3/s
      const done = getAsyncJob(id)!;
      expect(done.status).toBe('completed');
      expect(done.processed).toBe(2);
      expect(done.progress).toBe(1);
      expect(done.results?.length).toBe(2);
    } finally {
      Date.now = realNow;
    }
  });

  it('lists a key\'s jobs newest-first and 404s an unknown id', () => {
    createAsyncJob({ apiKey: KEY, endpoint: 'company-enrich', inputs: ['stripe.com'] });
    const jobs = listAsyncJobs(KEY);
    expect(jobs.length).toBeGreaterThan(0);
    // company-enrich jobs are classified as the companies kind.
    expect(jobs.some((j) => j.kind === 'companies')).toBe(true);
    expect(getAsyncJob('job_nope')).toBeNull();
  });

  it('cancels an in-flight job and refuses to cancel a completed one', () => {
    const res = createAsyncJob({ apiKey: KEY, endpoint: 'people-search', inputs: ['q@acme.com', 'r@acme.com'] });
    if (!res.success) throw new Error('create failed');
    const id = res.job.id;
    const cancelled = cancelAsyncJob(id);
    expect(cancelled.success).toBe(true);
    if (cancelled.success) expect(cancelled.job.status).toBe('cancelled');

    // A completed job cannot be cancelled.
    const res2 = createAsyncJob({ apiKey: KEY, endpoint: 'people-search', inputs: ['s@acme.com'] });
    if (!res2.success) throw new Error('create failed');
    const realNow = Date.now;
    try {
      Date.now = () => realNow() + 10_000;
      const after = cancelAsyncJob(res2.job.id);
      expect(after.success).toBe(false);
      if (!after.success) expect(after.code).toBe('JOB_ALREADY_COMPLETED');
    } finally {
      Date.now = realNow;
    }
  });
});
