# Design Document: Time-to-First-Call Optimization

## 1. Architecture Overview

This document specifies the design for the Time-to-First-Call Optimization feature, which guides new developers from signup to their first successful API call within 2 minutes through progressive onboarding, embedded request building, and celebratory feedback.

### 1.1 System Context

The feature integrates into the existing API Dashboard console (Next.js 14, React 18, TypeScript) with:
- **State Management**: Zustand store extension for first-call tracking
- **Styling**: Tailwind CSS with Lucide icons
- **Animation**: Framer Motion for confetti and modal transitions
- **Request Handling**: HTTP client for sandbox API calls
- **Validation**: Form validation and request parameter checking

### 1.2 Data Flow Summary

```
Signup Flow → Auto-provision Sandbox Key → Redirect to /console/keys 
  ↓
Developer sees OnboardingChecklist (2/4 complete)
  ↓
Developer navigates to /console/first-call
  ↓
FirstCallWizard 4-step flow:
  Step 1: SelectEndpoint (pre-recommend People Search)
  Step 2: ConfigureParameters (fill form)
  Step 3: ReviewAndExecute (show code samples + Execute)
  Step 4: Success (summary)
  ↓
On Step 3 Execute → Send request to sandbox (sk_test_ key)
  ↓
If successful (200-299):
  - Store firstCallTimestamp in Zustand
  - Mark "First Call" step complete in checklist
  - Show CelebrationModal with confetti
  - Display next-step recommendations
  ↓
Developer dismisses modal
  ↓
Subsequent calls do NOT show celebration (idempotency via timestamp check)
```

---

## 2. Component Architecture

### 2.1 State Management: FirstCallStore Extension

**File**: `src/store/useStore.ts` (extends existing Zustand store)

```typescript
interface FirstCallState {
  // Checklist state
  completedOnboardingSteps: ('signup' | 'apiKey' | 'firstCall' | 'exploreMore')[];
  
  // First-call tracking
  isFirstCallMade: boolean;
  firstCallTimestamp?: number; // Unix timestamp
  
  // Wizard state
  currentWizardStep: 0 | 1 | 2 | 3;
  selectedEndpointId?: string;
  configuredParameters: Record<string, any>;
  
  // Last request details (for celebration display)
  lastRequestDetails?: {
    endpoint: string;
    method: 'GET' | 'POST';
    statusCode: number;
    responseTime: number;
    response: any;
    timestamp: number;
  };
  
  // Actions
  markOnboardingStepComplete(step: 'signup' | 'apiKey' | 'firstCall' | 'exploreMore'): void;
  markFirstCallMade(details: {
    endpoint: string;
    method: string;
    statusCode: number;
    responseTime: number;
    response: any;
  }): void;
  updateWizardStep(step: 0 | 1 | 2 | 3): void;
  updateSelectedEndpoint(endpointId: string): void;
  updateConfiguredParameters(params: Record<string, any>): void;
  resetWizard(): void;
}
```

**Persistence**: Zustand persists to localStorage with key `first-call-state`

---

### 2.2 Endpoint Metadata Structure

**File**: `src/data/endpoints.ts`

```typescript
export type Endpoint = {
  id: string;
  name: string;
  description: string; // 1-2 sentences
  method: 'GET' | 'POST';
  path: string; // e.g., "/people-search"
  creditCost: number;
  isRecommendedForFirstCall: boolean;
  
  // Parameter definitions for form generation
  parameters: EndpointParameter[];
  
  // Next-step recommendations specific to this endpoint
  nextStepRecommendations: NextStepRecommendation[];
};

export type EndpointParameter = {
  name: string;
  type: 'string' | 'email' | 'phone' | 'number';
  required: boolean;
  description: string;
  example: string;
  placeholder?: string;
  validation?: (value: string) => boolean | string; // true | error message
  maxLength?: number;
  minValue?: number;
  maxValue?: number;
};

export type NextStepRecommendation = {
  id: string;
  title: string;
  description: string;
  category: 'sdks' | 'logging' | 'webhooks' | 'errorHandling';
  link: string; // internal route or external URL
};

// Define all 12 endpoints with metadata
export const ENDPOINTS: Endpoint[] = [
  {
    id: 'people-search',
    name: 'People Search',
    description: 'Search for a person by email or name. Returns contact and profile data.',
    method: 'GET',
    path: '/people-search',
    creditCost: 1,
    isRecommendedForFirstCall: true,
    parameters: [
      {
        name: 'email',
        type: 'email',
        required: true,
        description: 'Email address to search for',
        example: 'john@example.com',
        placeholder: 'user@example.com',
        validation: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || 'Invalid email format',
      },
      {
        name: 'first_name',
        type: 'string',
        required: false,
        description: 'Optional: First name for additional filtering',
        example: 'John',
        maxLength: 50,
      },
      {
        name: 'last_name',
        type: 'string',
        required: false,
        description: 'Optional: Last name for additional filtering',
        example: 'Doe',
        maxLength: 50,
      },
    ],
    nextStepRecommendations: [
      {
        id: 'sdk-nodejs',
        title: 'Node.js SDK',
        description: 'Install our official Node.js SDK for easier integration.',
        category: 'sdks',
        link: '/console/sdks?lang=nodejs',
      },
      {
        id: 'logging',
        title: 'Enable Request Logging',
        description: 'Monitor all API requests in your dashboard.',
        category: 'logging',
        link: '/console/settings/logging',
      },
    ],
  },
  // ... 11 more endpoints
];
```

