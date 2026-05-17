import React from 'react';

interface FantasyButtonProps {
  onClick?: () => void;
  disabled?: boolean;
  large?: boolean;
  size?: 'small' | 'normal' | 'large';
  children: React.ReactNode;
  type?: 'button' | 'submit';
}

const FantasyButton: React.FC<FantasyButtonProps> = ({ 
  onClick, 
  disabled, 
  large, 
  size,
  children,
  type = 'button'
}) => {
  const getSizeClass = () => {
    if (size) return size;
    return large ? 'large' : 'normal';
  };

  return (
    <button
      type={type}
      className={`fantasy-button ${getSizeClass()}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
};

export default FantasyButton;
