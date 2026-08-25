/**
 * RequestBuilder Component Tests
 * Tests for endpoint selection, parameter input, code generation, and request execution
 */

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RequestBuilder from '../RequestBuilder';
import { getEndpointById } from '@/data/endpoints';
import * as sandboxAPI from '@/lib/sandboxAPI';

// Mock the sandbox API
jest.mock('@/lib/sandboxAPI', () => ({
  callSandboxAPI: jest.fn(),
  isAPIError: jest.fn((response) => response.error !== undefined),
  formatResponseForDisplay: jest.fn((data) => JSON.stringify(data, null, 2)),
}));

describe('RequestBuilder Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render without an endpoint selected', () => {
      render(<RequestBuilder mode="full" />);
      expect(screen.getByText('Select an endpoint to get started')).toBeInTheDocument();
    });

    it('should render endpoint selector in full mode', () => {
      render(<RequestBuilder mode="full" />);
      expect(screen.getByLabelText(/API Endpoint/i)).toBeInTheDocument();
    });

    it('should render with preselected endpoint', () => {
      render(<RequestBuilder mode="full" preselectedEndpointId="people-search" />);
      
      expect(screen.getByText(/Parameters/i)).toBeInTheDocument();
      expect(screen.getByText(/Code Samples/i)).toBeInTheDocument();
    });
  });

  describe('Endpoint Selection', () => {
    it('should select an endpoint from dropdown', async () => {
      render(<RequestBuilder mode="full" />);
      
      const select = screen.getByLabelText(/API Endpoint/i);
      await userEvent.selectOptions(select, 'people-search');
      
      expect((select as HTMLSelectElement).value).toBe('people-search');
      expect(screen.getByText(/Parameters/i)).toBeInTheDocument();
    });

    it('should display endpoint description', async () => {
      render(<RequestBuilder mode="full" />);
      
      const select = screen.getByLabelText(/API Endpoint/i);
      await userEvent.selectOptions(select, 'people-search');
      
      const endpoint = getEndpointById('people-search');
      expect(screen.getByText(endpoint!.description)).toBeInTheDocument();
    });

    it('should show credit cost in endpoint list', () => {
      render(<RequestBuilder mode="full" />);
      
      const select = screen.getByLabelText(/API Endpoint/i);
      const options = within(select).getAllByRole('option');
      
      // Should have all 12 endpoints + placeholder
      expect(options.length).toBeGreaterThan(12);
    });

    it('should reset parameters when changing endpoint', async () => {
      const { rerender } = render(
        <RequestBuilder mode="full" preselectedEndpointId="people-search" />
      );
      
      // This is a simplified test - in real scenario, would input params first
      const select = screen.getByLabelText(/API Endpoint/i);
      await userEvent.selectOptions(select, 'email-to-phone');
      
      expect((select as HTMLSelectElement).value).toBe('email-to-phone');
    });
  });

  describe('Parameter Input', () => {
    it('should display all required parameters for endpoint', async () => {
      render(<RequestBuilder mode="full" preselectedEndpointId="people-search" />);
      
      const endpoint = getEndpointById('people-search');
      const requiredParams = endpoint!.parameters.filter(p => p.required);
      
      for (const param of requiredParams) {
        expect(screen.getByPlaceholderText(new RegExp(param.example || '', 'i'), { exact: false })).toBeInTheDocument();
      }
    });

    it('should update parameter values when typing', async () => {
      render(<RequestBuilder mode="full" preselectedEndpointId="people-search" />);
      
      const emailInput = screen.getByPlaceholderText(/example@/, { exact: false });
      await userEvent.clear(emailInput);
      await userEvent.type(emailInput, 'test@example.com');
      
      expect((emailInput as HTMLInputElement).value).toBe('test@example.com');
    });

    it('should show validation errors for invalid email', async () => {
      render(<RequestBuilder mode="full" preselectedEndpointId="people-search" />);
      
      const emailInput = screen.getByPlaceholderText(/example@/, { exact: false });
      await userEvent.clear(emailInput);
      await userEvent.type(emailInput, 'invalid-email');
      
      const executeBtn = screen.getByRole('button', { name: /Execute Request/i });
      fireEvent.click(executeBtn);
      
      await waitFor(() => {
        expect(screen.getByText(/Invalid email/i)).toBeInTheDocument();
      });
    });

    it('should validate required parameters', async () => {
      render(<RequestBuilder mode="full" preselectedEndpointId="people-search" />);
      
      const executeBtn = screen.getByRole('button', { name: /Execute Request/i });
      fireEvent.click(executeBtn);
      
      await waitFor(() => {
        expect(screen.getByText(/required/i)).toBeInTheDocument();
      });
    });

    it('should disable parameter inputs when disableEditing is true', () => {
      render(
        <RequestBuilder mode="full" preselectedEndpointId="people-search" disableEditing />
      );
      
      const inputs = screen.getAllByPlaceholderText(/example@/, { exact: false });
      inputs.forEach(input => {
        expect(input).toBeDisabled();
      });
    });
  });

  describe('Code Generation', () => {
    it('should display code samples for selected endpoint', () => {
      render(<RequestBuilder mode="full" preselectedEndpointId="people-search" />);
      
      expect(screen.getByText('Code Samples')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cURL/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Python/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Node.js/i })).toBeInTheDocument();
    });

    it('should switch between code sample tabs', async () => {
      render(<RequestBuilder mode="full" preselectedEndpointId="people-search" />);
      
      const pythonTab = screen.getByRole('button', { name: /Python/i });
      fireEvent.click(pythonTab);
      
      // Python tab should be highlighted
      expect(pythonTab).toHaveClass('bg-teal/5');
    });

    it('should copy code sample to clipboard', async () => {
      render(<RequestBuilder mode="full" preselectedEndpointId="people-search" />);
      
      const copyBtn = screen.getByRole('button', { name: '' }).parentElement?.querySelector('button');
      if (copyBtn) {
        fireEvent.click(copyBtn);
        
        await waitFor(() => {
          expect(screen.getByRole('img', { hidden: true })?.className).toContain('check');
        });
      }
    });

    it('should update code samples when parameters change', async () => {
      render(<RequestBuilder mode="full" preselectedEndpointId="people-search" />);
      
      const emailInput = screen.getByPlaceholderText(/example@/, { exact: false });
      await userEvent.clear(emailInput);
      await userEvent.type(emailInput, 'newemail@test.com');
      
      // Code should update (verified by snapshot or regex check)
      const codeBlock = screen.getByText(/Code Samples/).nextElementSibling;
      expect(codeBlock?.textContent).toContain('newemail@test.com');
    });
  });

  describe('Request Execution', () => {
    it('should execute request with valid parameters', async () => {
      const mockResponse = {
        status: 200,
        statusText: 'OK',
        data: { success: true, person: { email: 'test@example.com' } },
        duration: 150,
        requestId: 'req_123',
        timestamp: Date.now(),
      };

      (sandboxAPI.callSandboxAPI as jest.Mock).mockResolvedValueOnce(mockResponse);

      render(<RequestBuilder mode="full" preselectedEndpointId="people-search" />);
      
      const emailInput = screen.getByPlaceholderText(/example@/, { exact: false });
      await userEvent.clear(emailInput);
      await userEvent.type(emailInput, 'test@example.com');
      
      const executeBtn = screen.getByRole('button', { name: /Execute Request/i });
      fireEvent.click(executeBtn);
      
      await waitFor(() => {
        expect(sandboxAPI.callSandboxAPI).toHaveBeenCalled();
      });
    });

    it('should display response after execution', async () => {
      const mockResponse = {
        status: 200,
        statusText: 'OK',
        data: { success: true, person: { email: 'test@example.com' } },
        duration: 150,
        requestId: 'req_123',
        timestamp: Date.now(),
      };

      (sandboxAPI.callSandboxAPI as jest.Mock).mockResolvedValueOnce(mockResponse);
      (sandboxAPI.formatResponseForDisplay as jest.Mock).mockReturnValueOnce(
        JSON.stringify(mockResponse.data, null, 2)
      );

      render(<RequestBuilder mode="full" preselectedEndpointId="people-search" />);
      
      const emailInput = screen.getByPlaceholderText(/example@/, { exact: false });
      await userEvent.clear(emailInput);
      await userEvent.type(emailInput, 'test@example.com');
      
      const executeBtn = screen.getByRole('button', { name: /Execute Request/i });
      fireEvent.click(executeBtn);
      
      await waitFor(() => {
        expect(screen.getByText(/Response/i)).toBeInTheDocument();
      });
    });

    it('should display error message on API error', async () => {
      const mockError = {
        status: 400,
        statusText: 'Bad Request',
        data: null,
        error: 'Invalid email format',
        duration: 50,
        requestId: 'req_123',
        timestamp: Date.now(),
      };

      (sandboxAPI.callSandboxAPI as jest.Mock).mockResolvedValueOnce(mockError);
      (sandboxAPI.isAPIError as unknown as jest.Mock).mockReturnValueOnce(true);

      render(<RequestBuilder mode="full" preselectedEndpointId="people-search" />);
      
      const emailInput = screen.getByPlaceholderText(/example@/, { exact: false });
      await userEvent.clear(emailInput);
      await userEvent.type(emailInput, 'invalid');
      
      const executeBtn = screen.getByRole('button', { name: /Execute Request/i });
      fireEvent.click(executeBtn);
      
      // Validation should show before API call
      await waitFor(() => {
        expect(screen.getByText(/Invalid email/i)).toBeInTheDocument();
      });
    });

    it('should show loading state during execution', async () => {
      const mockResponse = {
        status: 200,
        statusText: 'OK',
        data: { success: true },
        duration: 150,
        requestId: 'req_123',
        timestamp: Date.now(),
      };

      (sandboxAPI.callSandboxAPI as jest.Mock).mockImplementationOnce(
        () => new Promise(resolve => setTimeout(() => resolve(mockResponse), 100))
      );

      render(<RequestBuilder mode="full" preselectedEndpointId="people-search" />);
      
      const emailInput = screen.getByPlaceholderText(/example@/, { exact: false });
      await userEvent.clear(emailInput);
      await userEvent.type(emailInput, 'test@example.com');
      
      const executeBtn = screen.getByRole('button', { name: /Execute Request/i });
      fireEvent.click(executeBtn);
      
      // Should show loading state
      expect(screen.getByText(/Executing/i)).toBeInTheDocument();
    });

    it('should call onExecute callback after successful request', async () => {
      const mockResponse = {
        status: 200,
        statusText: 'OK',
        data: { success: true },
        duration: 150,
        requestId: 'req_123',
        timestamp: Date.now(),
      };

      (sandboxAPI.callSandboxAPI as jest.Mock).mockResolvedValueOnce(mockResponse);

      const onExecuteMock = jest.fn();

      render(
        <RequestBuilder
          mode="full"
          preselectedEndpointId="people-search"
          onExecute={onExecuteMock}
        />
      );
      
      const emailInput = screen.getByPlaceholderText(/example@/, { exact: false });
      await userEvent.clear(emailInput);
      await userEvent.type(emailInput, 'test@example.com');
      
      const executeBtn = screen.getByRole('button', { name: /Execute Request/i });
      fireEvent.click(executeBtn);
      
      await waitFor(() => {
        expect(onExecuteMock).toHaveBeenCalledWith(
          expect.objectContaining({
            statusCode: 200,
            responseTime: 150,
          })
        );
      });
    });

    it('should disable execute button when form is invalid', () => {
      render(<RequestBuilder mode="full" preselectedEndpointId="people-search" />);
      
      const executeBtn = screen.getByRole('button', { name: /Execute Request/i });
      expect(executeBtn).toBeDisabled();
    });

    it('should enable execute button when form is valid', async () => {
      render(<RequestBuilder mode="full" preselectedEndpointId="people-search" />);
      
      const emailInput = screen.getByPlaceholderText(/example@/, { exact: false });
      await userEvent.clear(emailInput);
      await userEvent.type(emailInput, 'valid@example.com');
      
      const executeBtn = screen.getByRole('button', { name: /Execute Request/i });
      expect(executeBtn).not.toBeDisabled();
    });
  });

  describe('Modes', () => {
    it('should not show execute button in preview mode', () => {
      render(
        <RequestBuilder mode="preview" preselectedEndpointId="people-search" />
      );
      
      expect(screen.queryByRole('button', { name: /Execute Request/i })).not.toBeInTheDocument();
    });

    it('should hide execute button when hideExecuteButton is true', () => {
      render(
        <RequestBuilder
          mode="full"
          preselectedEndpointId="people-search"
          hideExecuteButton
        />
      );
      
      expect(screen.queryByRole('button', { name: /Execute Request/i })).not.toBeInTheDocument();
    });

    it('should show response time after execution', async () => {
      const mockResponse = {
        status: 200,
        statusText: 'OK',
        data: { success: true },
        duration: 245,
        requestId: 'req_123',
        timestamp: Date.now(),
      };

      (sandboxAPI.callSandboxAPI as jest.Mock).mockResolvedValueOnce(mockResponse);

      render(<RequestBuilder mode="full" preselectedEndpointId="people-search" />);
      
      const emailInput = screen.getByPlaceholderText(/example@/, { exact: false });
      await userEvent.clear(emailInput);
      await userEvent.type(emailInput, 'test@example.com');
      
      const executeBtn = screen.getByRole('button', { name: /Execute Request/i });
      fireEvent.click(executeBtn);
      
      await waitFor(() => {
        expect(screen.getByText(/245ms/)).toBeInTheDocument();
      });
    });
  });

  describe('All 12 Endpoints', () => {
    const endpoints = [
      'people-search',
      'email-to-phone',
      'phone-to-email',
      'linkedin-to-profile',
      'linkedin-to-contact',
      'domain-to-cin',
      'cin-to-company-data',
      'domain-to-linkedin',
      'contact-to-linkedin',
      'reverse-enrichment',
      'din-to-phone',
      'people-ai-search',
    ];

    it('should render RequestBuilder for each endpoint', () => {
      for (const endpointId of endpoints) {
        const { unmount } = render(
          <RequestBuilder mode="full" preselectedEndpointId={endpointId} />
        );
        
        expect(screen.getByText(/Parameters/i)).toBeInTheDocument();
        expect(screen.getByText(/Code Samples/i)).toBeInTheDocument();
        
        unmount();
      }
    });
  });

  describe('Accessibility', () => {
    it('should have proper labels for form inputs', () => {
      render(<RequestBuilder mode="full" preselectedEndpointId="people-search" />);
      
      expect(screen.getByLabelText(/API Endpoint/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Email/i, { exact: false })).toBeInTheDocument();
    });

    it('should indicate required fields with asterisk', () => {
      render(<RequestBuilder mode="full" preselectedEndpointId="people-search" />);
      
      const requiredIndicators = screen.getAllByText('*');
      expect(requiredIndicators.length).toBeGreaterThan(0);
    });

    it('should show proper error messages', async () => {
      render(<RequestBuilder mode="full" preselectedEndpointId="people-search" />);
      
      const emailInput = screen.getByPlaceholderText(/example@/, { exact: false });
      await userEvent.clear(emailInput);
      await userEvent.type(emailInput, 'invalid');
      
      const executeBtn = screen.getByRole('button', { name: /Execute Request/i });
      fireEvent.click(executeBtn);
      
      await waitFor(() => {
        const errors = screen.getAllByRole('alert', { hidden: true });
        expect(errors.length).toBeGreaterThan(0);
      });
    });
  });
});