---

### 2.3 Component Hierarchy

```
Console Layout (existing)
├── OnboardingChecklist (NEW)
│   └── ChecklistStep × 4
│
├── /console/first-call (NEW)
│   └── FirstCallWizard (NEW)
│       ├── WizardStep
│       ├── Step 1: SelectEndpoint
│       │   └── RequestBuilder (in preview mode)
│       ├── Step 2: ConfigureParameters
│       │   └── RequestBuilder (parameter form)
│       ├── Step 3: ReviewAndExecute
│       │   └── RequestBuilder (full review mode)
│       └── Step 4: Success
│           └── NextStepsPanel
│
├── CelebrationModal (NEW - portal/overlay)
│   ├── ConfettiAnimation
│   ├── SuccessMessage
│   ├── RequestDetails
│   ├── ResponsePreview
│   └── NextStepButtons
│
└── RequestBuilder (NEW - reusable)
    ├── EndpointSelector
    ├── MethodSelector
    ├── ParameterInputs
    ├── CodeSampleTabs
    │   ├── CurlTab
    │   ├── PythonTab
    │   └── NodeJsTab
    └── ResponseViewer
```

---

### 2.4 Component Specifications

#### 2.4.1 OnboardingChecklist Component

**File**: `src/components/OnboardingChecklist.tsx`

**Props**:
```typescript
interface OnboardingChecklistProps {
  compact?: boolean; // true for header mode, false for full page mode
}
```

**Behavior**:
- Displays 4 steps: "Signup", "API Key", "First Call", "Explore More"
- Completed steps show green checkmark (✓), incomplete show hollow circle (○)
- Automatically marks steps complete based on Zustand state
- "Explore More" becomes clickable link after "First Call" complete
- Dismissible via close button, but state persists
- Responsive: horizontal layout on desktop (>768px), vertical on mobile (<768px)
- Persists across all console pages via store subscription

**Key Logic**:
```typescript
const completedSteps = useStore(s => s.completedOnboardingSteps);
const isFirstCallMade = useStore(s => s.isFirstCallMade);

// Auto-mark steps based on conditions
useEffect(() => {
  // Signup is always complete for signed-in users
  // API Key marked complete when at least one key exists (query/API)
  // First Call marked complete when isFirstCallMade = true
}, []);

// "Explore More" becomes clickable after "First Call" complete
const canExploreMore = completedSteps.includes('firstCall');
```

---

#### 2.4.2 RequestBuilder Component

**File**: `src/components/RequestBuilder.tsx`

**Props**:
```typescript
interface RequestBuilderProps {
  mode?: 'full' | 'preview' | 'review'; // full=editable, preview=read-only, review=full details
  preselectedEndpointId?: string;
  onExecute?: (result: RequestResult) => void;
  onStepChange?: (step: number) => void;
  hideExecuteButton?: boolean;
  disableEditing?: boolean;
}

interface RequestResult {
  endpoint: Endpoint;
  statusCode: number;
  responseTime: number;
  response: any;
}
```

**Sub-components**:

**EndpointSelector**:
- Dropdown showing all 12 endpoints
- Displays endpoint name, description, and credit cost
- "Recommended for first call ⭐" badge on recommended endpoint
- Filtering/search capability (optional)
- Shows method (GET/POST) per endpoint

**ParameterInputs**:
- Dynamic form fields based on selected endpoint
- Input types: text, email, phone, number
- Required field indicators
- Inline validation with error messages
- Real-time validation as user types
- Example text as placeholder

**CodeSampleTabs**:
- 3 tabs: cURL, Python, Node.js
- Real-time code generation as parameters change
- Copy-to-clipboard button per tab
- Syntax highlighting for each language
- All samples include Authorization header with sk_test_ key

