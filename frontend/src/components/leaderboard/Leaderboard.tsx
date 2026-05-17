import React, { useState, useEffect, useMemo } from 'react';
import { LeaderboardEntry } from './LeaderboardEntry';
import { LiveRunCard } from './LiveRunCard';
import { ProjectNetworkGraph } from '../agent-network/ProjectNetworkGraph';
import { useLeaderboard } from '../../hooks/useLeaderboard';
import { LEADERBOARD_CONFIG } from '../../config/leaderboard';
import styles from './Leaderboard.module.css';

type TabType = 'rankings' | 'network';

export const Leaderboard: React.FC = () => {
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  
  const getStoredDate = (key: string, defaultValue: string) => {
    const stored = localStorage.getItem(key);
    const timestamp = localStorage.getItem(`${key}_timestamp`);
    if (stored && timestamp) {
      const age = Date.now() - parseInt(timestamp);
      if (age < 8 * 60 * 60 * 1000) return stored; // 8 hours
    }
    return defaultValue;
  };

  const [fromDate, setFromDate] = useState<string>(() => getStoredDate('leaderboard_fromDate', today));
  const [toDate, setToDate] = useState<string>(() => getStoredDate('leaderboard_toDate', tomorrow));
  const [activeTab, setActiveTab] = useState<TabType>('rankings');
  const [autoSwitch, setAutoSwitch] = useState(false);

  useEffect(() => {
    localStorage.setItem('leaderboard_fromDate', fromDate);
    localStorage.setItem('leaderboard_fromDate_timestamp', Date.now().toString());
  }, [fromDate]);

  useEffect(() => {
    localStorage.setItem('leaderboard_toDate', toDate);
    localStorage.setItem('leaderboard_toDate_timestamp', Date.now().toString());
  }, [toDate]);

  const fromDateObj = useMemo(() => fromDate ? new Date(fromDate) : null, [fromDate]);
  const toDateObj = useMemo(() => toDate ? new Date(toDate) : null, [toDate]);

  const { topProjects: top, liveRuns: live, loading } = useLeaderboard(fromDateObj, toDateObj);

  useEffect(() => {
    if (!autoSwitch) return;
    const interval = setInterval(() => {
      setActiveTab(prev => prev === 'rankings' ? 'network' : 'rankings');
    }, LEADERBOARD_CONFIG.autoSwitchInterval);
    return () => clearInterval(interval);
  }, [autoSwitch]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>🐉 AGENTS AND DRAGONS LEADERBOARD 🐉</h1>
        
        <div className={styles.dateFilter}>
          <div className={styles.dateInput}>
            <label htmlFor="fromDate">From:</label>
            <input
              id="fromDate"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className={styles.input}
            />
          </div>
          <div className={styles.dateInput}>
            <label htmlFor="toDate">To:</label>
            <input
              id="toDate"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className={styles.input}
            />
          </div>
        </div>
      </div>

      <div className={styles.tabControls}>
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === 'rankings' ? styles.active : ''}`}
            onClick={() => setActiveTab('rankings')}
          >
            📊 Rankings
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'network' ? styles.active : ''}`}
            onClick={() => setActiveTab('network')}
          >
            🕸️ Agent Network
          </button>
        </div>
        <label className={styles.autoSwitch}>
          <input
            type="checkbox"
            checked={autoSwitch}
            onChange={(e) => setAutoSwitch(e.target.checked)}
          />
          Auto-switch ({LEADERBOARD_CONFIG.autoSwitchInterval / 1000}s)
        </label>
      </div>

      {activeTab === 'rankings' ? (
        <div className={`${styles.content} ${live.length === 0 ? styles.noLiveRuns : ''}`}>
          {live.length > 0 && (
            <aside className={styles.liveSection}>
              <h2 className={styles.sectionTitle}>🕒 LATEST RUNS</h2>
              <div className={styles.liveCards}>
                {live.map((run) => (
                  <LiveRunCard key={run.projectId} run={run} />
                ))}
              </div>
            </aside>
          )}

          <main className={styles.rankingsSection}>
            <h2 className={styles.sectionTitle}>🥇 TOP RANKINGS</h2>
            <div className={styles.entries} role="table" aria-label="Project Leaderboard">
              {loading ? (
                <div className={styles.empty}>Loading...</div>
              ) : top.length > 0 ? (
                top.map((entry, index) => (
                  <LeaderboardEntry key={entry.projectId} entry={entry} index={index} />
                ))
              ) : (
                <div className={styles.empty}>No completed projects in this date range</div>
              )}
            </div>
          </main>
        </div>
      ) : (
        <div className={styles.networkView}>
          {live.length > 0 ? (
            live.map((run) => (
              <div key={run.projectId} className={styles.networkCard}>
                <div className={styles.networkHeader}>
                  <h3>{run.projectName}</h3>
                  <div className={styles.networkStats}>
                    <span>Score: {run.score}</span>
                    <span>Rank: #{run.rank || '-'}</span>
                  </div>
                </div>
                <ProjectNetworkGraph 
                  projectId={run.projectId}
                  containerStyle={{ 
                    height: '400px', 
                    border: '2px solid #2a9d8f', 
                    borderRadius: '10px', 
                    background: 'rgba(26, 26, 46, 0.5)' 
                  }}
                />
              </div>
            ))
          ) : (
            <div className={styles.empty}>No projects to display</div>
          )}
        </div>
      )}
    </div>
  );
};
