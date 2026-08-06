import { vi } from 'vitest'
import {
  announceToScreenReader,
  trapFocus,
  createSkipLink,
  checkColorContrast,
  isNavigationKey,
  isActivationKey,
} from '../accessibility'

describe('accessibility utils', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('announceToScreenReader', () => {
    it('should create announcement element with correct attributes', () => {
      announceToScreenReader('Test message')
      
      const announcement = document.querySelector('[aria-live]')
      expect(announcement).toBeInTheDocument()
      expect(announcement).toHaveAttribute('aria-live', 'polite')
      expect(announcement).toHaveAttribute('aria-atomic', 'true')
      expect(announcement).toHaveClass('sr-only')
      expect(announcement).toHaveTextContent('Test message')
    })

    it('should use assertive priority when specified', () => {
      announceToScreenReader('Urgent message', 'assertive')
      
      const announcement = document.querySelector('[aria-live]')
      expect(announcement).toHaveAttribute('aria-live', 'assertive')
    })

    it('should remove announcement after timeout', () => {
      announceToScreenReader('Test message')
      
      expect(document.querySelector('[aria-live]')).toBeInTheDocument()
      
      vi.advanceTimersByTime(1000)
      
      expect(document.querySelector('[aria-live]')).not.toBeInTheDocument()
    })
  })

  describe('trapFocus', () => {
    it('should trap focus within element', () => {
      const container = document.createElement('div')
      container.innerHTML = `
        <button id="first">First</button>
        <button id="second">Second</button>
        <button id="last">Last</button>
      `
      document.body.appendChild(container)

      const cleanup = trapFocus(container)
      
      const firstButton = document.getElementById('first') as HTMLElement
      const lastButton = document.getElementById('last') as HTMLElement
      
      firstButton.focus()
      
      // Simulate Shift+Tab on first element
      const shiftTabEvent = new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
      })
      
      firstButton.dispatchEvent(shiftTabEvent)
      
      // Should focus last element
      expect(document.activeElement).toBe(lastButton)
      
      cleanup()
    })

    it('should return cleanup function', () => {
      const container = document.createElement('div')
      const cleanup = trapFocus(container)
      
      expect(typeof cleanup).toBe('function')
      cleanup()
    })
  })

  describe('createSkipLink', () => {
    it('should create skip link with correct attributes', () => {
      const skipLink = createSkipLink('main-content')
      
      expect(skipLink.tagName).toBe('A')
      expect(skipLink.href).toContain('#main-content')
      expect(skipLink.textContent).toBe('Skip to main content')
      expect(skipLink.className).toBe('skip-link')
    })

    it('should create skip link with custom text', () => {
      const skipLink = createSkipLink('content', 'Skip to content')
      
      expect(skipLink.textContent).toBe('Skip to content')
    })

    it('should show skip link on focus', () => {
      const skipLink = createSkipLink('main-content')
      
      skipLink.dispatchEvent(new FocusEvent('focus'))
      expect(skipLink.style.top).toBe('6px')
    })

    it('should hide skip link on blur', () => {
      const skipLink = createSkipLink('main-content')
      
      skipLink.dispatchEvent(new FocusEvent('blur'))
      expect(skipLink.style.top).toBe('-40px')
    })
  })

  describe('checkColorContrast', () => {
    it('should calculate contrast ratio for black and white', () => {
      const contrast = checkColorContrast('#000000', '#ffffff')
      expect(contrast).toBeCloseTo(21, 0) // Perfect contrast
    })

    it('should calculate contrast ratio for same colors', () => {
      const contrast = checkColorContrast('#ffffff', '#ffffff')
      expect(contrast).toBe(1) // No contrast
    })

    it('should handle hex colors without #', () => {
      const contrast = checkColorContrast('000000', 'ffffff')
      expect(contrast).toBeCloseTo(21, 0)
    })
  })

  describe('isNavigationKey', () => {
    it('should return true for arrow keys', () => {
      expect(isNavigationKey('ArrowUp')).toBe(true)
      expect(isNavigationKey('ArrowDown')).toBe(true)
      expect(isNavigationKey('ArrowLeft')).toBe(true)
      expect(isNavigationKey('ArrowRight')).toBe(true)
    })

    it('should return true for navigation keys', () => {
      expect(isNavigationKey('Home')).toBe(true)
      expect(isNavigationKey('End')).toBe(true)
      expect(isNavigationKey('PageUp')).toBe(true)
      expect(isNavigationKey('PageDown')).toBe(true)
    })

    it('should return false for non-navigation keys', () => {
      expect(isNavigationKey('Enter')).toBe(false)
      expect(isNavigationKey('Space')).toBe(false)
      expect(isNavigationKey('a')).toBe(false)
    })
  })

  describe('isActivationKey', () => {
    it('should return true for Enter and Space', () => {
      expect(isActivationKey('Enter')).toBe(true)
      expect(isActivationKey(' ')).toBe(true)
    })

    it('should return false for other keys', () => {
      expect(isActivationKey('ArrowUp')).toBe(false)
      expect(isActivationKey('Tab')).toBe(false)
      expect(isActivationKey('a')).toBe(false)
    })
  })
})