import React from 'react';
import { RxGear } from 'react-icons/rx';

const WorkingAnimation: React.FC = () => {
  return (
    <>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div style={{
        animation: 'spin 2s linear infinite',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <RxGear />
      </div>
    </>
  );
};

export default WorkingAnimation;