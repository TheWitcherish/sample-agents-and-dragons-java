import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProjectLogo } from './ProjectLogo';
import { formatTime } from '../../utils/leaderboardScoring';
import type { LiveRun } from '../../types/leaderboard';
import styles from './LiveRunCard.module.css';

interface LiveRunCardProps {
  run: LiveRun;
}

export const LiveRunCard: React.FC<LiveRunCardProps> = ({ run }) => {
  const navigate = useNavigate();
  const [displayTime, setDisplayTime] = useState(0);
  const isRunning = run.status !== 'COMPLETED' && run.status !== 'ABORTED' && run.status !== 'ON_ERROR';
  
  useEffect(() => {
    const calculateElapsed = () => {
      const start = new Date(run.startTime).getTime();
      const now = Date.now();
      return Math.floor((now - start) / 1000);
    };
    
    if (!isRunning) {
      setDisplayTime(run.currentTime);
      return;
    }
    
    setDisplayTime(calculateElapsed());
    const interval = setInterval(() => {
      setDisplayTime(calculateElapsed());
    }, 1000);
    
    return () => clearInterval(interval);
  }, [run.startTime, run.currentTime, isRunning]);
  
  const getStatusBadge = () => {
    if (run.status === 'COMPLETED') return '✓';
    if (run.status === 'ABORTED' || run.status === 'ON_ERROR') return '✗';
    return '⏳';
  };
  
  const isCompleted = run.status === 'COMPLETED';
  
  return (
    <div 
      className={`${styles.card} ${styles[run.status.toLowerCase()]}`}
      onClick={() => navigate(`/project/${run.projectId}/run`)}
    >
      <div className={styles.header}>
        <ProjectLogo projectName={run.projectName} color={run.logoColor} size="small" />
        <div className={styles.info}>
          <div className={styles.name}>{run.projectName}</div>
          <div className={styles.agent}>{run.currentAgent}</div>
        </div>
        <div className={styles.statusBadge}>{getStatusBadge()}</div>
      </div>
      
      <div className={styles.stats}>
        {isCompleted && (
          <>
            <div className={styles.stat}>
              <span className={styles.statLabel}>⚡</span>
              <span className={styles.statValue}>{run.score}</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>#</span>
              <span className={styles.statValue}>{run.rank || '-'}</span>
            </div>
          </>
        )}
        <div className={styles.stat}>
          <span className={styles.statLabel}>⏱️</span>
          <span className={styles.statValue}>{formatTime(displayTime)}</span>
        </div>
      </div>
    </div>
  );
};
