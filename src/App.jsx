import { useState, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import ChatDrawer from './components/ChatDrawer';
import TrackerView from './views/TrackerView';
import StoriesView from './views/StoriesView';
import SettingsView from './views/SettingsView';
import QABankView from './views/QABankView';
import ChatView from './views/ChatView';
import { MessageCircle } from 'lucide-react';

function App() {
  const [activeView, setActiveView] = useState('tracker');
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false);
  const [chatPreload, setChatPreload] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const handleOpenChat = useCallback((prompt) => {
    setChatPreload(prompt || '');
    setChatDrawerOpen(true);
  }, []);

  const handleClearPreload = useCallback(() => {
    setChatPreload('');
  }, []);

  const renderView = () => {
    switch (activeView) {
      case 'tracker':
        return <TrackerView onNavigate={setActiveView} onOpenChat={handleOpenChat} />;
      case 'stories':
        return <StoriesView />;
      case 'qabank':
        return <QABankView />;
      case 'settings':
        return <SettingsView />;
      case 'chat':
        return <ChatView preloadedPrompt={chatPreload} onClearPreload={handleClearPreload} />;
      default:
        return <TrackerView onNavigate={setActiveView} onOpenChat={handleOpenChat} />;
    }
  };

  return (
    <>
      <Sidebar activeView={activeView} onNavigate={setActiveView} collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <main style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {renderView()}
      </main>

      {activeView !== 'chat' && (
        <button
          className="chat-fab"
          onClick={() => setChatDrawerOpen(true)}
          title="Open chat"
        >
          <MessageCircle size={22} />
        </button>
      )}

      <ChatDrawer
        isOpen={chatDrawerOpen}
        onClose={() => setChatDrawerOpen(false)}
        preloadedPrompt={chatPreload}
        onClearPreload={handleClearPreload}
      />

      <style>{`
        .chat-fab {
          position: fixed;
          bottom: 24px;
          right: 24px;
          width: 52px;
          height: 52px;
          border-radius: 50%;
          background: var(--accent);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: var(--shadow-lg);
          z-index: 80;
          transition: all var(--transition-fast);
          border: none;
          cursor: pointer;
        }
        .chat-fab:hover {
          background: var(--accent-hover);
          transform: scale(1.08);
          box-shadow: var(--shadow-xl);
        }
      `}</style>
    </>
  );
}

export default App;
