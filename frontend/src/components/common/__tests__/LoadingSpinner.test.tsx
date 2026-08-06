import { render, screen } from '../../../test/utils'
import LoadingSpinner from '../LoadingSpinner'

describe('LoadingSpinner', () => {
  it('should render loading spinner with text', () => {
    render(<LoadingSpinner />)
    
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('should have correct CSS classes', () => {
    const { container } = render(<LoadingSpinner />)
    
    const loadingContainer = container.querySelector('[class*="loadingContainer"]')
    const spinner = container.querySelector('[class*="spinner"]')
    
    expect(loadingContainer).toBeInTheDocument()
    expect(spinner).toBeInTheDocument()
  })
})