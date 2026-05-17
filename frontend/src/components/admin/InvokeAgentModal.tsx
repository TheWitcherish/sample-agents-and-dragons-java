import React, { useState, useEffect, useRef } from 'react';
import { BedrockAgentCoreClient, InvokeAgentRuntimeCommand } from '@aws-sdk/client-bedrock-agentcore';
import { fetchAuthSession } from 'aws-amplify/auth';
import type { AgentRuntime } from '../../types';
import styles from './InvokeAgentModal.module.css';
import outputs from "../../../amplify_outputs.json";

interface InvokeAgentModalProps {
  agentRuntime: AgentRuntime;
  onClose: () => void;
}

const InvokeAgentModal = ({ agentRuntime, onClose }: InvokeAgentModalProps) => {
  const [formData, setFormData] = useState({
    prompt: '',
    sessionId: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isInvoking, setIsInvoking] = useState(false);
  const [response, setResponse] = useState<string>('');
  const [showResponse, setShowResponse] = useState(false);
  const promptInputRef = useRef<HTMLTextAreaElement>(null);
  
  useEffect(() => {
    promptInputRef.current?.focus();
    
    // Generate a default session ID (minimum 33 characters)
    const timestamp = Date.now().toString();
    const randomPart = Math.random().toString(36).substr(2, 15);
    const sessionId = `session-${timestamp}-${randomPart}-${Math.random().toString(36).substr(2, 10)}`;
    setFormData(prev => ({
      ...prev,
      sessionId
    }));

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showResponse) {
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, showResponse]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.prompt.trim()) {
      newErrors.prompt = "Prompt is required";
    } else if (formData.prompt.length < 5) {
      newErrors.prompt = "Prompt must be at least 5 characters";
    }

    if (!formData.sessionId.trim()) {
      newErrors.sessionId = "Session ID is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInvoke = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsInvoking(true);
    setResponse('');
    
    try {
      const session = await fetchAuthSession();
      const credentials = session.credentials;

      if (!credentials) {
        throw new Error('No AWS credentials available');
      }

      const client = new BedrockAgentCoreClient({
        region: 'us-east-1',
        credentials: {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
          sessionToken: credentials.sessionToken,
        },
      });

      const payload = formData.prompt;

      const command = new InvokeAgentRuntimeCommand({
        agentRuntimeArn: agentRuntime.agentRuntimeArn,
        runtimeSessionId: formData.sessionId,
        payload: new TextEncoder().encode(payload),        
      });

      const result = await client.send(command);
      
      // Handle the response
      if (result.response) {
        try {
          const chunks: Uint8Array[] = [];
          const stream = result.response as AsyncIterable<{ chunk?: { bytes?: Uint8Array } }>;
          
          if (stream[Symbol.asyncIterator]) {
            for await (const chunk of stream) {
              if (chunk.chunk?.bytes) {
                chunks.push(chunk.chunk.bytes);
              }
            }
          }
          
          if (chunks.length > 0) {
            const decoder = new TextDecoder();
            const responseText = chunks.map(chunk => decoder.decode(chunk)).join('');
            setResponse(responseText || 'Agent invoked successfully (empty response)');
          } else {
            setResponse('Agent invoked successfully. No content in response.');
          }
        } catch (error) {
          console.error('Error processing response:', error);
          setResponse(`Agent invoked successfully. Response processing error: ${error}`);
        }
      } else {
        setResponse('Agent invoked successfully (no response object)');
      }
      
      setShowResponse(true);
    } catch (error) {
      console.error('Failed to invoke agent:', error);
      setErrors(prev => ({ 
        ...prev, 
        submit: error instanceof Error ? error.message : 'Failed to invoke agent' 
      }));
    } finally {
      setIsInvoking(false);
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));

    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: "" }));
    }
  };

  const handleOverlayClick = () => {
    if (!showResponse) {
      onClose();
    }
  };

  const handleCopyAccessToken = async () => {
    try {
      const session = await fetchAuthSession();
      const accessToken = session.tokens?.accessToken?.toString();
      
      if (accessToken) {
        await navigator.clipboard.writeText(accessToken);
        console.log('Access token copied to clipboard');
      } else {
        console.error('No access token available');
      }
    } catch (error) {
      console.error('Failed to copy access token:', error);
    }
  };

  const handleCopyGatewayUrl = async () => {
    try {
        await navigator.clipboard.writeText(outputs.custom.gatewayUrl);
    } catch (error) {
      console.error('Failed to copy MCP Gateway URL:', error);
    }
  };


  return (
    <div 
      className={styles.modalOverlay} 
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 id="modal-title">
            {showResponse ? "Agent Response" : `Invoke ${agentRuntime.agentRuntimeName}`}
          </h2>
          {!showResponse && (
            <button 
              className={styles.closeBtn} 
              onClick={onClose}
              aria-label="Close dialog"
            >
              ×
            </button>
          )}
          
        </div>

        {!showResponse ? (
          <>
          <div className="admin-actions">
            <button className="copy-token-btn" onClick={handleCopyAccessToken}>
              Copy current user Access Token
            </button>
            {outputs.custom.gatewayUrl && 
              <button className="copy-gateway-url-btn" onClick={handleCopyGatewayUrl}>
                Copy MCP Gateway URL
              </button>
             }
          </div>
             
          <form onSubmit={handleInvoke} className={styles.invokeForm}>
            <div className={styles.formGroup}>
              <label htmlFor="prompt">Payload *</label>
              <textarea
                ref={promptInputRef}
                id="prompt"
                name="prompt"
                value={formData.prompt}
                onChange={handleInputChange}
                className={errors.prompt ? styles.error : ""}
                placeholder="Enter your payload for the agent..."
                rows={6}
                aria-describedby={errors.prompt ? "prompt-error" : undefined}
                aria-invalid={!!errors.prompt}
              />
              {errors.prompt && <span id="prompt-error" className={styles.errorMessage} role="alert">{errors.prompt}</span>}
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="sessionId">Session ID *</label>
              <input
                type="text"
                id="sessionId"
                name="sessionId"
                value={formData.sessionId}
                onChange={handleInputChange}
                className={errors.sessionId ? styles.error : ""}
                placeholder="Session identifier"
                aria-describedby={errors.sessionId ? "sessionId-error" : undefined}
                aria-invalid={!!errors.sessionId}
              />
              {errors.sessionId && <span id="sessionId-error" className={styles.errorMessage} role="alert">{errors.sessionId}</span>}
            </div>

            {errors.submit && (
              <div className={styles.errorMessage} role="alert" style={{ marginBottom: '1rem' }}>
                {errors.submit}
              </div>
            )}

            <div className={styles.formActions}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={onClose}
                disabled={isInvoking}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={styles.invokeBtn}
                disabled={isInvoking}
              >
                {isInvoking ? "Invoking..." : "Invoke"}
              </button>
            </div>
          </form></>
        ) : (
          <div className={styles.responseDisplay}>
            <div className={styles.responseHeader}>
              <h3>Response from {agentRuntime.agentRuntimeName}</h3>
            </div>
            
            <div className={styles.responseContent}>
              <pre>{response}</pre>
            </div>

            <div className={styles.responseActions}>
              <button
                type="button"
                className={styles.invokeBtn}
                onClick={onClose}
                autoFocus
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InvokeAgentModal;