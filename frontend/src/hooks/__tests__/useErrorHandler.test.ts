import { renderHook, act, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { useErrorHandler, getErrorMessage, withRetry } from '../useErrorHandler'

describe('useErrorHandler', () => {
  it('should initialize with no error and not loading', () => {
    const { result } = renderHook(() => useErrorHandler())
    
    expect(result.current.error).toBeNull()
    expect(result.current.isLoading).toBe(false)
  })

  it('should handle successful async operation', async () => {
    const { result } = renderHook(() => useErrorHandler())
    const mockFn = vi.fn().mockResolvedValue('success')
    const onSuccess = vi.fn()
    
    let promise: Promise<string | null>
    act(() => {
      promise = result.current.handleAsync(mockFn, { onSuccess })
    })
    
    expect(result.current.isLoading).toBe(true)
    expect(result.current.error).toBeNull()
    
    const response = await act(async () => await promise)
    
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    
    expect(response).toBe('success')
    expect(result.current.error).toBeNull()
    expect(onSuccess).toHaveBeenCalledWith('success')
  })

  it('should handle failed async operation', async () => {
    const { result } = renderHook(() => useErrorHandler())
    const error = new Error('Test error')
    const mockFn = vi.fn().mockRejectedValue(error)
    const onError = vi.fn()
    
    let promise: Promise<string | null>
    act(() => {
      promise = result.current.handleAsync(mockFn, { onError })
    })
    
    expect(result.current.isLoading).toBe(true)
    
    const response = await act(async () => await promise)
    
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    
    expect(response).toBeNull()
    expect(result.current.error).toBe('Test error')
    expect(onError).toHaveBeenCalledWith(error)
  })

  it('should clear error', () => {
    const { result } = renderHook(() => useErrorHandler())
    
    act(() => {
      result.current.handleAsync(() => Promise.reject(new Error('Test')))
    })
    
    act(() => {
      result.current.clearError()
    })
    
    expect(result.current.error).toBeNull()
  })
})

describe('getErrorMessage', () => {
  it('should return error message for Error objects', () => {
    const error = new Error('Test error')
    expect(getErrorMessage(error)).toBe('Test error')
  })

  it('should return user-friendly message for network errors', () => {
    const error = new Error('Network Error')
    expect(getErrorMessage(error)).toBe('Network connection failed. Please check your internet connection and try again.')
  })

  it('should return user-friendly message for unauthorized errors', () => {
    const error = new Error('Unauthorized')
    expect(getErrorMessage(error)).toBe('You are not authorized to perform this action. Please sign in again.')
  })

  it('should return user-friendly message for validation errors', () => {
    const error = new Error('ValidationException: Invalid input')
    expect(getErrorMessage(error)).toBe('The provided data is invalid. Please check your input and try again.')
  })

  it('should return string errors as-is', () => {
    expect(getErrorMessage('String error')).toBe('String error')
  })

  it('should return default message for unknown errors', () => {
    expect(getErrorMessage({})).toBe('An unexpected error occurred. Please try again.')
  })
})

describe('withRetry', () => {
  it('should succeed on first try', async () => {
    const mockFn = vi.fn().mockResolvedValue('success')
    
    const result = await withRetry(mockFn, 3)
    
    expect(result).toBe('success')
    expect(mockFn).toHaveBeenCalledTimes(1)
  })

  it('should retry on failure and eventually succeed', async () => {
    const mockFn = vi.fn()
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockRejectedValueOnce(new Error('Fail 2'))
      .mockResolvedValue('success')
    
    const result = await withRetry(mockFn, 3)
    
    expect(result).toBe('success')
    expect(mockFn).toHaveBeenCalledTimes(3)
  })

  it('should throw last error after max retries', async () => {
    const error = new Error('Final error')
    const mockFn = vi.fn().mockRejectedValue(error)
    
    await expect(withRetry(mockFn, 2)).rejects.toThrow('Final error')
    expect(mockFn).toHaveBeenCalledTimes(3) // Initial + 2 retries
  })
})