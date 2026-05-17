import React, { useState, useEffect } from 'react';
import { PiBrainThin, PiBrainLight, PiBrain, PiBrainBold } from 'react-icons/pi';

const icons = [
  <PiBrainThin />,
  <PiBrainLight />,
  <PiBrain />,
  <PiBrainBold />
];

const ThinkingAnimation: React.FC = () => {
  const [currentIcon, setCurrentIcon] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIcon(prev => (prev + 1) % icons.length);
    }, 200);

    return () => clearInterval(interval);
  }, []);

  return icons[currentIcon];
};

export default ThinkingAnimation;