import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  generateUUID, 
  generateProjectURL, 
  safeGenerateUUID, 
  safeGenerateProjectURL, 
  logQRCodeError, 
  QRCodeErrorType,
  isValidUUID 
} from '../qrCode';

// Mock console.error for testing
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

describe('QR Code Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateUUID', () => {
    it('should generate a valid UUID', () => {
      const uuid = generateUUID();
      expect(uuid).toBeDefined();
      expect(typeof uuid).toBe('string');
      expect(isValidUUID(uuid)).toBe(true);
    });
  });

  describe('generateProjectURL', () => {
    it('should generate a valid project URL', () => {
      const projectId = 'test-project-123';
      const ownerKey = generateUUID(); // Use a real UUID
      const url = generateProjectURL(projectId, ownerKey);
      
      expect(url).toContain(`/project/${projectId}?ownerKey=`);
      expect(url).toContain(ownerKey);
      expect(() => new URL(url)).not.toThrow();
    });

    it('should throw error for empty projectId', () => {
      const ownerKey = generateUUID();
      expect(() => generateProjectURL('', ownerKey)).toThrow('ProjectId is required');
    });

    it('should throw error for empty ownerKey', () => {
      const projectId = 'test-project-123';
      expect(() => generateProjectURL(projectId, '')).toThrow('OwnerKey is required');
    });

    it('should throw error for invalid ownerKey format', () => {
      const projectId = 'test-project-123';
      expect(() => generateProjectURL(projectId, 'invalid-uuid')).toThrow('Invalid ownerKey format');
    });
  });

  describe('safeGenerateUUID', () => {
    it('should return success result with valid UUID', () => {
      const result = safeGenerateUUID();
      
      expect(result.success).toBe(true);
      expect(result.uuid).toBeDefined();
      expect(result.error).toBeUndefined();
      expect(isValidUUID(result.uuid!)).toBe(true);
    });
  });

  describe('safeGenerateProjectURL', () => {
    it('should return success result with valid URL', () => {
      const projectId = 'test-project-123';
      const uuid = generateUUID();
      const result = safeGenerateProjectURL(projectId, uuid);
      
      expect(result.success).toBe(true);
      expect(result.url).toBeDefined();
      expect(result.error).toBeUndefined();
      expect(result.url).toContain(projectId);
      expect(result.url).toContain(uuid);
    });

    it('should return error result for invalid ownerKey', () => {
      const projectId = 'test-project-123';
      const result = safeGenerateProjectURL(projectId, 'invalid-uuid');
      
      expect(result.success).toBe(false);
      expect(result.url).toBeUndefined();
      expect(result.error).toBeDefined();
    });

    it('should return error result for empty projectId', () => {
      const uuid = generateUUID();
      const result = safeGenerateProjectURL('', uuid);
      
      expect(result.success).toBe(false);
      expect(result.url).toBeUndefined();
      expect(result.error).toBeDefined();
    });
  });

  describe('logQRCodeError', () => {
    it('should log error with proper format', () => {
      const error = new Error('Test error');
      const context = { ownerKey: 'test-123' };
      
      logQRCodeError(QRCodeErrorType.QR_RENDERING, error, context);
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'QR Code Error:',
        expect.objectContaining({
          type: 'QR_CODE_ERROR',
          errorType: QRCodeErrorType.QR_RENDERING,
          message: 'Test error',
          ownerKey: 'test-123'
        })
      );
    });

    it('should handle string errors', () => {
      const errorMessage = 'String error message';
      
      logQRCodeError(QRCodeErrorType.VALIDATION, errorMessage);
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'QR Code Error:',
        expect.objectContaining({
          type: 'QR_CODE_ERROR',
          errorType: QRCodeErrorType.VALIDATION,
          message: errorMessage
        })
      );
    });
  });

  describe('isValidUUID', () => {
    it('should validate correct UUID format', () => {
      const validUUIDs = [
        '123e4567-e89b-12d3-a456-426614174000',
        'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        generateUUID() // Test with generated UUID
      ];

      validUUIDs.forEach(uuid => {
        expect(isValidUUID(uuid)).toBe(true);
      });
    });

    it('should reject invalid UUID formats', () => {
      const invalidUUIDs = [
        '',
        'not-a-uuid',
        '123e4567-e89b-12d3-a456',
        '123e4567-e89b-12d3-a456-426614174000-extra',
        null,
        undefined
      ];

      invalidUUIDs.forEach(uuid => {
        expect(isValidUUID(uuid as unknown as string)).toBe(false);
      });
    });
  });
});