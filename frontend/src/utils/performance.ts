/**
 * Performance monitoring utilities for the Agents and Dragons application
 */

// Performance metrics interface
interface PerformanceMetrics {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, unknown>;
}

class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetrics> = new Map();
  private observers: PerformanceObserver[] = [];

  constructor() {
    this.initializeObservers();
  }

  /**
   * Start measuring performance for a specific operation
   */
  startMeasure(name: string, metadata?: Record<string, unknown>): void {
    const startTime = performance.now();
    this.metrics.set(name, {
      name,
      startTime,
      metadata,
    });
  }

  /**
   * End measuring performance for a specific operation
   */
  endMeasure(name: string): number | null {
    const metric = this.metrics.get(name);
    if (!metric) {
      console.warn(`Performance measure '${name}' was not started`);
      return null;
    }

    const endTime = performance.now();
    const duration = endTime - metric.startTime;

    metric.endTime = endTime;
    metric.duration = duration;

    // Log performance in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`⚡ Performance: ${name} took ${duration.toFixed(2)}ms`, metric.metadata);
    }

    return duration;
  }

  /**
   * Measure a function execution time
   */
  async measureAsync<T>(name: string, fn: () => Promise<T>, metadata?: Record<string, unknown>): Promise<T> {
    this.startMeasure(name, metadata);
    try {
      const result = await fn();
      this.endMeasure(name);
      return result;
    } catch (error) {
      this.endMeasure(name);
      throw error;
    }
  }

  /**
   * Measure a synchronous function execution time
   */
  measureSync<T>(name: string, fn: () => T, metadata?: Record<string, unknown>): T {
    this.startMeasure(name, metadata);
    try {
      const result = fn();
      this.endMeasure(name);
      return result;
    } catch (error) {
      this.endMeasure(name);
      throw error;
    }
  }

  /**
   * Get all recorded metrics
   */
  getMetrics(): PerformanceMetrics[] {
    return Array.from(this.metrics.values());
  }

  /**
   * Clear all recorded metrics
   */
  clearMetrics(): void {
    this.metrics.clear();
  }

  /**
   * Initialize performance observers for Web Vitals
   */
  private initializeObservers(): void {
    if (typeof window === 'undefined') return;

    // Observe Largest Contentful Paint (LCP)
    if ('PerformanceObserver' in window) {
      try {
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          if (process.env.NODE_ENV === 'development') {
            console.log('🎯 LCP:', lastEntry.startTime.toFixed(2) + 'ms');
          }
        });
        lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
        this.observers.push(lcpObserver);
      } catch (e) {
        // LCP not supported
      }

      // Observe First Input Delay (FID)
      try {
        const fidObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry) => {
            if (process.env.NODE_ENV === 'development') {
              const fidEntry = entry as PerformanceEventTiming;
              console.log('⚡ FID:', fidEntry.processingStart - fidEntry.startTime + 'ms');
            }
          });
        });
        fidObserver.observe({ entryTypes: ['first-input'] });
        this.observers.push(fidObserver);
      } catch (e) {
        // FID not supported
      }

      // Observe Cumulative Layout Shift (CLS)
      try {
        const clsObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry) => {
            const layoutShift = entry as PerformanceEntry & { value?: number };
            if (process.env.NODE_ENV === 'development' && layoutShift.value && layoutShift.value > 0.1) {
              console.warn('📐 CLS detected:', layoutShift.value);
            }
          });
        });
        clsObserver.observe({ entryTypes: ['layout-shift'] });
        this.observers.push(clsObserver);
      } catch (e) {
        // CLS not supported
      }
    }
  }

  /**
   * Cleanup observers
   */
  cleanup(): void {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
  }
}

// Create singleton instance
export const performanceMonitor = new PerformanceMonitor();

/**
 * React hook for measuring component render performance
 */
export const usePerformanceMonitor = (componentName: string) => {
  const startMeasure = (operationName: string, metadata?: Record<string, unknown>) => {
    performanceMonitor.startMeasure(`${componentName}.${operationName}`, metadata);
  };

  const endMeasure = (operationName: string) => {
    return performanceMonitor.endMeasure(`${componentName}.${operationName}`);
  };

  const measureAsync = async <T>(
    operationName: string,
    fn: () => Promise<T>,
    metadata?: Record<string, unknown>
  ): Promise<T> => {
    return performanceMonitor.measureAsync(`${componentName}.${operationName}`, fn, metadata);
  };

  const measureSync = <T>(
    operationName: string,
    fn: () => T,
    metadata?: Record<string, unknown>
  ): T => {
    return performanceMonitor.measureSync(`${componentName}.${operationName}`, fn, metadata);
  };

  return {
    startMeasure,
    endMeasure,
    measureAsync,
    measureSync,
  };
};

/**
 * Debounce function for performance optimization
 */
export const debounce = <A extends unknown[], R>(
  func: (...args: A) => R,
  wait: number
): ((...args: A) => void) => {
  let timeout: NodeJS.Timeout;
  return (...args: A) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

/**
 * Throttle function for performance optimization
 */
export const throttle = <A extends unknown[], R>(
  func: (...args: A) => R,
  limit: number
): ((...args: A) => void) => {
  let inThrottle: boolean;
  return (...args: A) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};

/**
 * Measure and log bundle size information
 */
export const logBundleInfo = () => {
  if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
    // Log initial bundle load time
    window.addEventListener('load', () => {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (navigation) {
        console.log('📦 Bundle Load Performance:');
        console.log(`  - DOM Content Loaded: ${navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart}ms`);
        console.log(`  - Load Complete: ${navigation.loadEventEnd - navigation.loadEventStart}ms`);
        console.log(`  - Total Load Time: ${navigation.loadEventEnd - navigation.fetchStart}ms`);
      }
    });
  }
};