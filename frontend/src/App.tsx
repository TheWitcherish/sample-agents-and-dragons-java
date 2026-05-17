import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Amplify } from 'aws-amplify';
import outputs from '../amplify_outputs.json';
import { Authenticator, useAuthenticator } from '@aws-amplify/ui-react';
import { ToastProvider } from './contexts/ToastContext';
import ErrorBoundary from './components/common/ErrorBoundary';
import FantasyDrawer from './components/common/FantasyDrawer';
import LoadingSpinner from './components/common/LoadingSpinner';
import WelcomePage from './pages/WelcomePage';
import { logBundleInfo, performanceMonitor } from './utils/performance';
import '@aws-amplify/ui-react/styles.css';
import './fantasy-theme.css';
import './App.css';

// Lazy-loaded route components — only downloaded when the route is visited
const QuestSelectionPage = lazy(() => import('./pages/QuestSelectionPage'));
const TeamAssemblyPage = lazy(() => import('./pages/TeamAssemblyPage'));
const DirectionsPage = lazy(() => import('./pages/DirectionsPage'));
const QRCodeDisplayPage = lazy(() => import('./pages/QRCodeDisplayPage'));
const ProjectRunPage = lazy(() => import('./pages/ProjectRunPage'));
const QuestListPage = lazy(() => import('./pages/QuestListPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const LeaderboardPage = lazy(() => import('./pages/LeaderboardPage').then(m => ({ default: m.LeaderboardPage })));
const MobileProjectRun = lazy(() => import('./pages/MobileProjectRun'));

Amplify.configure(outputs);

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut } = useAuthenticator();
  const isMobilePage = location.pathname.includes('/mobile');

  useEffect(() => {
    logBundleInfo();
    return () => performanceMonitor.cleanup();
  }, []);

  return (
    <div className="fantasy-app">
      {!isMobilePage && (
        <FantasyDrawer 
          onNewQuestClick={() => navigate('/')}
          onQuestListClick={() => navigate('/quests')}
          onAdminClick={() => navigate('/admin')}
          onSignOutClick={signOut}
          onLeaderboardClick={() => navigate('/leaderboard')}
        />
      )}
      
      <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route path="/" element={<div className={isMobilePage ? 'no-drawer' : ''}><WelcomePage onStart={() => navigate('/quest-selection')} /></div>} />
        <Route path="/quest-selection" element={<Authenticator hideSignUp><QuestSelectionPage /></Authenticator>} />
        <Route path="/team-assembly/:questId" element={<Authenticator hideSignUp><TeamAssemblyPage /></Authenticator>} />
        <Route path="/directions" element={<Authenticator hideSignUp><DirectionsPage /></Authenticator>} />
        <Route path="/qrcode/:projectId" element={<Authenticator hideSignUp><QRCodeDisplayPage /></Authenticator>} />
        <Route path="/project/:projectId/run" element={<Authenticator hideSignUp><ProjectRunPage /></Authenticator>} />
        <Route path="/project/:projectId/mobile" element={<div style={{ marginLeft: 0 }}><MobileProjectRun /></div>} />
        <Route path="/quests" element={<Authenticator hideSignUp><QuestListPage /></Authenticator>} />
        <Route path="/admin" element={<Authenticator hideSignUp><AdminPage /></Authenticator>} />
        <Route path="/leaderboard" element={<Authenticator hideSignUp><LeaderboardPage /></Authenticator>} />
      </Routes>
      </Suspense>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <Authenticator.Provider>
          
            <ErrorBoundary>
              <Router>
                <AppContent />
              </Router>
            </ErrorBoundary>
          
        </Authenticator.Provider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
