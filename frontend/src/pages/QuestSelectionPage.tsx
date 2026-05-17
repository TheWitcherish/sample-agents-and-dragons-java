import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuests } from '../hooks/useAmplifyData';
import LoadingSpinner from '../components/common/LoadingSpinner';

const QuestSelectionPage: React.FC = () => {
  const navigate = useNavigate();
  const { quests, loading } = useQuests();
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [touchStart, setTouchStart] = React.useState<number | null>(null);
  const [touchEnd, setTouchEnd] = React.useState<number | null>(null);

  if (loading) {
    return <LoadingSpinner />;
  }

  const sortedQuests = [...quests].sort((a, b) => a.name.localeCompare(b.name));
  const currentQuest = sortedQuests[currentIndex];
  const goToPrevious = () => setCurrentIndex((prev) => (prev > 0 ? prev - 1 : sortedQuests.length - 1));
  const goToNext = () => setCurrentIndex((prev) => (prev < sortedQuests.length - 1 ? prev + 1 : 0));

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;
    
    if (isLeftSwipe && currentIndex < sortedQuests.length - 1) goToNext();
    if (isRightSwipe && currentIndex > 0) goToPrevious();
  };

  return (
    <div className="fantasy-main-content">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', maxWidth: '1200px', marginBottom: '20px' }}>
        <h1 className="fantasy-page-title" style={{ margin: 0 }}>📜 Choose Your Quest 📜</h1>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '30px', maxWidth: '1200px', width: '100%' }}>
        <button
          onClick={goToPrevious}
          disabled={currentIndex === 0}
          style={{
            background: 'transparent',
            border: 'none',
            fontSize: '4rem',
            color: currentIndex === 0 ? '#666' : '#f4a261',
            cursor: currentIndex === 0 ? 'not-allowed' : 'pointer',
            padding: '0',
            lineHeight: '1',
            transition: 'transform 0.2s',
            outline: 'none',
          }}
          onMouseEnter={(e) => currentIndex > 0 && (e.currentTarget.style.transform = 'scale(1.2)')}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          ◀
        </button>

        {currentQuest && (
          <div
            className="fantasy-card"
            style={{ flex: 1, cursor: 'pointer' }}
            onClick={() => {
              sessionStorage.setItem('selectedQuest', JSON.stringify(currentQuest));
              navigate(`/team-assembly/${currentQuest.id}`);
            }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <h2 style={{ color: '#f4a261', marginBottom: '15px', fontSize: '1.8rem' }}>
              {currentQuest.name}
            </h2>
            <p style={{ fontSize: '1.1rem', lineHeight: '1.6' }}>
              {currentQuest.prompt}
            </p>
          </div>
        )}

        <button
          onClick={goToNext}
          disabled={currentIndex === sortedQuests.length - 1}
          style={{
            background: 'transparent',
            border: 'none',
            fontSize: '4rem',
            color: currentIndex === sortedQuests.length - 1 ? '#666' : '#f4a261',
            cursor: currentIndex === sortedQuests.length - 1 ? 'not-allowed' : 'pointer',
            padding: '0',
            lineHeight: '1',
            transition: 'transform 0.2s',
            outline: 'none',
          }}
          onMouseEnter={(e) => currentIndex < sortedQuests.length - 1 && (e.currentTarget.style.transform = 'scale(1.2)')}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          ▶
        </button>
      </div>
    </div>
  );
};

export default QuestSelectionPage;