**ResponseViewer**:
- JSON syntax highlighting
- Shows status code and latency in milliseconds
- Scrollable for large responses
- Error state with error message display
- Loading spinner during request

**Full Logic**:
```typescript
// When parameter changes, regenerate all code samples
const handleParameterChange = (name: string, value: string) => {
  updateConfiguredParameters({ ...params, [name]: value });
  validateParameter(name, value);
  generateCodeSamples(); // triggers all 3 tabs to update
};

// Validate before execution
const handleExecute = async () => {
  const validationErrors = validateAllParameters();
  if (Object.keys(validationErrors).length > 0) {
    setErrors(validationErrors);
    return;
  }
  
  try {
    setLoading(true);
    const response = await callSandboxAPI(endpoint, configuredParameters);
    
    const result = {
      statusCode: response.status,
      responseTime: response.duration,
      response: response.data,
    };
    
    onExecute?.(result);
  } finally {
    setLoading(false);
  }
};
```

---

#### 2.4.3 FirstCallWizard Page

**File**: `src/app/console/first-call/page.tsx`

**4-Step Flow**:

**Step 1: SelectEndpoint**
- Display all 12 endpoints with descriptions
- Pre-select People Search (recommended)
- Show credit cost per endpoint
- Inline preview of RequestBuilder with selected endpoint
- "Next" button disabled until endpoint selected

**Step 2: ConfigureParameters**
- Parameter form for selected endpoint
- Show all required fields prominently
- Optional fields collapsible or clearly marked
- Example values as placeholders
- Inline validation with error messages
- "Next" button disabled until all required fields valid

**Step 3: ReviewAndExecute**
- Full request details display:
  - Endpoint name and description
  - HTTP method
  - Full request URL
  - All headers (including Authorization with sk_test_ key)
  - Request body/parameters
- 3-tab code samples (cURL, Python, Node.js)
- "Execute" button triggers request
- Response shown inline after execution
- If successful (200-299), automatically advance to Step 4

**Step 4: Success**
- Success message and congratulations
- Request summary (endpoint, status, latency)
- Next-step recommendations from endpoint.nextStepRecommendations
- Buttons: "Explore Webhooks", "Try Another Endpoint", "View Documentation"
- Link to console overview

**Navigation**:
- Back button on all steps (goes to previous step)
- Next button on steps 1-3 (disabled until valid)
- Back/Finish buttons on step 4
- Responsive: full-width <768px, centered max-width >768px

```typescript
const [currentStep, setCurrentStep] = useState(0);

const isStepValid = () => {
  switch (currentStep) {
    case 0: return selectedEndpointId !== undefined;
    case 1: return validateAllParameters().length === 0;
    case 2: return true; // Review is always valid
    case 3: return true; // Success is terminal
    default: return false;
  }
};

const handleExecute = async () => {
  const response = await callSandboxAPI(...);
  
  if (response.status >= 200 && response.status < 300) {
    // Mark first call made
    useStore.setState(s => ({
      ...s,
      isFirstCallMade: true,
      firstCallTimestamp: Date.now(),
      lastRequestDetails: {
        endpoint: selectedEndpoint.name,
        method: selectedEndpoint.method,
        statusCode: response.status,
        responseTime: response.duration,
        response: response.data,
      },
    }));
    
    // Automatically advance to success step
    setCurrentStep(3);
    
    // Show celebration modal (via portal)
    showCelebrationModal();
  }
};
```

---

#### 2.4.4 CelebrationModal Component

**File**: `src/components/CelebrationModal.tsx`

**Props**:
```typescript
interface CelebrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  requestDetails: LastRequestDetails;
}
```

**Behavior**:
- Full-screen modal with semi-transparent backdrop
- Confetti animation for 3-5 seconds (Framer Motion)
- Center-positioned content card on desktop, full-width on mobile
- Success message: "🎉 Your First API Call Succeeded!"
- Display request metadata:
  - Endpoint: "People Search"
  - Status: "200 OK"
  - Latency: "145ms"
- Response preview: first 200 characters with syntax highlighting
- 3 next-step buttons (clickable links):
  - "Explore Webhooks" → `/console/webhooks`
  - "Try Another Endpoint" → `/console/first-call?step=1`
  - "View Documentation" → external docs URL
- Close button (top-right corner)
- Click outside modal to dismiss
- Focus management: trap focus inside modal, restore on close

