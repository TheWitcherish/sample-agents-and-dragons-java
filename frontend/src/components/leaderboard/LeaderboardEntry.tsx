import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ProjectLogo } from './ProjectLogo';
import { formatTime } from '../../utils/leaderboardScoring';
import type { LeaderboardEntry as LeaderboardEntryType } from '../../types/leaderboard';
import styles from './LeaderboardEntry.module.css';

interface LeaderboardEntryProps {
  entry: LeaderboardEntryType;
  index: number;
}

export const LeaderboardEntry: React.FC<LeaderboardEntryProps> = ({ entry, index }) => {
  const navigate = useNavigate();
  
  const getMedalEmoji = (rank: number) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return null;
  };

  const medal = getMedalEmoji(entry.rank);

  return (
    <div 
      className={styles.entry}
      style={{ '--index': index } as React.CSSProperties}
      role="row"
      aria-label={`Rank ${entry.rank}: ${entry.projectName}, Score ${entry.score}`}
      onClick={() => navigate(`/project/${entry.projectId}/run`)}
    >
      <div className={styles.rank} role="cell">
        {medal || `#${entry.rank}`}
      </div>
      
      <ProjectLogo projectName={entry.projectName} color={entry.logoColor} size="medium" />
      
      <div className={styles.details} role="cell">
        <div className={styles.name}>{entry.projectName}</div>
        <div className={styles.meta}>
          <span className={styles.pattern}>{entry.teamPattern}</span>
          <span className={styles.agents}>{entry.agentCount} agent{entry.agentCount !== 1 ? 's' : ''}</span>
        </div>
      </div>
      
      <div className={styles.stats} role="cell">
        <div className={styles.score}>
          <span className={styles.scoreLabel}>⚡</span>
          <span className={styles.scoreValue}>{entry.score}</span>
        </div>
        <div className={styles.time}>
          <span className={styles.timeLabel}>⏱️</span>
          <span className={styles.timeValue}>{formatTime(entry.executionTime)}</span>
        </div>
      </div>
      
      <div className={styles.scoreBreakdown}>
        <div className={styles.scoreBlock} style={{ background: entry.questCompleted ? '#4299e1' : '#e53e3e' }}>
          <div className={styles.blockValue}>{entry.scoreBreakdown.tokenEfficiency}</div>
          <div className={styles.blockLabel}>Efficiency</div>
        </div>
        <div className={styles.scoreBlock} style={{ background: '#48bb78' }}>
          <div className={styles.blockValue}>{entry.scoreBreakdown.executionSpeed}</div>
          <div className={styles.blockLabel}>Time</div>
        </div>
        <div className={styles.scoreBlock} style={{ background: '#ed8936' }}>
          <div className={styles.blockValue}>{entry.scoreBreakdown.teamOptimization}</div>
          <div className={styles.blockLabel}>Team</div>
        </div>
        <div className={styles.scoreBlock} style={{ background: entry.questCompleted ? '#9f7aea' : '#cbd5e0' }}>
          <div className={styles.blockValue}>{entry.scoreBreakdown.completionBonus}</div>
          <div className={styles.blockLabel}>Quest {entry.questCompleted ? '✓' : '✗'}</div>
        </div>
      </div>
    </div>
  );
};
