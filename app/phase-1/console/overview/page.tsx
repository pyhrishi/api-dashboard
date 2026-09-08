'use client';

// Phase-1 scope: renders the real /console overview behind the scoped Phase-1 shell,
// with the Phase-1 First-Time-User onboarding (FTUE) surfaced above it.

import RealOverview from '@/app/console/overview/page';
import { Phase1Onboarding } from '../_components/Phase1Onboarding';

export default function Phase1Overview() {
  return (
    <>
      <Phase1Onboarding />
      <RealOverview />
    </>
  );
}
