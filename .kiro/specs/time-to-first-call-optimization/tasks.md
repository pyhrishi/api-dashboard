# Implementation Plan: Time-to-First-Call Optimization

## Overview

This implementation plan breaks down the Time-to-First-Call Optimization feature into discrete, sequential tasks. The feature guides developers from signup to their first successful API call within 2 minutes through progressive onboarding, an embedded request builder, and celebratory feedback. The implementation follows a logical dependency order: infrastructure → components → pages → integration → testing.

## Implementation Strategy

The feature is built on Next.js 14 + React 18 with Zustand for state management, Framer Motion for animations, and Tailwind CSS for styling. All 40 correctness properties from the design are validated through property-based tests and unit tests integrated alongside implementation tasks.

---

## Tasks

### Phase 1: Infrastructure & Core Setup

- [ ] 1. Extend Zustand store with FirstCallState
  - Add FirstCallState interface with all required fields: completedOnboardingSteps, isFirstCallMade, firstCallTimestamp, currentWizardStep, selectedEndpointId, configuredParameters, lastRequestDetails
  - Add all 6 state actions: markOnboardingStepComplete, markFirstCallMade, updateWizardStep, updateSelectedEndpoint, updateConfiguredParameters, resetWizard
  - Configure localStorage persistence with key `first-call-state`
  - Export useStore hook with both AppState and FirstCallState merged
  - _Requirements: 1.5, 8.1, 8.3, 8.4_

  - [ ]* 1.1 Write property tests for Zustand store state actions
    - **Property 3: Automatic First Call Marking** — Verify status 200-299 responses mark "First Call" step complete
    - **Property 31: Celebration Idempotency - No Duplicate Modals** — Verify marking happens only once
    - **Property 33: Timestamp Persistence** — Verify timestamps persist across browser sessions
    - _Validates: Requirements 8.1, 8.3, 8.4_

- [ ] 2. Define endpoint metadata structure
  - Create `src/data/endpoints.ts` with Endpoint, EndpointParameter, and NextStepRecommendation types
  - Define all 12 endpoints with complete metadata (id, name, description, method, path, credit cost, isRecommendedForFirstCall, parameters, nextStepRecommendations)
  - Implement People Search as primary endpoint with email, first_name, last_name parameters (email required)
  - Implement validation rules for each parameter type (email, phone, string, number)
  - Define nextStepRecommendations for each endpoint (SDKs, logging, webhooks, error handling)
  - _Requirements: 2.1, 3.1, 3.4, 3.5, 6.1, 6.3_

  - [ ]* 2.1 Write property tests for endpoint metadata
    - **Property 5: Endpoint Listing** — Verify all 12 endpoints present in selector
    - **Property 6: HTTP Method Selection** — Verify GET and POST methods available
    - **Property 7: Endpoint-Specific Parameters** — Verify parameters match endpoint definitions
    - **Property 18: Credit Cost Display** — Verify credit costs render correctly
    - _Validates: Requirements 2.1, 2.2, 2.3, 3.5_

- [ ] 3. Implement validation system
  - Create `src/lib/validation.ts` with validateParameter function
  - Implement type-specific validators: email, phone, string, number
  - Support required/optional checks, length limits, range limits, custom validation
  - Return error messages with specific, actionable guidance
  - _Requirements: 9.1, 9.2, 9.3_

  - [ ]* 3.1 Write property tests for validation functions
    - **Property 11: Required Parameter Validation** — Verify missing required params blocked
    - **Property 34: Parameter-Specific Error Messages** — Verify error messages are specific
    - **Property 35: Error Message Clearing** — Verify errors clear on correction
    - _Validates: Requirements 9.1, 9.3, 9.4_

