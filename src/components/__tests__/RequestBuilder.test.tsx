/**
 * RequestBuilder Component Tests — written against the real component API.
 *
 * The component fires a real same-origin `fetch('/api/v1/...')` (through the gateway),
 * so we mock `globalThis.fetch` rather than the retired client-side sandbox helper.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RequestBuilder from '../RequestBuilder';
import { getEndpointById } from '@/data/endpoints';

interface MockResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  headers?: Record<string, string>;
  body: unknown;
}

/** Install a fetch mock resolving to the given response; returns the jest.fn for assertions. */
function mockFetch(res: MockResponse) {
  const fn = jest.fn().mockResolvedValue({
    ok: res.ok,
    status: res.status,
    statusText: res.statusText ?? '',
    headers: new Headers(res.headers ?? { 'x-request-id': 'req_test_1', 'x-credits-remaining': '998' }),
    json: async () => res.body,
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

const SUCCESS: MockResponse = {
  ok: true,
  status: 200,
  body: { success: true, data: { email: 'a@b.com', phone: '+1-555-0123', confidence: 0.95 } },
};

const readCode = () => document.querySelector('pre code')?.textContent ?? '';

describe('RequestBuilder Component', () => {
  const peopleSearch = getEndpointById('people-search')!;

  beforeAll(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: jest.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch(SUCCESS);
  });

  describe('Rendering', () => {
    it('renders the endpoint selector in full mode when nothing is selected', () => {
      render(<RequestBuilder mode="full" />);
      expect(screen.getByText('API Endpoint *')).toBeInTheDocument();
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('shows a designed placeholder (never blank) in non-editable mode with no endpoint', () => {
      render(<RequestBuilder mode="preview" />);
      expect(screen.getByText('Select an endpoint to get started')).toBeInTheDocument();
    });

    it('renders parameters and code samples for a preselected endpoint', () => {
      render(<RequestBuilder mode="full" preselectedEndpointId="people-search" />);
      expect(screen.getByPlaceholderText('user@example.com')).toBeInTheDocument();
      expect(screen.getByText('Code Samples')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Execute Request/i })).toBeInTheDocument();
    });
  });

  describe('Endpoint Selection', () => {
    it('lists endpoints with their credit cost', () => {
      render(<RequestBuilder mode="full" />);
      expect(screen.getByRole('option', { name: /People Search \(1 credit\)/ })).toBeInTheDocument();
    });

    it('selecting an endpoint shows its description and parameters', () => {
      render(<RequestBuilder mode="full" />);
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'people-search' } });
      expect(screen.getByText(peopleSearch.description)).toBeInTheDocument();
      expect(screen.getByPlaceholderText('user@example.com')).toBeInTheDocument();
    });

    it('resets entered parameters when the endpoint changes', async () => {
      const user = userEvent.setup();
      render(<RequestBuilder mode="full" preselectedEndpointId="people-search" />);
      await user.type(screen.getByPlaceholderText('user@example.com'), 'a@b.com');

      const [endpointSelect] = screen.getAllByRole('combobox');
      fireEvent.change(endpointSelect, { target: { value: 'email-to-phone' } });

      expect(screen.getByPlaceholderText('user@company.com')).toHaveValue('');
    });
  });

  describe('Parameter Input & Validation', () => {
    it('updates a parameter value when typing', async () => {
      const user = userEvent.setup();
      render(<RequestBuilder mode="full" preselectedEndpointId="people-search" />);
      const input = screen.getByPlaceholderText('user@example.com');
      await user.type(input, 'a@b.com');
      expect(input).toHaveValue('a@b.com');
    });

    it('blocks execution and shows an error when a required parameter is missing', async () => {
      const user = userEvent.setup();
      const fetchMock = mockFetch(SUCCESS);
      render(<RequestBuilder mode="full" preselectedEndpointId="people-search" />);
      await user.click(screen.getByRole('button', { name: /Execute Request/i }));
      expect(await screen.findByText(/is required/i)).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('blocks execution on an invalid email', async () => {
      const user = userEvent.setup();
      const fetchMock = mockFetch(SUCCESS);
      render(<RequestBuilder mode="full" preselectedEndpointId="people-search" />);
      await user.type(screen.getByPlaceholderText('user@example.com'), 'not-an-email');
      await user.click(screen.getByRole('button', { name: /Execute Request/i }));
      expect(await screen.findByText(/must be a valid email address/i)).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('hides editing controls but still shows code samples when disableEditing is set', () => {
      render(<RequestBuilder mode="full" preselectedEndpointId="people-search" disableEditing />);
      expect(screen.queryByText('API Endpoint *')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Execute Request/i })).not.toBeInTheDocument();
      expect(screen.getByText('Code Samples')).toBeInTheDocument();
    });
  });

  describe('Code Generation', () => {
    it('shows language tabs and switches the sample', async () => {
      const user = userEvent.setup();
      render(<RequestBuilder mode="full" preselectedEndpointId="people-search" />);
      expect(readCode()).toContain('curl');
      await user.click(screen.getByRole('button', { name: /Python/i }));
      expect(readCode()).not.toContain('curl -X');
      expect(readCode()).toContain('Authorization');
    });

    it('reflects typed parameters in the generated sample', async () => {
      const user = userEvent.setup();
      render(<RequestBuilder mode="full" preselectedEndpointId="people-search" />);
      await user.type(screen.getByPlaceholderText('user@example.com'), 'a@b.com');
      await waitFor(() => expect(readCode()).toContain('a%40b.com'));
    });

    it('copies the active sample to the clipboard', () => {
      // user-event installs its own clipboard stub, so spy directly and click with fireEvent.
      const writeText = jest.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      render(<RequestBuilder mode="full" preselectedEndpointId="people-search" />);
      fireEvent.click(screen.getByRole('button', { name: 'Copy code sample' }));
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Authorization'));
    });
  });

  describe('Request Execution', () => {
    it('calls the real gateway route with the key and notifies onExecute on success', async () => {
      const user = userEvent.setup();
      const fetchMock = mockFetch(SUCCESS);
      const onExecute = jest.fn();
      render(<RequestBuilder mode="full" preselectedEndpointId="people-search" onExecute={onExecute} />);

      await user.type(screen.getByPlaceholderText('user@example.com'), 'a@b.com');
      await user.click(screen.getByRole('button', { name: /Execute Request/i }));

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/api/v1/people?');
      expect(url).toContain('email=a%40b.com');
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk_test_demo_key');

      await waitFor(() => expect(onExecute).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 200 })));
    });

    it('renders the response body after a successful call', async () => {
      const user = userEvent.setup();
      render(<RequestBuilder mode="full" preselectedEndpointId="people-search" />);
      await user.type(screen.getByPlaceholderText('user@example.com'), 'a@b.com');
      await user.click(screen.getByRole('button', { name: /Execute Request/i }));
      expect(await screen.findByText(/555-0123/)).toBeInTheDocument();
    });

    it('surfaces the gateway error message on a failed call', async () => {
      const user = userEvent.setup();
      mockFetch({ ok: false, status: 429, body: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' } } });
      render(<RequestBuilder mode="full" preselectedEndpointId="people-search" />);
      await user.type(screen.getByPlaceholderText('user@example.com'), 'a@b.com');
      await user.click(screen.getByRole('button', { name: /Execute Request/i }));
      // Match the gateway's message, not the "429 Too Many Requests" simulate-status option.
      expect(await screen.findByText(/Please slow down/i)).toBeInTheDocument();
    });

    it('shows a loading state while the request is in flight', async () => {
      const user = userEvent.setup();
      let resolve!: (v: unknown) => void;
      const pending = new Promise((r) => { resolve = r; });
      globalThis.fetch = jest.fn().mockReturnValue(pending) as unknown as typeof fetch;

      render(<RequestBuilder mode="full" preselectedEndpointId="people-search" />);
      await user.type(screen.getByPlaceholderText('user@example.com'), 'a@b.com');
      await user.click(screen.getByRole('button', { name: /Execute Request/i }));

      expect(screen.getByText(/Executing/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Executing/i })).toBeDisabled();

      resolve({
        ok: true, status: 200, statusText: 'OK',
        headers: new Headers({ 'x-request-id': 'req_test_2' }),
        json: async () => SUCCESS.body,
      });
      expect(await screen.findByText(/555-0123/)).toBeInTheDocument();
    });
  });
});
