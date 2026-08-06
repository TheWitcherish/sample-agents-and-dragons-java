import React from 'react';
import styles from './ProjectLogo.module.css';

interface ProjectLogoProps {
  projectName: string;
  color: string;
  size?: 'small' | 'medium' | 'large';
}

export const ProjectLogo: React.FC<ProjectLogoProps> = ({ projectName, color, size = 'medium' }) => {
  const initial = projectName.charAt(0).toUpperCase();
  
  return (
    <div 
      className={`${styles.logo} ${styles[size]}`}
      style={{ background: color }}
      aria-label={`${projectName} logo`}
    >
      {initial}
    </div>
  );
};
