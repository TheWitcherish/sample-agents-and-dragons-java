import React, { useState } from 'react';

interface FantasyDrawerProps {
  onNewQuestClick: () => void;
  onQuestListClick: () => void;
  onAdminClick: () => void;
  onSignOutClick: () => void;
  onLeaderboardClick: () => void;
}

const FantasyDrawer: React.FC<FantasyDrawerProps> = ({ onNewQuestClick, onQuestListClick, onAdminClick, onSignOutClick, onLeaderboardClick }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button 
        className="fantasy-drawer-toggle"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle menu"
      >
        ☰
      </button>
      
      <div className={`fantasy-drawer ${isOpen ? 'open' : ''}`}>
        <div 
          className="fantasy-drawer-icon" 
          title="New Quest"
          onClick={() => {
            onNewQuestClick();
            setIsOpen(false);
          }}
        >
          ⚔️
        </div>
        <div 
          className="fantasy-drawer-icon" 
          title="Active Quests"
          onClick={() => {
            onQuestListClick();
            setIsOpen(false);
          }}
        >
          📜
        </div>
        <div 
          className="fantasy-drawer-icon" 
          title="Leaderboard"
          onClick={() => {
            onLeaderboardClick();
            setIsOpen(false);
          }}
        >
          🏆
        </div>
        <div 
          className="fantasy-drawer-icon" 
          title="Admin"
          onClick={() => {
            onAdminClick();
            setIsOpen(false);
          }}
        >
          ⚙️
        </div>
        <div 
          className="fantasy-drawer-icon" 
          title="Sign Out"
          onClick={() => {
            onSignOutClick();
            setIsOpen(false);
          }}
        >
          🔓
        </div>
      </div>
      
      {isOpen && (
        <div 
          className="fantasy-drawer-overlay"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
};

export default FantasyDrawer;
