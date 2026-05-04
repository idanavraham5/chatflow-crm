import React, { useState, useEffect } from 'react';
import { getConversations, getConversationCounts, getContacts, createConversation, getLabels, getAgents } from '../api';
import { useAuth } from '../context/AuthContext';

const statusColors = {
  open: '#25D366', in_progress: '#F59E0B', waiting: '#3B82F6', closed: '#6B7280'
};
const statusLabels = {
  open: 'פתוח', in_progress: 'בטיפול', waiting: 'ממתין', closed: 'סגור'
};
const priorityIcons = {
  urgent: { icon: '🔴', label: 'דחוף' },
  high: { icon: '🟠', label: 'גבוה' },
  normal: { icon: '', label: 'רגיל' },
  low: { icon: '⚪', label: 'נמוך' }
};

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  if (diff < 86400000 && d.getDate() === now.getDate()) {
    return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  }
  if (diff < 172800000) return 'אתמול';
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
}

export default function ConversationList({ selectedId, onSelect, refreshTrigger, isMobile = false }) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [counts, setCounts] = useState({ mine: 0, unassigned: 0, all: 0, new: 0 });
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('mine');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [labelFilter, setLabelFilter] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  const [labels, setLabels] = useState([]);
  const [agents, setAgents] = useState([]);
  const [showNewChat, setShowNewChat] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [newPhone, setNewPhone] = useState('');
  const [newName, setNewName] = useState('');
  const [contactSearch, setContactSearch] = useState('');

  const fetchCounts = async () => {
    try {
      const data = await getConversationCounts();
      setCounts(data);
    } catch (e) {}
  };

  const fetchLabels = async () => {
    try {
      const data = await getLabels();
      setLabels(data);
    } catch (e) {}
  };

  const fetchAgents = async () => {
    try {
      const data = await getAgents();
      setAgents(data);
    } catch (e) {}
  };

  const fetchConversations = async () => {
    try {
      const data = await getConversations({
        search,
        tab: agentFilter ? 'all' : activeTab,  // When filtering by agent, fetch all
        status: statusFilter,
        category: categoryFilter,
        label_id: labelFilter || undefined,
        show_closed: statusFilter === 'closed'
      });
      // Client-side agent filter
      if (agentFilter) {
        const agentId = parseInt(agentFilter);
        setConversations(data.filter(c => c.owner_id === agentId));
      } else {
        setConversations(data);
      }
    } catch (e) {}
  };

  useEffect(() => { fetchLabels(); fetchAgents(); }, []);
  useEffect(() => { fetchConversations(); fetchCounts(); }, [search, activeTab, statusFilter, categoryFilter, labelFilter, agentFilter, refreshTrigger]);

  const openNewChatModal = async () => {
    setShowNewChat(true);
    try {
      const data = await getContacts();
      setContacts(data);
    } catch (e) {}
  };

  const handleSelectContact = async (contact) => {
    try {
      const conv = await createConversation({ contact_id: contact.id });
      setShowNewChat(false);
      onSelect(conv);
      fetchConversations();
      fetchCounts();
    } catch (e) {
      alert(e.message || 'שגיאה ביצירת שיחה');
    }
  };

  const handleCreateNewContact = async () => {
    if (!newPhone) return;
    try {
      const conv = await createConversation({ phone: newPhone, name: newName || newPhone });
      setShowNewChat(false);
      setNewPhone('');
      setNewName('');
      onSelect(conv);
      fetchConversations();
      fetchCounts();
    } catch (e) {
      alert(e.message || 'שגיאה ביצירת שיחה');
    }
  };

  const filteredContacts = contacts.filter(c =>
    c.name.includes(contactSearch) || c.phone.includes(contactSearch)
  );

  const tabs = [
    { id: 'mine', label: 'שלי', count: counts.mine },
    { id: 'unassigned', label: 'לא הוקצתה', count: counts.unassigned },
    { id: 'all', label: 'הכל', count: counts.all },
    { id: 'new', label: 'חדש', count: counts.new },
  ];

  const getLabelById = (id) => labels.find(l => l.id === id);

  return (
    <div className={`${isMobile ? 'w-full' : 'w-[380px]'} bg-wa-sidebar border-l border-wa-border flex flex-col h-full`}>
      {/* Header */}
      <div className="p-4 pb-2 border-b border-wa-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">שיחות</h2>
          <button
            onClick={openNewChatModal}
            className="bg-wa-dark hover:bg-wa-medium text-white px-3 py-1.5 rounded-lg text-sm font-medium transition"
          >
            + שיחה חדשה
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש לפי שם או טלפון..."
            className="w-full bg-wa-input text-wa-text rounded-lg px-4 py-2.5 pr-10 outline-none text-sm focus:ring-1 focus:ring-wa-medium"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-wa-textSecondary">🔍</span>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-wa-input rounded-lg p-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition flex items-center justify-center gap-1
                ${activeTab === tab.id
                  ? 'bg-wa-dark text-white shadow-sm'
                  : 'text-wa-textSecondary hover:text-wa-text hover:bg-wa-hover'
                }`}
            >
              <span>{tab.label}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full min-w-[20px]
                ${activeTab === tab.id
                  ? 'bg-white/20'
                  : 'bg-wa-border/50'
                }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Filters row */}
      <div className="px-4 py-2 border-b border-wa-border/50 flex gap-2 flex-wrap">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-wa-input text-wa-text text-xs rounded-lg px-2 py-1.5 outline-none cursor-pointer"
        >
          <option value="">סטטוס</option>
          <option value="open">פתוח</option>
          <option value="in_progress">בטיפול</option>
          <option value="waiting">ממתין</option>
          <option value="closed">סגור</option>
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="bg-wa-input text-wa-text text-xs rounded-lg px-2 py-1.5 outline-none cursor-pointer"
        >
          <option value="">קטגוריה</option>
          <option value="service">שירות</option>
          <option value="sales">מכירות</option>
        </select>
        {user?.role === 'admin' && agents.length > 0 && (
          <select
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            className={`text-xs rounded-lg px-2 py-1.5 outline-none cursor-pointer ${agentFilter ? 'bg-wa-dark text-white' : 'bg-wa-input text-wa-text'}`}
          >
            <option value="">נציג</option>
            {agents.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        )}
        {labels.length > 0 && (
          <select
            value={labelFilter}
            onChange={(e) => setLabelFilter(e.target.value)}
            className="bg-wa-input text-wa-text text-xs rounded-lg px-2 py-1.5 outline-none cursor-pointer"
          >
            <option value="">תווית</option>
            {labels.map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        )}
        {(statusFilter || categoryFilter || labelFilter || agentFilter) && (
          <button
            onClick={() => { setStatusFilter(''); setCategoryFilter(''); setLabelFilter(''); setAgentFilter(''); }}
            className="text-xs text-wa-light hover:underline"
          >
            נקה
          </button>
        )}
      </div>

      {/* Count bar */}
      <div className="px-4 py-1.5 border-b border-wa-border/30 bg-wa-sidebar">
        <span className="text-[11px] text-wa-textSecondary">
          {conversations.length} שיחות
        </span>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="p-8 text-center text-wa-textSecondary text-sm">
            <div className="text-4xl mb-3">💬</div>
            <p>{activeTab === 'unassigned' ? 'אין שיחות ללא הקצאה' : activeTab === 'new' ? 'אין שיחות חדשות' : 'אין שיחות להצגה'}</p>
          </div>
        ) : (
          conversations.map(conv => (
            <div
              key={conv.id}
              onClick={() => onSelect(conv)}
              className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition border-b border-wa-border/30
                ${selectedId === conv.id ? 'bg-wa-hover' : 'hover:bg-wa-hover/50'}`}
            >
              {/* Avatar */}
              <div className="relative w-12 h-12 rounded-full bg-wa-input flex items-center justify-center text-lg font-medium shrink-0">
                {conv.contact?.name?.charAt(0) || '?'}
                {/* Priority indicator */}
                {conv.priority && conv.priority !== 'normal' && (
                  <span className="absolute -top-1 -right-1 text-xs" title={priorityIcons[conv.priority]?.label}>
                    {priorityIcons[conv.priority]?.icon}
                  </span>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className={`text-sm truncate ${conv.unread_count > 0 ? 'font-bold text-wa-text' : 'text-wa-text'}`}>
                    {conv.contact?.name}
                  </span>
                  <span className="text-xs text-wa-textSecondary shrink-0 mr-2">
                    {formatTime(conv.last_message_at)}
                  </span>
                </div>
                {conv.owner_name && (
                  <div className="text-[10px] text-wa-light truncate mb-0.5">👤 {conv.owner_name}</div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-wa-textSecondary truncate flex-1">
                    {conv.last_message || 'אין הודעות'}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0 mr-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: statusColors[conv.status] }}
                      title={statusLabels[conv.status]}
                    />
                    {conv.unread_count > 0 && (
                      <span className="bg-wa-light text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center notification-badge">
                        {conv.unread_count}
                      </span>
                    )}
                  </div>
                </div>
                {/* Labels */}
                {conv.labels && conv.labels.length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {conv.labels.slice(0, 3).map(labelId => {
                      const label = getLabelById(labelId);
                      if (!label) return null;
                      return (
                        <span
                          key={labelId}
                          className="text-[10px] px-1.5 py-0.5 rounded-full text-white truncate max-w-[80px]"
                          style={{ backgroundColor: label.color }}
                        >
                          {label.name}
                        </span>
                      );
                    })}
                    {conv.labels.length > 3 && (
                      <span className="text-[10px] text-wa-textSecondary">+{conv.labels.length - 3}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* New Chat Modal */}
      {showNewChat && (
        <div className="modal-overlay" onClick={() => setShowNewChat(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">💬 שיחה חדשה</h3>

            <div className="bg-emerald-50 rounded-lg p-4 mb-4 border border-emerald-200">
              <h4 className="text-sm font-medium mb-3 text-wa-dark">איש קשר חדש</h4>
              <div className="flex gap-2 mb-2">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="שם"
                  className="flex-1 bg-wa-input text-wa-text rounded-lg px-3 py-2 text-sm outline-none"
                />
                <input
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="טלפון (050-...)"
                  className="flex-1 bg-wa-input text-wa-text rounded-lg px-3 py-2 text-sm outline-none"
                  dir="ltr"
                />
              </div>
              <button
                onClick={handleCreateNewContact}
                disabled={!newPhone}
                className="w-full bg-wa-dark hover:bg-wa-medium text-white py-2 rounded-lg text-sm transition disabled:opacity-30"
              >
                צור שיחה
              </button>
            </div>

            <div>
              <h4 className="text-sm font-medium mb-2 text-wa-textSecondary">או בחר מאנשי קשר קיימים</h4>
              <input
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                placeholder="חיפוש איש קשר..."
                className="w-full bg-wa-input text-wa-text rounded-lg px-3 py-2 text-sm outline-none mb-2"
              />
              <div className="max-h-48 overflow-y-auto space-y-1">
                {filteredContacts.map(c => (
                  <button
                    key={c.id}
                    onClick={() => handleSelectContact(c)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-wa-hover transition text-right"
                  >
                    <div className="w-9 h-9 rounded-full bg-wa-input flex items-center justify-center text-sm font-medium">
                      {c.name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-sm">{c.name}</div>
                      <div className="text-xs text-wa-textSecondary" dir="ltr">{c.phone}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => setShowNewChat(false)}
              className="mt-4 w-full py-2 text-wa-textSecondary hover:text-wa-text text-sm"
            >
              ביטול
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