- [ ] 4. Implement code sample generation system
  - Create `src/lib/codeSampleGenerator.ts` with CodeSample interface
  - Implement generateCodeSamples function for cURL, Python, Node.js
  - Support GET and POST methods with proper query strings and request bodies
  - Include Authorization header with sk_test_ API key
  - Generate syntactically correct code with proper error handling structure
  - _Requirements: 2.6, 2.7, 10.1, 10.2, 10.3, 10.4, 10.5_

  - [ ]* 4.1 Write property tests for code sample generation
    - **Property 8: Authorization Header Inclusion** — Verify sk_test_ key in all samples
    - **Property 9: Code Sample Generation** — Verify all 3 languages generated
    - **Property 36: Code Sample Syntax Validity** — Verify correct syntax in each language
    - **Property 37: cURL Sample Completeness** — Verify all headers/auth/body in cURL
    - **Property 38: Python Sample Completeness** — Verify requests import and error handling
    - **Property 39: Node.js Sample Completeness** — Verify axios/fetch and error handling
    - **Property 40: Reactive Code Generation** — Verify samples update on parameter change
    - _Validates: Requirements 2.6, 10.2, 10.3, 10.4, 10.5_

- [ ] 5. Implement sandbox API integration
  - Create `src/lib/sandboxAPI.ts` with callSandboxAPI function
  - Validate API key is sk_test_ prefixed (never sk_live_)
  - Route all requests to sandbox environment
  - Support GET with query parameters and POST with request body
  - Return response with status code, data, and response time in milliseconds
  - Handle network errors, validation errors, and server errors gracefully
  - Set 10-second request timeout
  - _Requirements: 2.9, 2.11, 2.12, 7.1, 7.2_

  - [ ]* 5.1 Write property tests for sandbox API integration
    - **Property 12: Sandbox API Isolation** — Verify sk_test_ key enforced, sk_live_ rejected
    - **Property 13: Response Metadata Display** — Verify status code and latency in milliseconds
    - _Validates: Requirements 7.1, 2.9_

---

### Phase 2: Core Components

- [ ] 6. Create RequestBuilder component and sub-components
  - Create `src/components/RequestBuilder.tsx` as main component with full/preview/review modes
  - Props: mode, preselectedEndpointId, onExecute, onStepChange, hideExecuteButton, disableEditing
  - Create RequestBuilder state: selectedEndpointId, configuredParameters, errors, loading, response, activeCodeTab
  - Implement EndpointSelector sub-component with dropdown, description, credit cost, recommended badge
  - Implement ParameterInputs sub-component with dynamic form fields per endpoint
  - Implement CodeSampleTabs sub-component with cURL/Python/Node.js tabs, copy buttons, syntax highlighting
  - Implement ResponseViewer sub-component with JSON highlighting, status code, latency display
  - All sub-components should be self-contained within RequestBuilder file or as small separate files
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.13, 2.14_

  - [ ]* 6.1 Write unit tests for RequestBuilder component
    - Test endpoint selector displays all 12 endpoints
    - Test parameter fields match selected endpoint
    - Test validation prevents submission with missing required fields
    - Test copy-to-clipboard functionality for code samples
    - Test response display on successful request
    - _Requirements: 2.1, 2.5, 2.9, 2.13_

  - [ ]* 6.2 Write property tests for RequestBuilder
    - **Property 1: Checklist Step Order** — N/A (not applicable to RequestBuilder)
    - **Property 7: Endpoint-Specific Parameters** — Verify parameter fields match endpoint
    - **Property 9: Code Sample Generation** — Verify all 3 languages generated
    - **Property 11: Required Parameter Validation** — Verify validation blocks incomplete requests
    - **Property 14: Responsive Layout** — Verify side-by-side on desktop, stacked on mobile
    - **Property 40: Reactive Code Generation** — Verify code samples update on parameter change
    - _Validates: Requirements 2.3, 2.9, 2.15_

- [ ] 7. Create OnboardingChecklist component
  - Create `src/components/OnboardingChecklist.tsx` with compact/full modes
  - Display 4 steps in order: Signup, API Key, First Call, Explore More
  - Show green checkmark for completed steps, hollow circle for incomplete
  - Auto-mark steps based on Zustand state subscriptions
  - Responsive: horizontal on desktop, vertical on mobile
  - Implement close button for dismissal (state persists)
  - "Explore More" becomes clickable after "First Call" complete (links to /console)
  - Persist visible state across all console pages
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 1.7_

  - [ ]* 7.1 Write unit tests for OnboardingChecklist
    - Test 4 steps display in correct order
    - Test checkmark displays for completed steps
    - Test hollow circle displays for incomplete steps
    - Test "Explore More" becomes clickable after "First Call" complete
    - Test responsive layout switches at 768px breakpoint
    - _Requirements: 1.1, 1.2, 1.3, 1.7_

  - [ ]* 7.2 Write property tests for OnboardingChecklist
    - **Property 1: Checklist Step Order** — Verify steps in exact order
    - **Property 2: Step Completion Indicator** — Verify checkmarks/circles per state
    - **Property 4: Explore More Activation** — Verify clickable after "First Call" complete
    - _Validates: Requirements 1.1, 1.2, 1.3, 1.7_

