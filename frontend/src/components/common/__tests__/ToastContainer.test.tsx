import { render, screen } from '../../../test/utils'
import { vi } from 'vitest'
import ToastContainer from '../ToastContainer'
import type { ToastData } from '../ToastContainer'

describe('ToastContainer', () => {
  const mockToasts: ToastData[] = [
    {
      id: '1',
      type: 'success',
      title: 'Success Toast',
      message: 'Operation completed successfully',
    },
    {
      id: '2',
      type: 'error',
      title: 'Error Toast',
      duration: 3000,
    },
  ]

  const mockOnRemoveToast = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render nothing when no toasts provided', () => {
    const { container } = render(
      <ToastContainer toasts={[]} onRemoveToast={mockOnRemoveToast} />
    )
    
    expect(container.firstChild).toBeNull()
  })

  it('should render all toasts in portal', () => {
    render(
      <ToastContainer toasts={mockToasts} onRemoveToast={mockOnRemoveToast} />
    )
    
    expect(screen.getByText('Success Toast')).toBeInTheDocument()
    expect(screen.getByText('Operation completed successfully')).toBeInTheDocument()
    expect(screen.getByText('Error Toast')).toBeInTheDocument()
  })

  it('should render toasts with correct types', () => {
    render(
      <ToastContainer toasts={mockToasts} onRemoveToast={mockOnRemoveToast} />
    )
    
    // Check for success and error icons
    expect(screen.getByText('✅')).toBeInTheDocument()
    expect(screen.getByText('❌')).toBeInTheDocument()
  })

  it('should pass onRemoveToast to each toast', () => {
    render(
      <ToastContainer toasts={mockToasts} onRemoveToast={mockOnRemoveToast} />
    )
    
    const closeButtons = screen.getAllByLabelText(/close notification/i)
    expect(closeButtons).toHaveLength(2)
  })
})