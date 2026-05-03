import React, { useState, useEffect, useRef } from 'react';
import { updateContact, getContact, updateConversation, getConversations, getAgents, transferConversation, shareConversation, getLabels, createLabel } from '../api';

const statusLabels = { open: 'פתוח', in_progress: 'בטיפול', waiting: 'ממתין', closed: 'סגור' };
const categoryLabels = { service: 'שירות', sales: 'מכירות' };
const priorityOptions = [
  { value: 'low', label: 'נמוך', icon: '⚪' },
  { value: 'normal', label: 'רגיל', icon: '🔵' },
  { value: 'high', label: 'גבוה', icon: '🟠' },
  { value: 'urgent', label: 'דחוף', icon: '🔴' },
];

export default function ContactCard({ conversation, onConversationUpdate, onClose, isMobile = false }) {
  const [contact, setContact] = useState(conversation?.contact);
  const [notes, setNotes] = useState(contact?.notes || '');
  const [category, setCategory] = useState(contact?.category || 'service');
  const [history, setHistory] = useState([]);
  const [agents, setAgents] = useState([]);
  const [labels, setLabels] = useState([]);
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('#378ADD');
  const [saveStatus, setSaveStatus] = useState(''); // '', 'saving', 'saved', 'error'
  const saveTimeout = useRef(null);

  const labelColors = ['#378ADD', '#25D366', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

  useEffect(() => {
    if (conversation?.contact) {
      setContact(conversation.contact);
      setCategory(conversation.contact.category || 'service');
      // Fetch fresh contact data to get latest notes
      getContact(conversation.contact.id || conversation.contact_id)
        .then(freshContact => {
          setContact(freshContact);
          setNotes(freshContact.notes || '');
        })
        .catch(() => {
          setNotes(conversation.contact.notes || '');
        });
    }
  }, [conversation?.id]);

  useEffect(() => {
    if (contact) {
      getConversations({ search: contact.phone, show_closed: true })
        .then(setHistory)
        .catch(() => {});
    }
  }, [contact?.id]);

  useEffect(() => {
    getAgents().then(setAgents).catch(() => {});
    getLabels().then(setLabels).catch(() => {});
  }, []);

  // Cleanup save timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
    };
  }, []);

  const handleNotesChange = (e) => {
    const val = e.target.value;
    setNotes(val);
    setSaveStatus('saving');
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      try {
        await updateContact(contact.id, { notes: val });
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus(''), 2000);
      } catch (err) {
        console.error('Failed to save notes:', err);
        setSaveStatus('error');
      }
    }, 1000);
  };

  const handleCategoryChange = async (e) => {
    const val = e.target.value;
    setCategory(val);
    try {
      await updateContact(contact.id, { category: val });
    } catch (e) {}
  };

  const handleStatusChange = (e) => {
    onConversationUpdate?.({ status: e.target.value });
  };

  const handleConvCategoryChange = (e) => {
    onConversationUpdate?.({ category: e.target.value });
  };

  const handlePriorityChange = (e) => {
    onConversationUpdate?.({ priority: e.target.value });
  };

  const toggleLabel = async (labelId) => {
    const current = conversation.labels || [];
    const updated = current.includes(labelId)
      ? current.filter(id => id !== labelId)
      : [...current, labelId];
    onConversationUpdate?.({ labels: updated });
  };

  const handleCreateLabel = async () => {
    if (!newLabelName.trim()) return;
    try {
      const label = await createLabel({ name: newLabelName.trim(), color: newLabelColor });
      setLabels(prev => [...prev, label]);
      setNewLabelName('');
      // Auto-assign new label to this conversation
      const updated = [...(conversation.labels || []), label.id];
      onConversationUpdate?.({ labels: updated });
    } catch (e) {
      alert(e.message || 'שגיאה ביצירת תווית');
    }
  };

  const handleAssignAgent = async (e) => {
    const agentId = parseInt(e.target.value);
    if (!agentId) return;
    const selectedAgent = agents.find(a => a.id === agentId);
    const agentName = selectedAgent?.name || 'הנציג הנבחר';

    if (!window.confirm(`האם אתה בטוח שברצונך להעביר את השיחה ל${agentName}?\nהשיחה תיעלם מהרשימה שלך.`)) {
      e.target.value = conversation.owner_id || '';
      return;
    }

    try {
      await transferConversation(conversation.id, agentId);
      onConversationUpdate?.({ owner_id: agentId });
    } catch (err) {}
  };

  const handleShareAgent = async (e) => {
    const agentId = parseInt(e.target.value);
    if (!agentId) return;
    try {
      await shareConversation(conversation.id, agentId);
    } catch (err) {}
    e.target.value = '';
  };

  if (!contact) return null;

  return (
    <div className={`${isMobile ? 'w-full' : 'w-[300px]'} bg-wa-sidebar border-r border-wa-border flex flex-col h-full shrink-0`}>
      {/* Header */}
      <div className="h-14 md:h-16 flex items-center px-4 border-b border-wa-border gap-3">
        {onClose && (
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-wa-textSecondary hover:bg-wa-hover shrink-0"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
        )}
        <h3 className="font-semibold">פרטי לקוח</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Avatar & Info */}
        <div className="text-center mb-5">
          <div className="w-16 h-16 rounded-full bg-wa-input mx-auto mb-2 flex items-center justify-center text-2xl font-medium">
            {contact.name?.charAt(0)}
          </div>
          <h3 className="text-base font-semibold">{contact.name}</h3>
          <p className="text-wa-textSecondary text-sm" dir="ltr">{contact.phone}</p>
        </div>

        {/* Divider */}
        <div className="border-t border-wa-border my-3"></div>

        {/* Conversation Status */}
        <div className="mb-3">
          <label className="block text-wa-textSecondary text-xs mb-1.5">סטטוס שיחה</label>
          <select
            value={conversation.status}
            onChange={handleStatusChange}
            className="w-full bg-wa-input text-wa-text rounded-lg px-3 py-2 text-sm outline-none cursor-pointer"
          >
            <option value="open">פתוח</option>
            <option value="in_progress">בטיפול</option>
            <option value="waiting">ממתין</option>
            <option value="closed">סגור</option>
          </select>
        </div>

        {/* Conversation Category */}
        <div className="mb-3">
          <label className="block text-wa-textSecondary text-xs mb-1.5">קטגוריית שיחה</label>
          <select
            value={conversation.category}
            onChange={handleConvCategoryChange}
            className="w-full bg-wa-input text-wa-text rounded-lg px-3 py-2 text-sm outline-none cursor-pointer"
          >
            <option value="service">שירות</option>
            <option value="sales">מכירות</option>
          </select>
        </div>

        {/* Priority */}
        <div className="mb-3">
          <label className="block text-wa-textSecondary text-xs mb-1.5">עדיפות</label>
          <select
            value={conversation.priority || 'normal'}
            onChange={handlePriorityChange}
            className="w-full bg-wa-input text-wa-text rounded-lg px-3 py-2 text-sm outline-none cursor-pointer"
          >
            {priorityOptions.map(p => (
              <option key={p.value} value={p.value}>{p.icon} {p.label}</option>
            ))}
          </select>
        </div>

        {/* Labels / Tags */}
        <div className="mb-3">
          <label className="block text-wa-textSecondary text-xs mb-1.5">תוויות</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {(conversation.labels || []).map(labelId => {
              const label = labels.find(l => l.id === labelId);
              if (!label) return null;
              return (
                <span
                  key={labelId}
                  className="text-xs px-2 py-1 rounded-full text-white flex items-center gap-1 cursor-pointer hover:opacity-80"
                  style={{ backgroundColor: label.color }}
                  onClick={() => toggleLabel(labelId)}
                  title="לחץ להסרה"
                >
                  {label.name}
                  <span className="text-[10px] opacity-70">✕</span>
                </span>
              );
            })}
            <button
              onClick={() => setShowLabelPicker(!showLabelPicker)}
              className="text-xs px-2 py-1 rounded-full border border-dashed border-wa-border text-wa-textSecondary hover:border-wa-light hover:text-wa-light transition"
            >
              + הוסף תווית
            </button>
          </div>
          {showLabelPicker && (
            <div className="bg-wa-input rounded-lg p-3 mb-2">
              {labels.filter(l => !(conversation.labels || []).includes(l.id)).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {labels.filter(l => !(conversation.labels || []).includes(l.id)).map(l => (
                    <button
                      key={l.id}
                      onClick={() => toggleLabel(l.id)}
                      className="text-xs px-2 py-1 rounded-full text-white hover:opacity-80 transition"
                      style={{ backgroundColor: l.color }}
                    >
                      {l.name}
                    </button>
                  ))}
                </div>
              )}
              <div className="border-t border-wa-border/50 pt-2 mt-1">
                <div className="flex gap-1.5 mb-1.5">
                  <input
                    value={newLabelName}
                    onChange={(e) => setNewLabelName(e.target.value)}
                    placeholder="תווית חדשה..."
                    className="flex-1 bg-wa-sidebar text-wa-text rounded px-2 py-1 text-xs outline-none"
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateLabel()}
                  />
                  <button
                    onClick={handleCreateLabel}
                    disabled={!newLabelName.trim()}
                    className="bg-wa-dark text-white text-xs px-2 py-1 rounded disabled:opacity-30"
                  >
                    +
                  </button>
                </div>
                <div className="flex gap-1">
                  {labelColors.map(c => (
                    <button
                      key={c}
                      onClick={() => setNewLabelColor(c)}
                      className="w-5 h-5 rounded-full transition"
                      style={{
                        backgroundColor: c,
                        outline: newLabelColor === c ? '2px solid var(--tw-color-wa-text, #E9EDEF)' : 'none',
                        outlineOffset: '2px'
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Assigned Agent */}
        <div className="mb-3">
          <label className="block text-wa-textSecondary text-xs mb-1.5">נציג משויך</label>
          <select
            value={conversation.owner_id || ''}
            onChange={handleAssignAgent}
            className="w-full bg-wa-input text-wa-text rounded-lg px-3 py-2 text-sm outline-none cursor-pointer"
          >
            <option value="">לא משויך</option>
            {agents.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        {/* Share with agent */}
        <div className="mb-3">
          <label className="block text-wa-textSecondary text-xs mb-1.5">שתף עם נציג</label>
          <select
            value=""
            onChange={handleShareAgent}
            className="w-full bg-wa-input text-wa-text rounded-lg px-3 py-2 text-sm outline-none cursor-pointer"
          >
            <option value="">בחר נציג לשיתוף...</option>
            {agents
              .filter(a => a.id !== conversation.owner_id && !(conversation.shared_with || []).includes(a.id))
              .map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
          </select>
          {conversation.shared_with?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {conversation.shared_with.map(id => {
                const agent = agents.find(a => a.id === id);
                return agent ? (
                  <span key={id} className="bg-wa-input text-xs px-2 py-1 rounded-lg">
                    {agent.name}
                  </span>
                ) : null;
              })}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-wa-border my-3"></div>

        {/* Contact Category */}
        <div className="mb-3">
          <label className="block text-wa-textSecondary text-xs mb-1.5">קטגוריית לקוח</label>
          <select
            value={category}
            onChange={handleCategoryChange}
            className="w-full bg-wa-input text-wa-text rounded-lg px-3 py-2 text-sm outline-none cursor-pointer"
          >
            <option value="service">שירות</option>
            <option value="sales">מכירות</option>
          </select>
        </div>

        {/* Notes */}
        <div className="mb-3">
          <label className="block text-wa-textSecondary text-xs mb-1.5">הערות</label>
          <textarea
            value={notes}
            onChange={handleNotesChange}
            placeholder="הוסף הערות על הלקוח..."
            className="w-full bg-wa-input text-wa-text rounded-lg px-3 py-2 text-sm outline-none resize-none h-20"
          />
          <p className="text-[10px] mt-1">
            {saveStatus === 'saving' && <span className="text-yellow-600">שומר...</span>}
            {saveStatus === 'saved' && <span className="text-green-600">נשמר ✓</span>}
            {saveStatus === 'error' && <span className="text-red-500">שגיאה בשמירה</span>}
            {saveStatus === '' && <span className="text-wa-textSecondary">שמירה אוטומטית</span>}
          </p>
        </div>

        {/* Divider */}
        <div className="border-t border-wa-border my-3"></div>

        {/* Conversation history */}
        <div>
          <label className="block text-wa-textSecondary text-xs mb-2">היסטוריית שיחות</label>
          {history.length === 0 ? (
            <p className="text-wa-textSecondary text-xs">אין שיחות קודמות</p>
          ) : (
            <div className="space-y-2">
              {history.map(h => (
                <div key={h.id} className="bg-wa-input rounded-lg px-3 py-2 text-sm cursor-pointer hover:bg-wa-hover transition">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-wa-textSecondary">
                      {new Date(h.created_at).toLocaleDateString('he-IL')}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded text-white
                      ${h.status === 'closed' ? 'bg-gray-500' : 'bg-wa-dark'}`}>
                      {statusLabels[h.status]}
                    </span>
                  </div>
                  <p className="text-xs text-wa-textSecondary truncate">{h.last_message || 'אין הודעות'}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