- [ ] 8. Create CelebrationModal component
  - Create `src/components/CelebrationModal.tsx` as portal/overlay component
  - Display success message: "🎉 Your First API Call Succeeded!"
  - Show request metadata: endpoint name, status code, response time in milliseconds
  - Display response preview: first 200 characters with syntax highlighting
  - Include 3 next-step buttons: "Explore Webhooks", "Try Another Endpoint", "View Documentation"
  - Implement confetti animation using Framer Motion (3-5 seconds)
  - Dismissible by close button or click outside modal
  - Focus trap inside modal, restore focus on close
  - Only display once per first successful call (idempotency check)
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.1, 6.2, 8.2, 8.3_

  - [ ]* 8.1 Write unit tests for CelebrationModal
    - Test success message displays
    - Test request metadata shown (endpoint, status, latency)
    - Test response preview displays first 200 characters
    - Test 3 next-step buttons present and clickable
    - Test close button dismisses modal
    - Test clicking outside dismisses modal
    - _Requirements: 5.3, 5.4, 5.5, 5.6, 5.7_

  - [ ]* 8.2 Write property tests for CelebrationModal
    - **Property 24: Celebration Modal Display** — Verify shows on first successful call
    - **Property 25: Celebration Modal Content** — Verify all required content present
    - **Property 26: Celebration Modal Next Steps** — Verify 3 clickable links present
    - **Property 28: Endpoint-Specific Recommendations** — Verify 3-4 recommendations shown
    - **Property 31: Celebration Idempotency - No Duplicate Modals** — Verify not shown on subsequent calls
    - **Property 32: Celebration Idempotency - Persistence Across Refresh** — Verify not shown after refresh
    - _Validates: Requirements 5.1, 5.2, 5.3, 8.2, 8.3_

---

### Phase 3: Pages & Routing

- [ ] 9. Create FirstCallWizard page
  - Create `src/app/console/first-call/page.tsx` (client component)
  - Implement 4-step wizard: SelectEndpoint → ConfigureParameters → ReviewAndExecute → Success
  - Step 1 (SelectEndpoint):
    - Display all 12 endpoints with descriptions
    - Pre-select People Search (recommended)
    - Show credit cost per endpoint
    - Inline RequestBuilder preview (readonly mode)
    - Next button disabled until endpoint selected
  - Step 2 (ConfigureParameters):
    - RequestBuilder in full mode with parameter form
    - Show all required fields prominently
    - Mark optional fields clearly
    - Inline validation with error messages
    - Next button disabled until all required fields valid
  - Step 3 (ReviewAndExecute):
    - RequestBuilder in review mode showing full request details
    - Display endpoint, method, URL, headers, parameters
    - Show 3-tab code samples (cURL, Python, Node.js)
    - Execute button triggers request to sandbox
    - Response shows inline after execution
    - Auto-advance to Step 4 on successful response (200-299)
  - Step 4 (Success):
    - Success message and congratulations
    - Request summary
    - Next-step recommendations from endpoint.nextStepRecommendations
    - Action buttons: "Explore Webhooks", "Try Another Endpoint", "View Documentation"
    - Back button and Finish button
  - Responsive layout: full-width on mobile, centered with max-width on desktop
  - Navigation: Back button available on all steps 2-4, disabled on step 1
  - Next/Forward button validation-gated
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10_

  - [ ]* 9.1 Write integration tests for FirstCallWizard
    - Test complete 4-step flow: select endpoint → configure → review → execute → success
    - Test back navigation between steps
    - Test Next button gating until valid
    - Test successful request auto-advances to Step 4
    - Test error responses display and allow retry
    - _Requirements: 4.4, 4.5, 4.6, 4.9_

  - [ ]* 9.2 Write property tests for FirstCallWizard
    - **Property 15: Recommended Endpoint Pre-selection** — Verify People Search pre-selected
    - **Property 19: Wizard Step Order** — Verify steps in exact order
    - **Property 20: Next Button Validation Gating** — Verify Next disabled until valid
    - **Property 21: Backward Navigation** — Verify Back button available on steps 2+
    - **Property 22: Review Step Display** — Verify all request details shown
    - **Property 23: Success State Transition** — Verify auto-advance on 200-299 response
    - _Validates: Requirements 4.2, 4.4, 4.5, 4.7, 4.9_