**Idempotency Check**:
```typescript
const isFirstCallMade = useStore(s => s.isFirstCallMade);
const firstCallTimestamp = useStore(s => s.firstCallTimestamp);

// Only show modal if this is the first successful call
useEffect(() => {
  if (isFirstCallMade && firstCallTimestamp) {
    const callWasJustMade = (Date.now() - firstCallTimestamp) < 5000;
    if (!callWasJustMade) {
      // Already celebrated, don't show again
      onClose?.();
    }
  }
}, []);
```

---

### 2.5 Validation System

**File**: `src/lib/validation.ts`

```typescript
export type ValidationRule = {
  type: 'required' | 'email' | 'phone' | 'length' | 'range' | 'custom';
  value?: any; // max length, min/max range, etc.
  message: string;
  validate?: (value: string) => boolean;
};

export function validateParameter(
  parameter: EndpointParameter,
  value: string
): string | null {
  // Required check
  if (parameter.required && !value?.trim()) {
    return `${parameter.name} is required`;
  }
  
  // Type-specific validation
  switch (parameter.type) {
    case 'email':
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(value)
        ? null
        : 'Email must be in format: user@example.com';
    
    case 'phone':
      const phoneRegex = /^\d{10,15}$/;
      return phoneRegex.test(value.replace(/\D/g, ''))
        ? null
        : 'Phone must be 10-15 digits';
    
    case 'number':
      const num = parseInt(value);
      if (isNaN(num)) return 'Must be a valid number';
      if (parameter.minValue && num < parameter.minValue)
        return `Must be at least ${parameter.minValue}`;
      if (parameter.maxValue && num > parameter.maxValue)
        return `Must be at most ${parameter.maxValue}`;
      return null;
    
    case 'string':
      if (parameter.maxLength && value.length > parameter.maxLength) {
        return `Maximum ${parameter.maxLength} characters`;
      }
      return null;
    
    default:
      return null;
  }
}
```

---

### 2.6 Code Sample Generation

**File**: `src/lib/codeSampleGenerator.ts`

```typescript
export interface CodeSample {
  curl: string;
  python: string;
  nodejs: string;
}

export function generateCodeSamples(
  endpoint: Endpoint,
  parameters: Record<string, any>,
  apiKey: string
): CodeSample {
  const baseUrl = 'https://api.zintlr.com/v1';
  const authHeader = `Authorization: sk_test_${apiKey.replace('sk_test_', '')}`;
  
  // Build query string or body
  const paramString = new URLSearchParams(parameters).toString();
  const url = endpoint.method === 'GET'
    ? `${baseUrl}${endpoint.path}?${paramString}`
    : `${baseUrl}${endpoint.path}`;
  
  return {
    curl: generateCurl(endpoint, url, parameters, authHeader),
    python: generatePython(endpoint, url, parameters, authHeader),
    nodejs: generateNodeJS(endpoint, url, parameters, authHeader),
  };
}

function generateCurl(endpoint, url, params, authHeader): string {
  if (endpoint.method === 'GET') {
    return `curl -X GET "${url}" \\
  -H "${authHeader}" \\
  -H "Content-Type: application/json"`;
  } else {
    const body = JSON.stringify(params);
    return `curl -X POST "${url}" \\
  -H "${authHeader}" \\
  -H "Content-Type: application/json" \\
  -d '${body}'`;
  }
}

function generatePython(endpoint, url, params, authHeader): string {
  const headerDict = { Authorization: authHeader.split(': ')[1] };
  if (endpoint.method === 'GET') {
    return `import requests

headers = ${JSON.stringify(headerDict)}
params = ${JSON.stringify(params)}

response = requests.get("${url}", headers=headers, params=params)
print(response.json())`;
  } else {
    return `import requests

headers = ${JSON.stringify(headerDict)}
data = ${JSON.stringify(params)}

response = requests.post("${url}", headers=headers, json=data)
print(response.json())`;
  }
}

function generateNodeJS(endpoint, url, params, authHeader): string {
  const headerDict = { Authorization: authHeader.split(': ')[1] };
  if (endpoint.method === 'GET') {
    return `const axios = require('axios');

const config = {
  headers: ${JSON.stringify(headerDict)}
};

axios.get("${url}", config)
  .then(response => console.log(response.data))
  .catch(error => console.error(error));`;
  } else {
    return `const axios = require('axios');

const config = {
  headers: ${JSON.stringify(headerDict)}
};

axios.post("${url}", ${JSON.stringify(params)}, config)
  .then(response => console.log(response.data))
  .catch(error => console.error(error));`;
  }
}
```

---

### 2.7 Sandbox API Integration

**File**: `src/lib/sandboxAPI.ts`

