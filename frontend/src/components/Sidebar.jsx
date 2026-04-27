import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../App';
import { updateAgent } from '../api';

const statusColors = { online: '#25D366', busy: '#F59E0B', away: '#EF4444' };
const statusLabels = { online: 'מחובר', busy: 'עסוק', away: 'לא זמין' };

// SVG icons — clean, minimal line style
const icons = {
  chat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-[22px] h-[22px]">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  campaigns: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-[22px] h-[22px]">
      <path d="M22 2L11 13"/>
      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  ),
  agents: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-[22px] h-[22px]">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-[22px] h-[22px]">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  ),
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-[22px] h-[22px]">
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  ),
  logout: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  ),
};

export default function Sidebar() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showStatus, setShowStatus] = useState(false);

  const isAdmin = user?.role === 'admin';
  const currentPath = location.pathname;

  const changeStatus = async (status) => {
    try {
      await updateAgent(user.id, { status });
      setUser({ ...user, status });
      setShowStatus(false);
    } catch (e) {}
  };

  const navItems = [
    { path: '/chat', icon: icons.chat, label: 'שיחות' },
    { path: '/campaigns', icon: icons.campaigns, label: 'קמפיינים' },
    ...(isAdmin ? [
      { path: '/dashboard', icon: icons.dashboard, label: 'דשבורד' },
      { path: '/settings', icon: icons.settings, label: 'הגדרות' },
    ] : []),
  ];

  return (
    <div className="w-[64px] bg-wa-dark flex flex-col items-center py-4 h-full" style={{ borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
      {/* Logo */}
      <div
        className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center mb-8 cursor-pointer hover:bg-white/25 transition"
        onClick={() => navigate('/chat')}
        title="יש לי זכות"
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12c0 1.82.49 3.53 1.34 5L2 22l5.16-1.34C8.58 21.51 10.26 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.61 0-3.11-.46-4.38-1.25l-.31-.19-3.22.84.86-3.14-.2-.32A7.963 7.963 0 014 12c0-4.41 3.59-8 8-8s8 3.59 8 8-3.59 8-8 8z"/>
          <path d="M16.25 13.97c-.23-.12-1.36-.67-1.57-.75-.21-.08-.37-.12-.52.12-.15.23-.6.75-.73.9-.14.16-.27.18-.5.06-.23-.12-.97-.36-1.85-1.14-.68-.61-1.14-1.36-1.28-1.59-.13-.23-.01-.36.1-.47.1-.1.23-.27.35-.4.12-.14.15-.23.23-.39.08-.15.04-.29-.02-.4-.06-.12-.52-1.26-.72-1.73-.19-.45-.38-.39-.52-.4h-.45c-.15 0-.4.06-.61.29-.21.23-.8.78-.8 1.9 0 1.13.82 2.22.93 2.37.12.15 1.61 2.46 3.9 3.45.55.24.97.38 1.3.49.55.17 1.05.15 1.44.09.44-.07 1.36-.56 1.55-1.1.19-.54.19-1 .13-1.1-.06-.1-.22-.15-.45-.27z"/>
        </svg>
      </div>

      {/* Nav items */}
      <div className="flex-1 flex flex-col items-center gap-1">
        {navItems.map(item => {
          const isActive = currentPath === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200
                ${isActive
                  ? 'bg-white/20 text-white shadow-sm'
                  : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              title={item.label}
            >
              {item.icon}
            </button>
          );
        })}
      </div>

      {/* User avatar + status */}
      <div className="relative mt-auto">
        <button
          onClick={() => setShowStatus(!showStatus)}
          className="w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center text-sm font-semibold relative hover:bg-white/25 transition"
          title={`${user?.name} - ${statusLabels[user?.status]}`}
        >
          {user?.name?.charAt(0)}
          <div
            className="absolute -bottom-0.5 -left-0.5 w-3 h-3 rounded-full border-2 border-wa-dark"
            style={{ backgroundColor: statusColors[user?.status] || '#8696A0' }}
          />
        </button>

        {showStatus && (
          <div className="absolute bottom-14 right-0 bg-white rounded-xl shadow-lg border border-gray-200 py-1.5 min-w-[160px] z-50">
            <div className="px-4 py-2.5 text-sm font-semibold border-b border-gray-100 text-gray-800">{user?.name}</div>
            {Object.entries(statusLabels).map(([key, label]) => (
              <button
                key={key}
                onClick={() => changeStatus(key)}
                className={`w-full px-4 py-2 text-sm flex items-center gap-3 hover:bg-gray-50 transition
                  ${user?.status === key ? 'text-wa-dark font-medium' : 'text-gray-600'}`}
              >
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: statusColors[key] }} />
                {label}
              </button>
            ))}
            <div className="border-t border-gray-100 mt-1 pt-1">
              <button
                onClick={logout}
                className="w-full px-4 py-2 text-sm text-red-500 hover:bg-red-50 text-right flex items-center gap-2 transition"
              >
                {icons.logout}
                <span>התנתק</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
