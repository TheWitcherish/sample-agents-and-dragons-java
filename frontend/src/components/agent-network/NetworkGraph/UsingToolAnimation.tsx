import React, { useState, useEffect } from 'react';
import { MdWifi1Bar, MdWifi2Bar, MdWifi } from 'react-icons/md';

const icons = [
  <MdWifi1Bar key="1bar" />,
  <MdWifi2Bar key="2bar" />,
  <MdWifi key="full" />
];

const UsingToolAnimation: React.FC = () => {
  const [currentIcon, setCurrentIcon] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIcon(prev => (prev + 1) % icons.length);
    }, 400);

    return () => clearInterval(interval);
  }, []);

  return icons[currentIcon];
};

export default UsingToolAnimation;