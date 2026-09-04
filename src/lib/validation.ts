/**
 * Validation System
 * Type-specific validators for API request parameters with actionable error messages.
 * Supports: email, phone, string, number with required/optional, length, and range validation.
 */

import { EndpointParameter, ParameterType } from '@/data/endpoints';

export type ValidationResult = {
  isValid: boolean;
  error?: string;
};

/**
 * Email validation regex - RFC 5322 simplified
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Phone validation regex - 10-15 digits, flexible formatting
 */
const PHONE_REGEX = /^\d{10,15}$/;

/**
 * URL validation regex - basic http/https URLs
 */
const URL_REGEX = /^https?:\/\/.+\..+/;

/**
 * Generic validator for any parameter
 * Returns validation result with specific, actionable error messages
 */
export function validateParameter(
  parameter: EndpointParameter,
  value: unknown
): ValidationResult {
  // Handle undefined/null values
  if (value === undefined || value === null || value === '') {
    if (parameter.required) {
      return {
        isValid: false,
        error: `${formatParameterName(parameter.name)} is required`,
      };
    }
    return { isValid: true };
  }

  const stringValue = String(value).trim();

  // Empty string after trim
  if (stringValue === '') {
    if (parameter.required) {
      return {
        isValid: false,
        error: `${formatParameterName(parameter.name)} cannot be empty`,
      };
    }
    return { isValid: true };
  }

  // Type-specific validation
  switch (parameter.type) {
    case 'email':
      return validateEmail(parameter, stringValue);

    case 'phone':
      return validatePhone(parameter, stringValue);

    case 'number':
      return validateNumber(parameter, stringValue);

    case 'string':
      return validateString(parameter, stringValue);

    default:
      return { isValid: true };
  }
}

/**
 * Validate email parameter
 */
function validateEmail(
  parameter: EndpointParameter,
  value: string
): ValidationResult {
  if (!EMAIL_REGEX.test(value)) {
    return {
      isValid: false,
      error: `${formatParameterName(parameter.name)} must be a valid email address (e.g., user@example.com)`,
    };
  }

  // Check length if specified
  if (parameter.maxLength && value.length > parameter.maxLength) {
    return {
      isValid: false,
      error: `${formatParameterName(parameter.name)} must not exceed ${parameter.maxLength} characters`,
    };
  }

  return { isValid: true };
}

/**
 * Validate phone parameter
 * Accepts: 10-15 digits, flexible formatting (spaces, dashes, parentheses, +)
 */
function validatePhone(
  parameter: EndpointParameter,
  value: string
): ValidationResult {
  // Remove common formatting characters
  const digitsOnly = value.replace(/[\s\-().+]/g, '');

  if (!PHONE_REGEX.test(digitsOnly)) {
    return {
      isValid: false,
      error: `${formatParameterName(parameter.name)} must be 10-15 digits (e.g., 555-123-4567 or 5551234567)`,
    };
  }

  return { isValid: true };
}

/**
 * Validate number parameter
 */
function validateNumber(
  parameter: EndpointParameter,
  value: string
): ValidationResult {
  const num = Number(value);

  if (isNaN(num)) {
    return {
      isValid: false,
      error: `${formatParameterName(parameter.name)} must be a valid number`,
    };
  }

  // Check minimum value
  if (parameter.minValue !== undefined && num < parameter.minValue) {
    return {
      isValid: false,
      error: `${formatParameterName(parameter.name)} must be at least ${parameter.minValue}`,
    };
  }

  // Check maximum value
  if (parameter.maxValue !== undefined && num > parameter.maxValue) {
    return {
      isValid: false,
      error: `${formatParameterName(parameter.name)} must be no more than ${parameter.maxValue}`,
    };
  }

  return { isValid: true };
}

/**
 * Validate string parameter
 */
function validateString(
  parameter: EndpointParameter,
  value: string
): ValidationResult {
  // Check length
  if (parameter.maxLength && value.length > parameter.maxLength) {
    return {
      isValid: false,
      error: `${formatParameterName(parameter.name)} must not exceed ${parameter.maxLength} characters (currently ${value.length})`,
    };
  }

  // Special validation for URLs in linkedin_url parameters
  if (parameter.name.includes('linkedin') && !URL_REGEX.test(value)) {
    return {
      isValid: false,
      error: `${formatParameterName(parameter.name)} must be a valid URL (e.g., https://www.linkedin.com/in/username)`,
    };
  }

  return { isValid: true };
}

/**
 * Format parameter name from snake_case to Title Case
 * Examples: first_name -> First Name, email -> Email
 */
function formatParameterName(name: string): string {
  return name
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Validate all parameters for a set of values
 * Returns map of parameter name -> error message
 */
export function validateAllParameters(
  parameters: EndpointParameter[],
  values: Record<string, unknown>
): Record<string, string> {
  const errors: Record<string, string> = {};

  parameters.forEach(param => {
    const result = validateParameter(param, values[param.name]);
    if (!result.isValid && result.error) {
      errors[param.name] = result.error;
    }
  });

  return errors;
}

/**
 * Check if there are any validation errors
 */
export function hasValidationErrors(errors: Record<string, string>): boolean {
  return Object.keys(errors).length > 0;
}

/**
 * Get first validation error message
 * Useful for displaying a single error in forms
 */
export function getFirstError(errors: Record<string, string>): string | null {
  const keys = Object.keys(errors);
  return keys.length > 0 ? errors[keys[0]] : null;
}

/**
 * Sanitize phone number - remove all non-digits
 */
export function sanitizePhone(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Trim and lowercase email
 */
export function sanitizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Type guard: check if parameter type is valid
 */
export function isValidParameterType(type: unknown): type is ParameterType {
  return typeof type === 'string' && ['string', 'email', 'phone', 'number'].includes(type);
}

/**
 * Get validation hint for a parameter type
 * Useful for displaying placeholder text or hints
 */
export function getValidationHint(parameter: EndpointParameter): string {
  switch (parameter.type) {
    case 'email':
      return 'Must be a valid email (e.g., user@example.com)';
    case 'phone':
      return 'Must be 10-15 digits (formatting optional)';
    case 'number':
      let hint = 'Must be a number';
      if (parameter.minValue !== undefined) {
        hint += ` (min: ${parameter.minValue}`;
      }
      if (parameter.maxValue !== undefined) {
        hint += `, max: ${parameter.maxValue}`;
      }
      if (parameter.minValue !== undefined || parameter.maxValue !== undefined) {
        hint += ')';
      }
      return hint;
    case 'string':
      if (parameter.maxLength) {
        return `Maximum ${parameter.maxLength} characters`;
      }
      return 'Text input';
    default:
      return '';
  }
}

/**
 * Batch validation for multiple parameter sets
 * Useful for bulk operations
 */
export function batchValidateParameters(
  parameters: EndpointParameter[],
  valueSets: Record<string, unknown>[]
): { index: number; errors: Record<string, string> }[] {
  return valueSets
    .map((values, index) => ({
      index,
      errors: validateAllParameters(parameters, values),
    }))
    .filter(result => hasValidationErrors(result.errors));
}

/**
 * Validation results with detailed info for UI display
 */
export interface ValidationError {
  field: string;
  message: string;
  type: ParameterType;
}

/**
 * Convert validation errors to array format for easier UI rendering
 */
export function validationErrorsToArray(
  parameters: EndpointParameter[],
  errors: Record<string, string>
): ValidationError[] {
  return Object.entries(errors).map(([field, message]) => {
    const param = parameters.find(p => p.name === field);
    return {
      field,
      message,
      type: param?.type || 'string',
    };
  });
}
