import React from 'react';
import FantasyButton from '../components/common/FantasyButton';

interface WelcomePageProps {
  onStart: () => void;
}

const WelcomePage: React.FC<WelcomePageProps> = ({ onStart }) => {
  return (
    <div className="fantasy-main-content quest-page">
      <h1 className="fantasy-page-title">⚔️ Agents and Dragons 🐉</h1>
      
      <FantasyButton large onClick={onStart}>
        🗡️ Begin Your Adventure 🗡️
      </FantasyButton>
    </div>
  );
};

export default WelcomePage;
