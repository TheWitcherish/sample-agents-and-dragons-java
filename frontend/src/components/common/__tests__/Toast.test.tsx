import { render, screen, fireEvent } from '../../../test/utils'
import { vi } from 'vitest'
import Toast from '../Toast'

describe('Toast', () => {
  const defaultProps = {
    id: 'test-toast',
    type: 'success' as const,
    title: 'Test Title',
    onClose: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should render toast with title', () => {
    render(<Toast {...defaultProps} />)
    
    expect(screen.getByText('Test Title')).toBeInTheDocument()
  })

  it('should render toast with message', () => {
    render(<Toast {...defaultProps} message="Test message" />)
    
    expect(screen.getByText('Test Title')).toBeInTheDocument()
    expect(screen.getByText('Test message')).toBeInTheDocument()
  })

  it('should display correct icon for each type', () => {
    const types = [
      { type: 'success' as const, icon: '✅' },
      { type: 'error' as const, icon: '❌' },
      { type: 'warning' as const, icon: '⚠️' },
      { type: 'info' as const, icon: 'ℹ️' },
    ]

    types.forEach(({ type, icon }) => {
      const { unmount } = render(<Toast {...defaultProps} type={type} />)
      expect(screen.getByText(icon)).toBeInTheDocument()
      unmount()
    })
  })

  it('should call onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(<Toast {...defaultProps} onClose={onClose} />)
    
    const closeButton = screen.getByRole('button', { name: /close notification/i })
    fireEvent.click(closeButton)
    
    expect(onClose).toHaveBeenCalledWith('test-toast')
  })

  it('should auto-close after duration', async () => {
    const onClose = vi.fn()
    render(<Toast {...defaultProps} onClose={onClose} duration={1000} />)
    
    expect(onClose).not.toHaveBeenCalled()
    
    // Fast-forward time
    vi.advanceTimersByTime(1000)
    
    // Wait for the callback to be called
    expect(onClose).toHaveBeenCalledWith('test-toast')
  })

  it('should use default duration if not provided', async () => {
    const onClose = vi.fn()
    render(<Toast {...defaultProps} onClose={onClose} />)
    
    vi.advanceTimersByTime(4999)
    expect(onClose).not.toHaveBeenCalled()
    
    vi.advanceTimersByTime(1)
    
    expect(onClose).toHaveBeenCalledWith('test-toast')
  })

  it('should have correct CSS classes for different types', () => {
    const types = ['success', 'error', 'warning', 'info'] as const
    
    types.forEach(type => {
      const { container, unmount } = render(<Toast {...defaultProps} type={type} />)
      const toast = container.querySelector('[class*="toast"]')
      expect(toast).toBeInTheDocument()
      
      // Check that the toast has a class containing the type
      const classList = Array.from(toast?.classList || [])
      const hasTypeClass = classList.some(className => className.includes(type))
      expect(hasTypeClass).toBe(true)
      
      unmount()
    })
  })

  it('should cleanup timer on unmount', () => {
    const onClose = vi.fn()
    const { unmount } = render(<Toast {...defaultProps} onClose={onClose} duration={1000} />)
    
    unmount()
    vi.advanceTimersByTime(1000)
    
    expect(onClose).not.toHaveBeenCalled()
  })
})