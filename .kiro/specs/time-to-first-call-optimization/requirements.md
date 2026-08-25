# Requirements Document: Time-to-First-Call Optimization

## Introduction

This feature enables developers to make their first successful API call within 2 minutes of signup through guided onboarding, an embedded request builder, and celebration. The feature reduces cognitive load and friction in the critical path: Signup → API Key → First Call → Success.

## Glossary

- **Developer**: User who has recently signed up and obtained API credentials
- **Onboarding_Checklist**: A persistent progress tracker showing Signup, API Key, First Call, and Explore More steps
- **Request_Builder**: Component that allows developers to select endpoints, configure parameters, and execute API requests
- **First_Call_Wizard**: A step-by-step guided interface to help developers make their first successful API call
- **Sandbox_Environment**: Test environment using sk_test_ prefixed API keys that returns mock data without consuming production credits
- **Celebration_Modal**: Full-screen modal displayed after first successful API call with confetti animation and next-step suggestions
- **First_Call_State**: Zustand store tracking whether a developer has made their first successful API call
- **Endpoint**: Available API resource (e.g., People Search, Company Search)
- **Request_Parameter**: Input field for endpoint-specific configuration (e.g., query string, body data)
- **Syntax_Highlighting**: Color-coded display of code samples for readability
- **Code_Sample**: Auto-generated cURL, Python, or Node.js code representing the current request configuration

## Requirements

### Requirement 1: Onboarding Checklist Persistence and State Management

**User Story:** As a new developer, I want to see my progress through the onboarding flow so that I know exactly what steps I've completed and what's next.

#### Acceptance Criteria

1. THE Onboarding_Checklist SHALL display exactly 4 steps in this order: "Signup", "API Key", "First Call", and "Explore More"
2. WHEN a step is completed, THE Onboarding_Checklist SHALL display a green checkmark icon for that step
3. WHEN a step is not completed, THE Onboarding_Checklist SHALL display a hollow circle icon for that step
4. THE Onboarding_Checklist SHALL remain visible and persistent across all console pages
5. THE Onboarding_Checklist state SHALL be stored in the First_Call_State Zustand store
6. WHEN the Developer executes their first successful API call, THE Onboarding_Checklist SHALL automatically mark the "First Call" step as complete
7. WHEN the "First Call" step is marked complete, THE "Explore More" step SHALL become clickable with a link to the console overview or next features

### Requirement 2: Request Builder Component and Functionality

**User Story:** As a developer, I want to build and execute API requests directly in the console so that I can test endpoints without leaving the browser or using external tools.

#### Acceptance Criteria

1. THE Request_Builder SHALL display an endpoint selector dropdown listing all 12 available endpoints
2. THE Request_Builder SHALL display an HTTP method selector with GET and POST options
3. THE Request_Builder SHALL display Parameter input fields that are specific to the selected endpoint
4. THE Request_Builder SHALL pre-fill the Authorization header with the Developer's API key
5. WHEN the Developer selects an endpoint, THE Request_Builder SHALL display all required and optional Request_Parameters for that endpoint
6. THE Request_Builder SHALL generate and display code samples in cURL, Python, and Node.js formats
7. THE Request_Builder SHALL display syntax highlighting for all code samples
8. WHEN the Developer clicks "Copy to Clipboard", THE Request_Builder SHALL copy the entire code sample to the Developer's clipboard
9. WHEN the Developer clicks "Execute", THE Request_Builder SHALL validate all required Request_Parameters before sending the request
10. IF a required Request_Parameter is missing or invalid, THEN THE Request_Builder SHALL display a validation error message and prevent request submission
11. THE Request_Builder SHALL execute all requests against the Sandbox_Environment by default
12. WHEN a request is in flight, THE Request_Builder SHALL display a loading spinner
13. WHEN a request completes, THE Request_Builder SHALL display the response with JSON syntax highlighting in a JSON viewer
14. THE Request_Builder response display SHALL show latency in milliseconds and HTTP status code
15. THE Request_Builder SHALL display request and response side-by-side on desktop viewports (>768px) and stacked vertically on mobile viewports (<768px)

### Requirement 3: Endpoint Recommendations for First Call

**User Story:** As a new developer, I want the simplest endpoint recommended first so that I can verify API access quickly without overwhelming complexity.

#### Acceptance Criteria

1. THE First_Call_Wizard SHALL recommend the simplest available endpoint first (e.g., "People Search")
2. THE Request_Builder SHALL display a "Recommended for first call ⭐" badge on the recommended endpoint in the endpoint selector
3. WHEN the First_Call_Wizard loads, THE Request_Builder SHALL pre-populate with example Request_Parameters for the recommended endpoint
4. WHEN the Developer views the endpoint selector, THE Request_Builder SHALL display a brief description (1-2 sentences) for each endpoint
5. THE Request_Builder SHALL display the estimated credit cost for each endpoint call next to the endpoint name

### Requirement 4: First-Call Wizard Step-by-Step Interface

**User Story:** As a developer, I want a guided step-by-step wizard for making my first API call so that I'm confident I'm doing it correctly.

#### Acceptance Criteria

