import { Settings, BarChart3, BookOpen, MessageCircle, Briefcase, PanelLeftClose, PanelLeft, HelpCircle } from 'lucide-react';

const NAV_ITEMS = [
  { id: 'tracker', label: 'Tracker', icon: BarChart3 },
  { id: 'stories', label: 'STAR Stories', icon: BookOpen },
  { id: 'qabank', label: 'Q&A Bank', icon: HelpCircle },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'chat', label: 'Chat', icon: MessageCircle },
];

export default function Sidebar({ activeView, onNavigate, collapsed, onToggleCollapse }) {
  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-brand">
        <Briefcase size={20} />
        {!collapsed && <span>Job Search Copilot</span>}
      </div>
      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`sidebar-nav-item ${activeView === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
            title={collapsed ? item.label : undefined}
          >
            <item.icon size={18} />
            {!collapsed && <span>{item.label}</span>}
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <button className="sidebar-collapse-btn" onClick={onToggleCollapse} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
        </button>
        {!collapsed && (
          <div className="sidebar-footer-text">
            Built by{' '}
            <a href="https://linkedin.com/in/elinahu" target="_blank" rel="noopener noreferrer">
              Elina Hu
            </a>
          </div>
        )}
      </div>
      <style>{`
        .sidebar {
          width: var(--sidebar-width);
          min-width: var(--sidebar-width);
          background: var(--bg-sidebar);
          display: flex;
          flex-direction: column;
          height: 100vh;
          padding: 0;
          transition: width var(--transition-normal), min-width var(--transition-normal);
        }
        .sidebar.collapsed {
          width: 56px;
          min-width: 56px;
        }
        .sidebar-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 24px 18px 32px;
          color: var(--text-sidebar-active);
          font-weight: 600;
          font-size: 0.95rem;
          letter-spacing: -0.01em;
          white-space: nowrap;
          overflow: hidden;
        }
        .sidebar-nav {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 0 8px;
        }
        .sidebar-nav-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: var(--radius-md);
          color: var(--text-sidebar);
          font-size: 0.9rem;
          font-weight: 500;
          transition: all var(--transition-fast);
          text-align: left;
          width: 100%;
          white-space: nowrap;
          overflow: hidden;
        }
        .collapsed .sidebar-nav-item {
          justify-content: center;
          padding: 10px;
        }
        .sidebar-nav-item:hover {
          background: var(--bg-sidebar-hover);
          color: var(--text-sidebar-active);
        }
        .sidebar-nav-item.active {
          background: var(--bg-sidebar-active);
          color: var(--text-sidebar-active);
        }
        .sidebar-bottom {
          padding: 12px 8px;
          border-top: 1px solid var(--bg-sidebar-hover);
          display: flex;
          flex-direction: column;
          gap: 8px;
          align-items: center;
        }
        .sidebar-collapse-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 8px;
          color: var(--text-sidebar);
          border-radius: var(--radius-md);
          cursor: pointer;
          background: none;
          border: none;
          transition: all var(--transition-fast);
          width: 100%;
        }
        .sidebar-collapse-btn:hover {
          background: var(--bg-sidebar-hover);
          color: var(--text-sidebar-active);
        }
        .sidebar-footer-text {
          font-size: 0.75rem;
          color: var(--text-sidebar);
          text-align: center;
        }
        .sidebar-footer-text a {
          color: var(--text-sidebar-active);
          text-decoration: underline;
          text-underline-offset: 2px;
        }
      `}</style>
    </aside>
  );
}
