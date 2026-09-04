# CI workflow (pending activation)

`ci/ci.yml` is the project's CI pipeline (tsc · lint · unit · build · Playwright e2e).

It lives here instead of `.github/workflows/` because the push token in this repo's
remote lacks the GitHub `workflow` scope, so it cannot create files under
`.github/workflows/`. To activate CI, do **one** of:

1. **Grant scope, then move it:** give the token the `workflow` scope, then
   `git mv ci/ci.yml .github/workflows/ci.yml && git commit && git push`.
2. **Add via the GitHub web UI:** create `.github/workflows/ci.yml` on github.com and
   paste the contents of `ci/ci.yml` (the web UI uses your account's scope).