```typescript
export interface APIResponse {
  status: number;
  data: any;
  duration: number;
}

export async function callSandboxAPI(
  endpoint: Endpoint,
  parameters: Record<string, any>,
  apiKey: string
): Promise<APIResponse> {
  const startTime = performance.now();
  
  const baseUrl = process.env.NEXT_PUBLIC_SANDBOX_API_URL || 'https://sandbox-api.zintlr.com';
  const url = new URL(`${baseUrl}/v1${endpoint.path}`);
  
  // Validate API key is test key
  if (!apiKey.startsWith('sk_test_')) {
    throw new Error('Only test API keys (sk_test_) are allowed');
  }
  
  const requestConfig: RequestInit = {
    method: endpoint.method,
    headers: {
      'Authorization': apiKey,
      'Content-Type': 'application/json',
    },
  };
  
  if (endpoint.method === 'GET') {
    Object.entries(parameters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.append(key, String(value));
      }
    });
  } else {
    requestConfig.body = JSON.stringify(parameters);
  }
  
  try {
    const response = await fetch(url.toString(), requestConfig);
    const data = await response.json();
    const duration = Math.round(performance.now() - startTime);
    
    return {
      status: response.status,
      data,
      duration,
    };
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    throw {
      status: 0,
      data: { error: error.message },
      duration,
    };
  }
}
```

---

## 3. Data Models

### 3.1 FirstCallState (Zustand Store)

```typescript
{
  // Checklist progress
  completedOnboardingSteps: ['signup', 'apiKey'], // after signup
  // → ['signup', 'apiKey', 'firstCall'] after first successful call
  
  // First-call tracking
  isFirstCallMade: false, // true after first successful call
  firstCallTimestamp: undefined, // Unix timestamp of first successful call
  
  // Wizard navigation
  currentWizardStep: 0, // 0=Select, 1=Configure, 2=Review, 3=Success
  selectedEndpointId: 'people-search', // after user selects
  configuredParameters: { email: 'john@example.com', first_name: 'John' },
  
  // Last request for display
  lastRequestDetails: {
    endpoint: 'People Search',
    method: 'GET',
    statusCode: 200,
    responseTime: 145,
    response: { /* API response */ },
    timestamp: 1699564800000,
  },
}
```

---

## 4. User Interface Layouts

### 4.1 OnboardingChecklist - Header Display (Desktop)