- [ ] 10. Integrate OnboardingChecklist into console layout
  - Update `src/app/console/layout.tsx`
  - Add OnboardingChecklist component (compact mode) at top of layout
  - Style with appropriate spacing and alignment
  - Ensure it persists across all console child pages (keys, webhooks, explorer, logs, billing)
  - Use OnboardingChecklist state from Zustand to auto-show/hide based on user progress
  - _Requirements: 1.4_

- [ ] 11. Set up feature flags for feature rollout
  - Create `src/lib/featureFlags.ts` with feature flag configuration
  - Define flags: FEATURE_FIRST_CALL_WIZARD, FEATURE_CELEBRATION_MODAL, SANDBOX_API_ENABLED
  - Flags read from environment variables (NEXT_PUBLIC_FEATURE_*)
  - Export useFeatureFlag hook for checking feature availability
  - Update FirstCallWizard page and CelebrationModal to respect flags
  - _Requirements: Deployment & Rollout strategy_

---

### Phase 4: Integration & Wiring

- [ ] 12. Wire FirstCallWizard to Zustand state
  - Update FirstCallWizard to dispatch actions to Zustand on step changes
  - Update selectedEndpointId in store on Step 1 selection
  - Update configuredParameters in store on Step 2 parameter changes
  - Update currentWizardStep in store for navigation
  - Dispatch markFirstCallMade on Step 3 successful execution
  - Auto-trigger CelebrationModal display after markFirstCallMade
  - Reset wizard state when user navigates away or completes
  - _Requirements: 1.5, 1.6, 4.8_

- [ ] 13. Implement first-call timestamp tracking and display
  - Update OnboardingChecklist to mark "First Call" step complete when isFirstCallMade = true
  - Update CelebrationModal to display only if firstCallTimestamp was just set (within 5 seconds)
  - Implement idempotency check: if firstCallTimestamp exists and is older than 5 seconds, do not show modal
  - Verify behavior persists across page refreshes and browser sessions via localStorage
  - _Requirements: 1.6, 8.2, 8.3, 8.4_

- [ ] 14. Add navigation links and routes
  - "Explore More" button in OnboardingChecklist links to `/console`
  - FirstCallWizard "Explore Webhooks" button links to `/console/webhooks`
  - FirstCallWizard "Try Another Endpoint" button links to `/console/first-call?step=1` (reset wizard)
  - FirstCallWizard "View Documentation" button links to external docs URL
  - CelebrationModal buttons use same link targets
  - _Requirements: 1.7, 6.4_

---

### Phase 5: Accessibility & Polish

- [ ] 15. Implement WCAG 2.1 AA accessibility compliance
  - RequestBuilder:
    - Semantic form elements with proper labels and aria-labels
    - aria-required for required fields
    - aria-invalid for validation errors
    - aria-describedby linking errors to input fields
    - Keyboard navigation through all form fields
    - Tab order: endpoint selector → parameters → code tabs → copy buttons → execute button
    - Focus visible indicators on all interactive elements
  - OnboardingChecklist:
    - Semantic HTML with proper heading hierarchy
    - aria-label for step indicators
    - Keyboard navigation through steps
    - Visible focus indicators
  - FirstCallWizard:
    - Semantic heading hierarchy (h1 for page title, h2 for step titles)
    - aria-label for step numbers
    - Focus management: focus moves to step content on navigation
    - Keyboard-only navigation through all steps
  - CelebrationModal:
    - role="alertdialog" and aria-label
    - Focus trap inside modal
    - Escape key to dismiss
    - aria-label for all buttons and links
  - Color contrast: all text meets 4.5:1 minimum
  - Respect prefers-reduced-motion for animations
  - _Requirements: WCAG 2.1 AA compliance_

