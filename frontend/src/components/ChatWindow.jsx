import React, { useState, useEffect, useRef } from 'react';
import { getMessages, sendMessage, sendTemplateMessage, markRead, deleteMessage } from '../api';
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
  const [showWaTemplates, setShowWaTemplates] = useState(false);
  const [sendingTemplate, setSendingTemplate] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const recordingIntervalRef = useRef(null);

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

  const handleSendWaTemplate = async (templateName) => {
    setSendingTemplate(true);
    try {
      const customerName = conversation.contact?.name || '';
      const agentName = user?.name || '';
      await sendTemplateMessage(conversation.id, templateName, customerName, agentName);
      setShowWaTemplates(false);
      fetchMessages();
    } catch (e) {
      alert(e.message || 'שגיאה בשליחת הודעה יזומית');
    }
    setSendingTemplate(false);
  };

  const waTemplates = [
    { name: 'welcome_yesh_li_zchut', label: '👋 הודעת פתיחה', desc: 'הודעת היכרות ראשונית ללקוח חדש' },
    { name: 'no_answer_followup', label: '🔄 אין מענה', desc: 'מעקב כשלקוח לא עונה' },
  ];

  const hasOutboundMessages = messages.some(m => m.direction === 'outbound' && !m.is_internal_note);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/ogg; codecs=opus' });
        clearInterval(recordingIntervalRef.current);
        setRecordingTime(0);

        // Upload voice message
        const formData = new FormData();
        formData.append('file', audioBlob, 'voice.ogg');
        try {
          const token = localStorage.getItem('token');
          const res = await fetch(`/api/conversations/${conversation.id}/messages/upload?type=voice`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
          });
          if (res.ok) {
            const msg = await res.json();
            setMessages(prev => [...prev, msg]);
          }
        } catch (err) {
          console.error('Voice upload error:', err);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingIntervalRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch (err) {
      alert('לא ניתן לגשת למיקרופון');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      mediaRecorderRef.current = null;
      audioChunksRef.current = [];
      clearInterval(recordingIntervalRef.current);
      setIsRecording(false);
      setRecordingTime(0);
    }
  };

  const formatRecordingTime = (s) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`;

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
                <span className="px-2 py-0.5 rounded bg-green-900/30 text-green-400">📱 WhatsApp</span>
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
            <button onClick={() => setShowWaTemplates(!showWaTemplates)} className="w-9 h-9 rounded-lg hover:bg-wa-hover flex items-center justify-center text-wa-textSecondary hover:text-wa-dark" title="הודעה יזומית WhatsApp">
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/><path d="M9 10h6M9 14h4" strokeLinecap="round"/></svg>
            </button>
            <button onClick={() => setShowTemplates(!showTemplates)} className="w-9 h-9 rounded-lg hover:bg-wa-hover flex items-center justify-center text-wa-textSecondary hover:text-wa-dark" title="טמפלייטים">
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinejoin="round" strokeLinecap="round"/></svg>
            </button>
            <button onClick={() => setIsNote(!isNote)} className={`w-9 h-9 rounded-lg hover:bg-wa-hover flex items-center justify-center ${isNote ? 'bg-wa-note text-yellow-700 border border-yellow-500/30' : 'text-wa-textSecondary hover:text-wa-dark'}`} title="הערה פנימית">
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4" strokeLinecap="round"/></svg>
            </button>
            <button onClick={() => fileInputRef.current?.click()} className="w-9 h-9 rounded-lg hover:bg-wa-hover flex items-center justify-center text-wa-textSecondary hover:text-wa-dark" title="קובץ">
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" strokeLinecap="round"/></svg>
            </button>
            <button onClick={() => imageInputRef.current?.click()} className="w-9 h-9 rounded-lg hover:bg-wa-hover flex items-center justify-center text-wa-textSecondary hover:text-wa-dark" title="תמונה">
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
            </button>
            <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => handleFileUpload(e, 'file')} />
            <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'image')} />
          </div>
          {isRecording ? (
            <div className="flex-1 flex items-center gap-3 bg-red-50 rounded-lg px-4 py-2.5 border border-red-200">
              <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm text-red-600 font-medium">מקליט... {formatRecordingTime(recordingTime)}</span>
              <div className="flex-1" />
              <button onClick={cancelRecording} className="text-red-400 hover:text-red-600 text-sm">ביטול</button>
              <button onClick={stopRecording} className="bg-red-500 hover:bg-red-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition">שלח</button>
            </div>
          ) : (
          <>
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
          {input.trim() ? (
            <button
              onClick={handleSend}
              className="w-10 h-10 rounded-full bg-wa-dark hover:bg-wa-medium flex items-center justify-center transition"
              title="שלח (Ctrl+Enter)"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-white rotate-180" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </button>
          ) : (
            <button
              onClick={startRecording}
              className="w-10 h-10 rounded-full bg-wa-dark hover:bg-wa-medium flex items-center justify-center transition"
              title="הקלט הודעה קולית"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="currentColor">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
            </button>
          )}
          </>
          )}
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

      {/* WhatsApp Template picker */}
      {showWaTemplates && (
        <div className="absolute bottom-20 right-4 bg-wa-sidebar rounded-xl shadow-xl border border-wa-border p-4 w-80 z-50">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">📨 שליחת הודעה יזומית</h3>
            <button onClick={() => setShowWaTemplates(false)} className="text-wa-textSecondary hover:text-wa-text">✕</button>
          </div>
          <p className="text-xs text-wa-textSecondary mb-3">בחר תבנית WhatsApp מאושרת לפתיחת שיחה:</p>
          <div className="space-y-2">
            {waTemplates.map(t => (
              <button
                key={t.name}
                onClick={() => handleSendWaTemplate(t.name)}
                disabled={sendingTemplate}
                className="w-full text-right p-3 rounded-lg bg-wa-input hover:bg-wa-hover transition disabled:opacity-50"
              >
                <div className="text-sm font-medium">{t.label}</div>
                <div className="text-xs text-wa-textSecondary mt-0.5">{t.desc}</div>
              </button>
            ))}
          </div>
        </div>
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
