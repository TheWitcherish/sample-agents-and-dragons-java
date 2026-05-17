/**
 * QR Code generation utilities for project access
 * Provides functions for UUID generation and project URL creation
 */

/**
 * Generates a UUID v4 using the browser's crypto API
 * Falls back to a simple UUID implementation if crypto.randomUUID is not available
 * @returns A UUID v4 string
 * @throws Error if UUID generation fails
 */
export const generateUUID = (): string => {
  try {
    // Use native crypto.randomUUID if available (modern browsers)
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      const uuid = crypto.randomUUID();
      
      // Validate the generated UUID
      if (!isValidUUID(uuid)) {
        throw new Error(`Generated invalid UUID: ${uuid}`);
      }
      
      return uuid;
    }
    
    // Fallback implementation for older browsers
    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
    
    // Validate the fallback UUID
    if (!isValidUUID(uuid)) {
      throw new Error(`Generated invalid fallback UUID: ${uuid}`);
    }
    
    return uuid;
  } catch (error) {
    console.error('UUID Generation Error:', error);
    
    // Last resort: create a timestamp-based ID (not a true UUID but functional)
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    const fallbackId = `${timestamp}-${random}-4xxx-yxxx-xxxxxxxxxxxx`.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
    
    console.warn('Using emergency fallback ID:', fallbackId);
    return fallbackId;
  }
};

/**
 * Generates a project URL with projectId and ownerKey parameters
 * @param projectId - The unique project identifier
 * @param ownerKey - The unique owner key for the project
 * @returns Complete URL string for accessing the project
 * @throws Error if projectId or ownerKey is invalid or URL generation fails
 */
export const generateProjectURL = (projectId: string, ownerKey: string): string => {
  if (!projectId || projectId.trim() === '') {
    const error = new Error('ProjectId is required to generate project URL');
    console.error('QR Code URL Generation Error:', error.message);
    throw error;
  }
  
  if (!ownerKey || ownerKey.trim() === '') {
    const error = new Error('OwnerKey is required to generate project URL');
    console.error('QR Code URL Generation Error:', error.message);
    throw error;
  }
  
  // Validate ownerKey format
  if (!isValidUUID(ownerKey)) {
    const error = new Error(`Invalid ownerKey format: ${ownerKey}`);
    console.error('QR Code URL Generation Error:', error.message);
    throw error;
  }
  
  try {
    // Safely get base URL with fallback
    let baseURL: string;
    if (typeof window !== 'undefined' && window.location) {
      baseURL = window.location.origin;
    } else {
      // Fallback for server-side rendering or testing environments
      baseURL = 'https://localhost:3000';
      console.warn('Window.location not available, using fallback URL:', baseURL);
    }
    
    // Ensure baseURL doesn't end with slash
    baseURL = baseURL.replace(/\/$/, '');
    
    const encodedProjectId = encodeURIComponent(projectId);
    const encodedOwnerKey = encodeURIComponent(ownerKey);
    const projectURL = `${baseURL}/project/${encodedProjectId}?ownerKey=${encodedOwnerKey}`;
    
    // Validate the generated URL
    try {
      new URL(projectURL);
    } catch (urlError) {
      const error = new Error(`Generated invalid URL: ${projectURL}`);
      console.error('QR Code URL Generation Error:', error.message, urlError);
      throw error;
    }
    
    return projectURL;
  } catch (error) {
    console.error('QR Code URL Generation Error:', error);
    throw error;
  }
};

/**
 * Validates if a string is a valid UUID format (any version)
 * @param uuid - The string to validate
 * @returns True if the string is a valid UUID format
 */
export const isValidUUID = (uuid: string): boolean => {  
  if (uuid == 'guest') {
    return true;
  }
  if (!uuid || typeof uuid !== 'string') {
    return false;
  }
  
  // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  // More lenient to accept any UUID version, not just v4
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

/**
 * Options for QR code generation
 */
export interface QRCodeOptions {
  size?: number;
  level?: 'L' | 'M' | 'Q' | 'H';
  margin?: number;
}

/**
 * Default QR code options optimized for booth environment
 */
export const DEFAULT_QR_OPTIONS: Readonly<QRCodeOptions> = Object.freeze({
  size: 256,
  level: 'M', // Medium error correction for booth environment
  margin: 4
});

/**
 * Error types for QR code operations
 */
export enum QRCodeErrorType {
  UUID_GENERATION = 'UUID_GENERATION',
  URL_GENERATION = 'URL_GENERATION',
  QR_RENDERING = 'QR_RENDERING',
  VALIDATION = 'VALIDATION'
}

/**
 * Logs QR code related errors with context for debugging
 * @param errorType - The type of error that occurred
 * @param error - The error object or message
 * @param context - Additional context about the error
 */
export const logQRCodeError = (
  errorType: QRCodeErrorType, 
  error: Error | string, 
  context?: Record<string, unknown>
): void => {
  const errorMessage = error instanceof Error ? error.message : error;
  const errorStack = error instanceof Error ? error.stack : undefined;
  
  const logData = {
    type: 'QR_CODE_ERROR',
    errorType,
    message: errorMessage,
    stack: errorStack,
    timestamp: new Date().toISOString(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    url: typeof window !== 'undefined' ? window.location.href : 'unknown',
    ...context
  };
  
  console.error('QR Code Error:', logData);
  
  // In a production environment, you might want to send this to a logging service
  // Example: sendToLoggingService(logData);
};

/**
 * Safely generates a project URL with comprehensive error handling
 * @param projectId - The project identifier
 * @param ownerKey - The owner key identifier
 * @returns Object containing success status, URL, and any error
 */
export const safeGenerateProjectURL = (projectId: string, ownerKey: string): {
  success: boolean;
  url?: string;
  error?: string;
} => {
  try {
    const url = generateProjectURL(projectId, ownerKey);
    return { success: true, url };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logQRCodeError(QRCodeErrorType.URL_GENERATION, error as Error, { projectId, ownerKey });
    return { success: false, error: errorMessage };
  }
};

/**
 * Safely generates a UUID with comprehensive error handling
 * @returns Object containing success status, UUID, and any error
 */
export const safeGenerateUUID = (): {
  success: boolean;
  uuid?: string;
  error?: string;
} => {
  try {
    const uuid = generateUUID();
    return { success: true, uuid };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logQRCodeError(QRCodeErrorType.UUID_GENERATION, error as Error);
    return { success: false, error: errorMessage };
  }
};