```
┌─────────────────────────────────────────────────────────────┐
│  Your Progress:  [✓ Signup]  [✓ API Key]  [○ First Call]  [○ Explore More]  [×] │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 OnboardingChecklist - Mobile Display

```
┌─────────────────────────────────────┐
│ Your Progress:                  [×] │
├─────────────────────────────────────┤
│ ✓ Signup                            │
│ ✓ API Key                           │
│ ○ First Call                        │
│ ○ Explore More                      │
└─────────────────────────────────────┘
```

### 4.3 FirstCallWizard - Desktop Layout

```
┌──────────────────────────────────────────────────────────────┐
│ Get Your First API Call Running in 2 Minutes                 │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│ [1. SELECT] → [2. CONFIGURE] → [3. REVIEW] → [4. SUCCESS]  │
│                                                               │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Step 1: Select an Endpoint                                  │
│                                                               │
│  Which endpoint would you like to call?                      │
│                                                               │
│  ┌─────────────────────────────────┐                         │
│  │ [People Search ⭐ - 1 credit] ▼ │  ← Recommended         │
│  └─────────────────────────────────┘                         │
│                                                               │
│  Description: Search for a person by email or name.          │
│                                                               │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ Request Builder Preview:                                │ │
│  │ GET /people-search?email=...                           │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│                         [Back]  [Next →]                     │
└──────────────────────────────────────────────────────────────┘
```

### 4.4 RequestBuilder - Parameter Form (Mobile)

```
┌─────────────────────────────────────┐
│ Configure Parameters                │
├─────────────────────────────────────┤
│                                     │
│ Email * (required)                  │
│ ┌─────────────────────────────────┐ │
│ │ user@example.com                │ │
│ └─────────────────────────────────┘ │
│                                     │
│ First Name (optional)               │
│ ┌─────────────────────────────────┐ │
│ │ John                            │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Last Name (optional)                │
│ ┌─────────────────────────────────┐ │
│ │ Doe                             │ │
│ └─────────────────────────────────┘ │
│                                     │
│            [Next →]                 │
└─────────────────────────────────────┘
```

### 4.5 CelebrationModal - Success Display

```
┌─────────────────────────────────────┐
│  🎉 Your First API Call Succeeded!  │
│                                     │
│  Endpoint: People Search            │
│  Status: 200 OK                     │
│  Latency: 145ms                     │
│                                     │
│  Response Preview:                  │
│  {                                  │
│    "person": {                      │
│      "email": "john@example.com",   │
│      "first_name": "John",          │
│      ...                            │
│  }                                  │
│                                     │
│  What's Next?                       │
│  [Explore Webhooks]                 │
│  [Try Another Endpoint]             │
│  [View Documentation]               │
│                                     │
│  Confetti Animation (3-5 seconds)   │
└─────────────────────────────────────┘
```

---

## 5. Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Checklist Step Order

*For any OnboardingChecklist instance, the displayed steps should appear in the exact order: "Signup", "API Key", "First Call", "Explore More"*

**Validates: Requirements 1.1**

### Property 2: Step Completion Indicator

*For any step marked as complete in the First_Call_State, the OnboardingChecklist should display a green checkmark; for any incomplete step, it should display a hollow circle.*

**Validates: Requirements 1.2, 1.3**

### Property 3: Automatic First Call Marking

*For any API response with status code between 200-299 (inclusive), the system shall mark the "First Call" step as complete and record the first_call_timestamp.*

**Validates: Requirements 1.6, 8.1**

### Property 4: Explore More Activation

*For any OnboardingChecklist where the "First Call" step is marked complete, the "Explore More" step should be clickable and navigable.*

**Validates: Requirements 1.7**

### Property 5: Endpoint Listing

*For any RequestBuilder instance, all 12 available endpoints should be rendered in the endpoint selector dropdown.*

**Validates: Requirements 2.1**

### Property 6: HTTP Method Selection

*For any RequestBuilder instance, both GET and POST HTTP methods should be available for selection.*

**Validates: Requirements 2.2**

### Property 7: Endpoint-Specific Parameters

*For any selected endpoint in the RequestBuilder, the parameter input fields displayed should exactly match the parameters defined in that endpoint's metadata.*

**Validates: Requirements 2.3, 2.5**

### Property 8: Authorization Header Inclusion

*For any code sample generated by the RequestBuilder, the Authorization header shall include the developer's sk_test_ prefixed API key.*

**Validates: Requirements 2.4, 7.1**

### Property 9: Code Sample Generation

*For any request configuration in the RequestBuilder, code samples should be generated in all three languages: cURL, Python, and Node.js.*

**Validates: Requirements 2.6, 10.1**

### Property 10: Code Sample Copy to Clipboard

*For any copy-to-clipboard action on a code sample, the exact code content should be placed in the user's clipboard.*

**Validates: Requirements 2.8**

### Property 11: Required Parameter Validation

*For any request execution attempt with a missing required parameter, the RequestBuilder should display a validation error and prevent request submission.*

**Validates: Requirements 2.9, 2.10, 9.1, 9.2**

### Property 12: Sandbox API Isolation

*For any request executed via the RequestBuilder, the Authorization header shall always contain a sk_test_ prefixed key and never sk_live_.*

**Validates: Requirements 2.11, 7.1**

### Property 13: Response Metadata Display

*For any completed API request, the RequestBuilder response display should show both the HTTP status code and response latency in milliseconds.*

**Validates: Requirements 2.14**

### Property 14: Responsive Layout

*For any RequestBuilder on desktop viewports (>768px), request and response should be displayed side-by-side; on mobile viewports (<768px), they should be stacked vertically.*

**Validates: Requirements 2.15, 4.10**

### Property 15: Recommended Endpoint Pre-selection

*For any FirstCallWizard page load, the "People Search" endpoint should be pre-selected as the recommended endpoint.*

**Validates: Requirements 3.1, 3.3**

### Property 16: Recommended Badge Display

*For the recommended endpoint in the endpoint selector, a "Recommended for first call ⭐" badge should be displayed.*

**Validates: Requirements 3.2**

### Property 17: Endpoint Descriptions

*For any endpoint in the RequestBuilder endpoint selector, a description (1-2 sentences) should be displayed.*

**Validates: Requirements 3.4**

### Property 18: Credit Cost Display

*For any endpoint in the RequestBuilder, the estimated credit cost should be displayed next to the endpoint name.*

**Validates: Requirements 3.5**

### Property 19: Wizard Step Order

*For any FirstCallWizard instance, the steps should be displayed in the exact order: "Select Endpoint", "Configure Parameters", "Review & Execute", "Success 🎉"*

**Validates: Requirements 4.2**

### Property 20: Next Button Validation Gating

*For any step in the FirstCallWizard, the "Next" button should be disabled until all required fields for that step are valid.*

**Validates: Requirements 4.4, 4.6**

### Property 21: Backward Navigation

*For any FirstCallWizard step after the first step, a back button should be available and functional.*

**Validates: Requirements 4.5**

### Property 22: Review Step Display

*For the "Review & Execute" step in FirstCallWizard, all request details (endpoint, method, parameters, headers) should be displayed before execution.*

**Validates: Requirements 4.7**

### Property 23: Success State Transition

*For any successful API request (status 200-299) on the "Review & Execute" step, the FirstCallWizard should automatically advance to the "Success 🎉" step.*

**Validates: Requirements 4.9**

### Property 24: Celebration Modal Display

*For any first successful API call, a CelebrationModal should be displayed with confetti animation.*

**Validates: Requirements 5.1, 5.2**

### Property 25: Celebration Modal Content

*For any CelebrationModal displayed, it should contain: the success message "🎉 Your First API Call Succeeded!", endpoint name, HTTP status code, response latency, and first 200 characters of the response.*

**Validates: Requirements 5.3, 5.4, 5.5**

### Property 26: Celebration Modal Next Steps

*For any CelebrationModal displayed, three clickable next-step links should be available: "Explore Webhooks", "Try Another Endpoint", and "View Documentation".*

**Validates: Requirements 5.6**

### Property 27: Celebration Modal Dismissal

*For any CelebrationModal, both the close button and clicking outside the modal should dismiss it.*

**Validates: Requirements 5.7**

### Property 28: Endpoint-Specific Recommendations

*For any endpoint used in a successful first API call, the CelebrationModal should display 3-4 next-step recommendations appropriate to that endpoint.*

**Validates: Requirements 6.1**

### Property 29: Recommendation Content Completeness

*For any next-step recommendation displayed, it should include a title, description (1-2 sentences), and a clickable link.*

**Validates: Requirements 6.2**

### Property 30: Recommendation Types

*For any CelebrationModal displayed, next-step recommendations should include at least: SDKs, Request Logging, Webhooks Setup, and Error Handling documentation.*

**Validates: Requirements 6.3**

### Property 31: Celebration Idempotency - No Duplicate Modals

*For any API call after the first successful call, the CelebrationModal should not be displayed.*

**Validates: Requirements 8.2**

### Property 32: Celebration Idempotency - Persistence Across Refresh

*For any page refresh after the first successful API call has been made and recorded, the CelebrationModal should not be displayed.*

**Validates: Requirements 8.3**

### Property 33: Timestamp Persistence

*For any first_call_timestamp recorded in the First_Call_State, it should remain in localStorage and persist across browser sessions and page refreshes.*

**Validates: Requirements 8.4**

### Property 34: Parameter-Specific Error Messages

*For any validation error on a parameter, the error message should be specific and actionable (e.g., "Email must be in format: user@example.com").*

**Validates: Requirements 9.3**

### Property 35: Error Message Clearing

*For any parameter with a displayed validation error, correcting the parameter value should clear the error message.*

**Validates: Requirements 9.4**

### Property 36: Code Sample Syntax Validity

*For any auto-generated code sample in any language, the code should be syntactically correct and executable in its respective environment.*

**Validates: Requirements 10.2**

### Property 37: cURL Sample Completeness

*For any generated cURL code sample, it should include all request headers, authentication, and request body (if applicable).*

**Validates: Requirements 10.3**

### Property 38: Python Sample Completeness

*For any generated Python code sample, it should import the requests library and include a proper error handling structure.*

**Validates: Requirements 10.4**

### Property 39: Node.js Sample Completeness

*For any generated Node.js code sample, it should use axios or the fetch API and include a proper error handling structure.*

**Validates: Requirements 10.5**

### Property 40: Reactive Code Generation

*For any parameter change in the RequestBuilder, all three code samples (cURL, Python, Node.js) should update immediately and reflect the new parameter values.*

**Validates: Requirements 10.6**

---

## 6. API Contracts

### 6.1 Sandbox API Endpoints

**People Search Endpoint**:
```
GET /v1/people-search
Query Parameters:
  - email (required): string (email format)
  - first_name (optional): string (max 50)
  - last_name (optional): string (max 50)

Request:
GET https://sandbox-api.zintlr.com/v1/people-search?email=john@example.com
Authorization: sk_test_***
Content-Type: application/json

Response (200 OK):
{
  "person": {
    "id": "person_123abc",
    "email": "john@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "phone": "+1-555-0123",
    "company": "Acme Corp",
    "title": "Senior Developer",
    "location": "San Francisco, CA"
  }
}
```

---

## 7. Error Handling

### 7.1 Request Execution Errors

```typescript
// Network error
{
  status: 0,
  data: { error: "Network request failed" },
  duration: 5000
}

// Validation error (400)
{
  status: 400,
  data: { error: "Invalid email format" },
  duration: 150
}

// Unauthorized (401) - shouldn't happen with sk_test_
{
  status: 401,
  data: { error: "Invalid API key" },
  duration: 50
}

// Not found (404)
{
  status: 404,
  data: { error: "Endpoint not found" },
  duration: 100
}

// Server error (500)
{
  status: 500,
  data: { error: "Internal server error" },
  duration: 2000
}
```

**Display Strategy**:
- Show user-friendly error message
- Log full error to console for debugging
- Disable submit button during error state
- Allow retry after error

---

## 8. Performance Considerations

### 8.1 Code Sample Generation
- Debounce parameter changes to regenerate code samples (200ms)
- Memoize endpoint metadata queries
- Lazy-load code samples in background

### 8.2 Sandbox API Calls
- Set request timeout to 10 seconds
- Show loading spinner after 500ms of latency
- Cancel in-flight requests on component unmount

### 8.3 Animation Performance
- Use `will-change: transform` for confetti animation
- Limit confetti particle count to 50-100
- Use `requestAnimationFrame` for smooth animation

---

## 9. Accessibility Considerations

### 9.1 WCAG 2.1 AA Compliance

- **Semantic HTML**: Use proper form elements, labels, and ARIA attributes
- **Keyboard Navigation**: All interactive elements accessible via keyboard
- **Focus Management**: Visible focus indicators, trap focus in modal
- **Color Contrast**: All text meets 4.5:1 contrast ratio minimum
- **Text Alternatives**: Icons have aria-labels or accompanying text
- **Error Messages**: Associated with form fields via aria-describedby
- **Animations**: Respect `prefers-reduced-motion`

### 9.2 Specific Implementations

```typescript
// Code sample tab
<button
  role="tab"
  aria-selected={activeTab === 'curl'}
  aria-controls="curl-panel"
  onClick={() => setActiveTab('curl')}
>
  cURL
</button>

// Parameter input
<input
  id="email-input"
  aria-label="Email address (required)"
  aria-required="true"
  aria-invalid={!!errors.email}
  aria-describedby={errors.email ? 'email-error' : undefined}
  required
/>
{errors.email && <div id="email-error">{errors.email}</div>}

// Modal
<dialog
  open={isOpen}
  onKeyDown={(e) => e.key === 'Escape' && onClose()}
  role="alertdialog"
  aria-label="API call success celebration"
>
  ...
</dialog>
```

---

## 10. Testing Strategy

### 10.1 Unit Tests
- Parameter validation functions
- Code sample generation (syntax correctness)
- Endpoint metadata structure
- Zustand store actions and selectors

### 10.2 Property-Based Tests (using fast-check or Hypothesis)
- For all endpoints, generated parameters should produce valid code samples
- For all parameter combinations, validation should be consistent
- For all viewport widths, layout should adapt correctly
- For all response structures, response viewer should render without errors

### 10.3 Integration Tests
- Sandbox API request/response flow
- First-call timestamp persistence across refresh
- Celebration modal display on first success, not on subsequent calls
- Navigation flow through all 4 wizard steps

### 10.4 E2E Tests
- Complete flow: signup → get API key → navigate to first-call → select endpoint → fill parameters → execute → see celebration
- Verify code samples are copy-pasteable and runnable
- Verify checklist updates across page navigation

---

## 11. Deployment & Rollout

### 11.1 Feature Flags
- `FEATURE_FIRST_CALL_WIZARD`: Enable/disable wizard
- `FEATURE_CELEBRATION_MODAL`: Enable/disable celebration on first call
- `SANDBOX_API_ENABLED`: Enable/disable sandbox API calls

### 11.2 Phased Rollout
1. **Phase 1**: Internal testing (0% of users)
2. **Phase 2**: Beta users (10% of new signups)
3. **Phase 3**: General availability (100% of new signups)

### 11.3 Monitoring
- Track completion rate through each wizard step
- Monitor celebration modal display rate
- Track first-call success rate
- Monitor code sample copy/paste usage
- Monitor sandbox API performance and error rates

---

## 12. Migration & Rollback

### 12.1 Database Changes
- Add `first_call_timestamp` nullable field to users table (backward compatible)
- Add `completed_onboarding_steps` JSON field to users table (backward compatible)

### 12.2 Rollback Plan
- Disable feature flag to hide UI
- Preserve state data for re-enablement
- No data migration required (backwards compatible)

