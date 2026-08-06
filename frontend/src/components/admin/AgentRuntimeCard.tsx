import React, { memo, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AgentRuntime } from '../../types';
import InvokeAgentModal from './InvokeAgentModal';
import styles from './AgentRuntimeCard.module.css';

interface AgentRuntimeCardProps {
  agentRuntime: AgentRuntime;
}

const getStatusClass = (status: string): string => {
  switch (status) {
    case 'READY':
      return 'ready';
    case 'CREATING':
    case 'UPDATING':
    case 'DELETING':
      return 'inProgress';
    case 'CREATE_FAILED':
    case 'UPDATE_FAILED':
      return 'failed';
    default:
      return 'unknown';
  }
};

const AgentRuntimeCard = memo(({ agentRuntime }: AgentRuntimeCardProps) => {
  const [showInvokeModal, setShowInvokeModal] = useState(false);
  const navigate = useNavigate();
  
  const truncatedDescription = useMemo(() => {
    const text = agentRuntime.description || "No description available";
    if (text.length <= 120) return text;
    return text.substring(0, 120) + "...";
  }, [agentRuntime.description]);

  const formatDate = useMemo(() => {
    return agentRuntime.lastUpdatedAt.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }, [agentRuntime.lastUpdatedAt]);

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking on the invoke button
    if ((e.target as HTMLElement).closest(`.${styles.invokeBtn}`)) {
      return;
    }
    navigate(`/agent-runtime/${agentRuntime.agentRuntimeId}`);
  };

  return (
    <>
    <div className={styles.agentRuntimeCard} onClick={handleCardClick}>
      <div className={styles.agentRuntimeCardHeader}>
        <h3 className={styles.agentRuntimeName}>{agentRuntime.agentRuntimeName}</h3>
        <p className={styles.agentRuntimeDescription}>{truncatedDescription}</p>
      </div>

      <div className={styles.agentRuntimeInfo}>
        <div className={styles.infoItem}>
          <span className={styles.infoLabel}>Runtime ID</span>
          <span className={styles.infoValue}>{agentRuntime.agentRuntimeId}</span>
        </div>
        <div className={styles.infoItem}>
          <span className={styles.infoLabel}>Last Updated</span>
          <span className={styles.infoValue}>{formatDate}</span>
        </div>
      </div>

      <div className={styles.agentRuntimeStatus}>
        <span className={styles.versionBadge}>v{agentRuntime.agentRuntimeVersion}</span>
        <span className={`${styles.statusBadge} ${styles[getStatusClass(agentRuntime.status)]}`}>
          {agentRuntime.status}
        </span>
      </div>

      {agentRuntime.status === 'READY' && (
        <button
          className={styles.invokeBtn}
          onClick={() => setShowInvokeModal(true)}
          title={`Invoke ${agentRuntime.agentRuntimeName}`}
          aria-label={`Invoke ${agentRuntime.agentRuntimeName}`}
        >
          Invoke
        </button>
      )}
    </div>
      
      {showInvokeModal && (
        <InvokeAgentModal
          agentRuntime={agentRuntime}
          onClose={() => setShowInvokeModal(false)}
        />
      )}
    </>
  );
});

AgentRuntimeCard.displayName = 'AgentRuntimeCard';

export default AgentRuntimeCard;