1. THE First_Call_Wizard SHALL be accessible via the /console/first-call route
2. THE First_Call_Wizard SHALL display exactly 4 steps in this order: "Select Endpoint", "Configure Parameters", "Review & Execute", and "Success 🎉"
3. EACH step SHALL display clear instructions and example data for that step
4. THE First_Call_Wizard "Next" button SHALL be disabled until the current step is valid
5. THE First_Call_Wizard SHALL allow navigation back to previous steps
6. THE First_Call_Wizard SHALL allow navigation forward to subsequent steps only when the current step is valid
7. ON the "Review & Execute" step, THE First_Call_Wizard SHALL display the complete request details (endpoint, method, parameters, headers) before execution
8. WHEN the Developer clicks "Execute" on the "Review & Execute" step, THE First_Call_Wizard SHALL send the request to the Sandbox_Environment
9. WHEN the request succeeds, THE First_Call_Wizard SHALL advance to the "Success 🎉" step
10. THE First_Call_Wizard SHALL use a responsive layout that adapts to mobile viewports (<768px), tablet viewports (768px-1024px), and desktop viewports (>1024px)

### Requirement 5: Success Celebration on First API Call

**User Story:** As a developer, I want clear confirmation when my first API call succeeds so that I feel confident the integration is working.

#### Acceptance Criteria

1. WHEN a Developer executes their first successful API call, THE System SHALL display a Celebration_Modal
2. THE Celebration_Modal SHALL display a confetti animation that plays for 3-5 seconds
3. THE Celebration_Modal SHALL display the message "🎉 Your First API Call Succeeded!"
4. THE Celebration_Modal SHALL display the request details: endpoint name, HTTP status code, and response time in milliseconds
5. THE Celebration_Modal SHALL display a sample of the response data (first 200 characters)
6. THE Celebration_Modal SHALL provide clickable next-step links with labels: "Explore Webhooks", "Try Another Endpoint", and "View Documentation"
7. THE Celebration_Modal SHALL be dismissible by a close button or by clicking outside the modal
8. WHEN the Developer dismisses the Celebration_Modal, THE System SHALL return focus to the console overview or current page

### Requirement 6: Progressive Next-Step Suggestions

**User Story:** As a developer who just made their first API call, I want clear suggestions for what to do next so I can quickly move from "hello world" to real integration work.

#### Acceptance Criteria

1. THE Celebration_Modal SHALL display 3-4 recommended next steps based on the endpoint the Developer used
2. EACH next-step recommendation SHALL include: a title, a brief description (1-2 sentences), and a clickable link
3. THE next-step recommendations SHALL include: SDKs (with download links), Request Logging, Webhooks Setup, and Error Handling documentation
4. ALL next-step links SHALL navigate to the relevant console pages or external documentation

### Requirement 7: Sandbox Isolation and Security

**User Story:** As a developer, I want to know my test requests are safely isolated and do not consume production resources.

#### Acceptance Criteria

1. WHEN the Request_Builder executes a request, THE System SHALL use the Developer's sk_test_ prefixed API key, never sk_live_
2. WHEN a request is executed in the Request_Builder, THE System SHALL route the request to the Sandbox_Environment, never production
3. THE Sandbox_Environment responses SHALL include mock data that matches the schema of production responses but contains example values only

### Requirement 8: First-Call Celebration Idempotency

**User Story:** As a developer, I want the celebration to happen exactly once on my first call, not every time I make a call.

#### Acceptance Criteria

1. WHEN a Developer makes their first successful API call, THE System SHALL record the first_call_timestamp in the First_Call_State
2. WHEN a Developer makes a subsequent API call after the first, THE System SHALL NOT display the Celebration_Modal
3. IF the Developer refreshes the page after their first call, THE System SHALL NOT redisplay the Celebration_Modal
4. THE first_call_timestamp SHALL persist across browser sessions and page refreshes

### Requirement 9: Request Builder Form Validation

**User Story:** As a developer, I want validation to prevent me from submitting incomplete or invalid requests.

#### Acceptance Criteria

1. WHEN the Developer attempts to submit a request with missing required Request_Parameters, THE Request_Builder SHALL display an inline validation error message for each missing parameter
2. WHEN the Developer attempts to submit a request with invalid Request_Parameter values (e.g., malformed email), THE Request_Builder SHALL display a validation error message and prevent submission
3. THE Request_Builder validation error messages SHALL be specific and actionable (e.g., "Email must be in format: user@example.com")
4. WHEN the Developer corrects a validation error, THE Request_Builder SHALL clear the error message for that parameter

### Requirement 10: Code Sample Generation and Accuracy

**User Story:** As a developer, I want code samples I can copy and use immediately in my projects.

#### Acceptance Criteria

1. WHEN the Developer configures a request in the Request_Builder, THE System SHALL auto-generate code samples in cURL, Python, and Node.js
2. ALL auto-generated code samples SHALL be syntactically correct and executable in their respective environments
3. THE cURL code sample SHALL include all headers, authentication, and request body
4. THE Python code sample SHALL use the requests library and include proper error handling structure
5. THE Node.js code sample SHALL use axios or fetch API and include proper error handling structure
6. WHEN the code samples are updated due to parameter changes, THE Request_Builder SHALL update all three samples immediately
