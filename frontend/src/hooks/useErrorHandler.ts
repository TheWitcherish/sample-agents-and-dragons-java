import { useState, useCallback } from 'react';

interface UseErrorHandlerReturn {
  error: string | null;
  isLoading: boolean;
  clearError: () => void;
  handleAsync: <T>(
    asyncFn: () => Promise<T>,
    options?: {
      onSuccess?: (result: T) => void;
      onError?: (error: Error) => void;
      loadingMessage?: string;
    }
  ) => Promise<T | null>;
}

export const useErrorHandler = (): UseErrorHandlerReturn => {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const handleAsync = useCallback(async <T>(
    asyncFn: () => Promise<T>,
    options?: {
      onSuccess?: (result: T) => void;
      onError?: (error: Error) => void;
      loadingMessage?: string;
    }
  ): Promise<T | null> => {
    try {
      setIsLoading(true);
      setError(null);
      
      const result = await asyncFn();
      
      if (options?.onSuccess) {
        options.onSuccess(result);
      }
      
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('An unexpected error occurred');
      
      console.error('Async operation failed:', error);
      setError(error.message);
      
      if (options?.onError) {
        options.onError(error);
      }
      
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    error,
    isLoading,
    clearError,
    handleAsync,
  };
};

// Utility function for handling common API errors
export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    // Handle specific AWS/GraphQL errors
    if (error.message.includes('Network Error')) {
      return 'Network connection failed. Please check your internet connection and try again.';
    }
    
    if (error.message.includes('Unauthorized')) {
      return 'You are not authorized to perform this action. Please sign in again.';
    }
    
    if (error.message.includes('ValidationException')) {
      return 'The provided data is invalid. Please check your input and try again.';
    }
    
    if (error.message.includes('ResourceNotFoundException')) {
      return 'The requested resource was not found. It may have been deleted.';
    }
    
    if (error.message.includes('ThrottlingException')) {
      return 'Too many requests. Please wait a moment and try again.';
    }
    
    return error.message;
  }
  
  if (typeof error === 'string') {
    return error;
  }
  
  return 'An unexpected error occurred. Please try again.';
};

// Retry utility with exponential backoff
export const withRetry = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> => {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      
      if (attempt === maxRetries) {
        throw lastError;
      }
      
      // Exponential backoff with jitter
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
};