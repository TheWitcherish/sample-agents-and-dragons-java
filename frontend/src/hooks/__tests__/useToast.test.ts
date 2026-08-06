import { renderHook, act } from '@testing-library/react'
import { useToast } from '../useToast'

describe('useToast', () => {
  it('should initialize with empty toasts array', () => {
    const { result } = renderHook(() => useToast())
    
    expect(result.current.toasts).toEqual([])
  })

  it('should add a success toast', () => {
    const { result } = renderHook(() => useToast())
    
    act(() => {
      result.current.success('Success!', 'Operation completed')
    })
    
    expect(result.current.toasts).toHaveLength(1)
    expect(result.current.toasts[0]).toMatchObject({
      type: 'success',
      title: 'Success!',
      message: 'Operation completed',
    })
    expect(result.current.toasts[0].id).toBeDefined()
  })

  it('should add an error toast with longer duration', () => {
    const { result } = renderHook(() => useToast())
    
    act(() => {
      result.current.error('Error!', 'Something went wrong')
    })
    
    expect(result.current.toasts).toHaveLength(1)
    expect(result.current.toasts[0]).toMatchObject({
      type: 'error',
      title: 'Error!',
      message: 'Something went wrong',
      duration: 7000,
    })
  })

  it('should add warning and info toasts', () => {
    const { result } = renderHook(() => useToast())
    
    act(() => {
      result.current.warning('Warning!', 'Be careful')
      result.current.info('Info', 'Just so you know')
    })
    
    expect(result.current.toasts).toHaveLength(2)
    expect(result.current.toasts[0].type).toBe('warning')
    expect(result.current.toasts[1].type).toBe('info')
  })

  it('should remove a specific toast', () => {
    const { result } = renderHook(() => useToast())
    
    let toastId: string
    act(() => {
      toastId = result.current.success('Test')
      result.current.error('Another test')
    })
    
    expect(result.current.toasts).toHaveLength(2)
    
    act(() => {
      result.current.removeToast(toastId)
    })
    
    expect(result.current.toasts).toHaveLength(1)
    expect(result.current.toasts[0].type).toBe('error')
  })

  it('should clear all toasts', () => {
    const { result } = renderHook(() => useToast())
    
    act(() => {
      result.current.success('Test 1')
      result.current.error('Test 2')
      result.current.warning('Test 3')
    })
    
    expect(result.current.toasts).toHaveLength(3)
    
    act(() => {
      result.current.clearAllToasts()
    })
    
    expect(result.current.toasts).toHaveLength(0)
  })

  it('should generate unique IDs for toasts', () => {
    const { result } = renderHook(() => useToast())
    
    let id1: string, id2: string
    act(() => {
      id1 = result.current.success('Test 1')
      id2 = result.current.success('Test 2')
    })
    
    expect(id1).not.toBe(id2)
    expect(result.current.toasts[0].id).toBe(id1)
    expect(result.current.toasts[1].id).toBe(id2)
  })
})