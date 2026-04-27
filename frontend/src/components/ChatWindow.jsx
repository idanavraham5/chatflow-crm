import React, { useState, useEffect, useRef } from 'react';
import { getMessages, sendMessage, markRead, deleteMessage } from '../api';
import { useAuth } from '../context/AuthContext';
import MessageBubble from './MessageBubble';
import TemplatesPicker from './TemplatesPicker';

function formatDateSeparator(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = today - msgDate;

  if (diff === 0) return 'היום';
  if (diff === 86400000) return 'אתמול';
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function groupMessagesByDate(messages) {
  const groups = [];
  let currentDate = null;

  messages.forEach(msg => {
    const date = new Date(msg.created_at).toDateString();
    if (date !== currentDate) {
      currentDate = date;
      groups.push({ type: 'date', date: msg.created_at });
    }
    groups.push({ type: 'message', data: msg });
  });

  return groups;
}

export default function ChatWindow({ conversation, onConversationUpdate }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isNote, setIsNote] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [contextMenu, setContextMenu] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);

  const hasMultipleAgents = conversation?.shared_with?.length > 0 || conversation?.owner_id;

  const fetchMessages = async () => {
    if (!conversation) return;
    try {
      const data = await getMessages(conversation.id, searchQuery);
      setMessages(data);
      // Mark as read
      if (data.length > 0) {
        const lastInbound = data.filter(m => m.direction === 'inbound' && !m.is_read).pop();
        if (lastInbound) await markRead(conversation.id, lastInbound.id);
      }
    } catch (e) {}
  };

  useEffect(() => { fetchMessages(); }, [conversation?.id, conversation?._refresh, searchQuery]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;

    try {
      const msg = await sendMessage(conversation.id, {
        content: text,
        is_internal_note: isNote
      });
      setMessages(prev => [...prev, msg]);
      setInput('');
      setIsNote(false);
    } catch (e) {}
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleContextMenu = (e, message) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, message });
  };

  const handleCopy = () => {
    if (contextMenu?.message) {
      navigator.clipboard.writeText(contextMenu.message.content);
    }
    setContextMenu(null);
  };

  const handleDelete = async () => {
    if (contextMenu?.message) {
      await deleteMessage(conversation.id, contextMenu.message.id);
      setMessages(prev => prev.filter(m => m.id !== contextMenu.message.id));
    }
    setContextMenu(null);
  };

  const handleQuote = () => {
    if (contextMenu?.message) {
      setInput(prev => `> ${contextMenu.message.content}\n\n${prev}`);
      inputRef.current?.focus();
    }
    setContextMenu(null);
  };

  const handleSelectTemplate = (template) => {
    setInput(template.content);
    setShowTemplates(false);
    inputRef.current?.focus();
  };

  const handleSendTemplate = async (template) => {
    try {
      const msg = await sendMessage(conversation.id, {
        content: template.content,
        is_internal_note: false
      });
      setMessages(prev => [...prev, msg]);
      setShowTemplates(false);
    } catch (e) {}
  };

  const hasOutboundMessages = messages.some(m => m.direction === 'outbound' && !m.is_internal_note);

  const handleFileUpload = async (e, type) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Create a fake media URL for demo (in production, upload to S3/storage)
    const fakeUrl = URL.createObjectURL(file);
    let messageType = 'file';
    if (type === 'image' || file.type.startsWith('image/')) messageType = 'image';
    else if (file.type.startsWith('video/')) messageType = 'video';
    else if (file.type.startsWith('audio/')) messageType = 'audio';

    try {
      const msg = await sendMessage(conversation.id, {
        content: `📎 ${file.name}`,
        message_type: messageType,
        media_url: fakeUrl,
      });
      setMessages(prev => [...prev, msg]);
    } catch (err) {}
    e.target.value = '';
  };

  // Close context menu on click outside
  useEffect(() => {
    const handler = () => setContextMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center wa-chat-bg">
        <div className="text-center">
          <div className="text-6xl mb-4">💬</div>
          <h2 className="text-xl text-wa-textSecondary">בחר שיחה להתחלת צ'אט</h2>
        </div>
      </div>
    );
  }

  const statusLabels = { open: 'פתוח', in_progress: 'בטיפול', waiting: 'ממתין', closed: 'סגור' };
  const categoryLabels = { service: 'שירות', sales: 'מכירות' };
  const grouped = groupMessagesByDate(messages);

  return (
    <div className="flex-1 flex flex-col bg-wa-chat h-full relative">
      {/* Header */}
      <div className="h-16 bg-wa-header flex items-center justify-between px-4 border-b border-wa-border shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-wa-input flex items-center justify-center font-medium">
            {conversation.contact?.name?.charAt(0)}
          </div>
          <div>
            <div className="font-medium text-wa-text">{conversation.contact?.name}</div>
            <div className="flex items-center gap-2 text-xs text-wa-textSecondary">
              <span className="px-2 py-0.5 rounded bg-wa-input">{categoryLabels[conversation.category]}</span>
              <span className="px-2 py-0.5 rounded bg-wa-input">{statusLabels[conversation.status]}</span>
              {conversation.phone_number_id && (
                <span className="px-2 py-0.5 rounded bg-green-900/30 text-green-400">📱 {conversation.phone_number_id}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {conversation.status !== 'closed' && (
            <button
              onClick={() => onConversationUpdate?.({ status: 'closed', is_new: false })}
              className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition flex items-center gap-1.5"
              title="סמן שיחה כטופלה"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              <span>טופל</span>
            </button>
          )}
          <button
            onClick={() => setSearchMode(!searchMode)}
            className="w-9 h-9 rounded-lg hover:bg-wa-hover flex items-center justify-center text-wa-textSecondary"
            title="חיפוש"
          >🔍</button>
        </div>
      </div>

      {/* Search bar */}
      {searchMode && (
        <div className="bg-wa-header px-4 py-2 border-b border-wa-border flex items-center gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="חיפוש בשיחה..."
            className="flex-1 bg-wa-input text-wa-text rounded-lg px-3 py-2 text-sm outline-none"
            autoFocus
          />
          <button onClick={() => { setSearchMode(false); setSearchQuery(''); }} className="text-wa-textSecondary text-sm">✕</button>
        </div>
      )}

      {/* Template Quick Start — shown when no outbound messages yet */}
      {!hasOutboundMessages && !showTemplates && (
        <div className="bg-gradient-to-b from-wa-header to-transparent px-6 py-5 border-b border-wa-border/50">
          <div className="bg-wa-sidebar rounded-xl p-5 shadow-lg border border-wa-border max-w-md mx-auto text-center">
            <div className="text-3xl mb-3">📋</div>
            <h3 className="text-wa-text font-semibold text-base mb-1">שיחה חדשה</h3>
            <p className="text-wa-textSecondary text-sm mb-4">שלח טמפלייט כדי להתחיל את השיחה</p>
            <button
              onClick={() => setShowTemplates(true)}
              className="bg-wa-dark hover:bg-wa-medium text-white rounded-lg px-6 py-2.5 text-sm font-medium transition inline-flex items-center gap-2"
            >
              <span>⚡</span>
              <span>בחר טמפלייט</span>
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 wa-chat-bg">
        {grouped.map((item, i) => {
          if (item.type === 'date') {
            return (
              <div key={`date-${i}`} className="date-separator">
                <span>{formatDateSeparator(item.date)}</span>
              </div>
            );
          }
          return (
            <MessageBubble
              key={item.data.id}
              message={item.data}
              showSender={hasMultipleAgents}
              onContextMenu={handleContextMenu}
            />
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="bg-wa-header px-4 py-3 border-t border-wa-border shrink-0">
        {isNote && (
          <div className="flex items-center gap-2 mb-2 text-xs text-yellow-700 bg-wa-note rounded-lg px-3 py-1.5 border border-yellow-500/30">
            🔒 מצב הערה פנימית — הלקוח לא יראה הודעה זו
          </div>
        )}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <button onClick={() => setShowTemplates(!showTemplates)} className="w-9 h-9 rounded-lg hover:bg-wa-hover flex items-center justify-center" title="טמפלייטים">⚡</button>
            <button onClick={() => setIsNote(!isNote)} className={`w-9 h-9 rounded-lg hover:bg-wa-hover flex items-center justify-center ${isNote ? 'bg-wa-note text-yellow-700 border border-yellow-500/30' : ''}`} title="הערה פנימית">🔒</button>
            <button onClick={() => fileInputRef.current?.click()} className="w-9 h-9 rounded-lg hover:bg-wa-hover flex items-center justify-center" title="קובץ">📎</button>
            <button onClick={() => imageInputRef.current?.click()} className="w-9 h-9 rounded-lg hover:bg-wa-hover flex items-center justify-center" title="תמונה">🖼️</button>
            <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => handleFileUpload(e, 'file')} />
            <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'image')} />
          </div>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isNote ? 'כתוב הערה פנימית...' : 'הקלד הודעה...'}
            className={`flex-1 bg-wa-input text-wa-text rounded-lg px-4 py-2.5 outline-none text-sm resize-none max-h-32
              ${isNote ? 'border border-yellow-500/30' : ''}`}
            rows={1}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="w-10 h-10 rounded-full bg-wa-dark hover:bg-wa-medium flex items-center justify-center transition disabled:opacity-30"
            title="שלח (Ctrl+Enter)"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-white rotate-180" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Templates picker */}
      {showTemplates && (
        <TemplatesPicker
          onSelect={handleSelectTemplate}
          onSend={handleSendTemplate}
          onClose={() => setShowTemplates(false)}
        />
      )}

      {/* Context menu */}
      {contextMenu && (
        <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
          <div className="context-menu-item" onClick={handleCopy}>📋 העתק</div>
          <div className="context-menu-item" onClick={handleQuote}>💬 ציטוט</div>
          <div className="context-menu-item text-red-600" onClick={handleDelete}>🗑️ מחק</div>
        </div>
      )}
    </div>
  );
}