- [ ] 16. Optimize animation performance
  - Implement confetti animation with max 50-100 particles
  - Use will-change: transform for confetti animation optimization
  - Debounce code sample generation on parameter changes (200ms)
  - Lazy-load code samples in background
  - Cancel in-flight requests on RequestBuilder unmount
  - Memoize endpoint metadata queries
  - _Requirements: Performance considerations_

---

### Phase 6: Comprehensive Testing

- [ ] 17. Write additional unit tests for integration points
  - Test Zustand store state updates propagate to components
  - Test OnboardingChecklist updates when isFirstCallMade changes
  - Test CelebrationModal displays/hides based on firstCallTimestamp
  - Test RequestBuilder validates before execution
  - Test code samples copy correctly to clipboard
  - _Requirements: All_

- [ ] 18. Write E2E tests for complete user flows
  - Complete flow: /console/first-call → select endpoint → configure parameters → review → execute → celebrate
  - Verify code samples are correct syntax
  - Verify sandbox API responds with mock data
  - Verify first-call celebration shows exactly once
  - Verify celebration not shown on subsequent visits
  - Verify onboarding checklist updates across pages
  - Test on desktop, tablet, and mobile viewports
  - _Requirements: All_

- [ ] 19. Checkpoint - Ensure all tests pass
  - Run all unit, property-based, integration, and E2E tests
  - Fix any failing tests or edge cases
  - Verify code coverage meets minimum threshold (80%+)
  - Review test reports and logs
  - Ask the user if questions or clarifications arise before final deployment
  - _Requirements: All_

---

### Phase 7: Deployment & Monitoring

- [ ] 20. Set up deployment and monitoring
  - Configure feature flags for phased rollout
  - Deploy Phase 1 (0% of users, internal testing only)
  - Monitor error logs, API response times, sandbox API performance
  - Set up analytics tracking for:
    - Completion rate through each wizard step
    - First-call success rate
    - Celebration modal display rate
    - Code sample copy/paste usage
    - Time spent in wizard (goal: <2 minutes)
  - Deploy Phase 2 (10% of new signups)
  - Analyze metrics and fix any issues
  - Deploy Phase 3 (100% general availability)
  - _Requirements: Deployment & Rollout strategy_

- [ ] 21. Final checkpoint - Feature complete and monitored
  - Verify all acceptance criteria met
  - Verify all 40 correctness properties validated via tests
  - All feature flags working correctly
  - Analytics and monitoring active
  - Documentation updated
  - Ask the user for final approval before marking complete
  - _Requirements: All_

---

## Notes

- All tasks reference specific requirements for traceability
- Optional test sub-tasks marked with `*` can be skipped for faster MVP, but are strongly recommended for feature correctness and maintainability
- Each major component (RequestBuilder, OnboardingChecklist, CelebrationModal, FirstCallWizard) includes property-based tests mapped to the 40 correctness properties defined in the design
- Code generation and sandbox API integration are thoroughly tested to ensure generated code is accurate and executable
- Accessibility is built in throughout, not added at the end
- Feature flags enable safe phased rollout with rollback capability

---

## Task Dependency Graph

```json
{
  "waves": [
    {
      "id": 0,
      "tasks": ["1", "2", "3", "4", "5"]
    },
    {
      "id": 1,
      "tasks": ["6", "7", "8"]
    },
    {
      "id": 2,
      "tasks": ["9", "10", "11"]
    },
    {
      "id": 3,
      "tasks": ["12", "13", "14"]
    },
    {
      "id": 4,
      "tasks": ["15", "16"]
    },
    {
      "id": 5,
      "tasks": ["17", "18", "19"]
    },
    {
      "id": 6,
      "tasks": ["20", "21"]
    }
  ]
}
```

