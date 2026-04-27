import React, { useState, useEffect } from 'react';
import { getAgents, transferConversation, shareConversation } from '../api';
import { useAuth } from '../App';

export default function TransferModal({ conversationId, mode, onClose, onDone }) {
  const { user } = useAuth();
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getAgents().then(data => {
      setAgents(data.filter(a => a.id !== user.id && a.is_active));
    }).catch(() => {});
  }, []);

  const handleSelect = async (agentId) => {
    setLoading(true);
    try {
      if (mode === 'transfer') {
        await transferConversation(conversationId, agentId);
      } else {
        await shareConversation(conversationId, agentId);
      }
      onDone();
    } catch (e) {
      alert('שגיאה בביצוע הפעולה');
    } finally {
      setLoading(false);
    }
  };

  const statusColors = { online: '#25D366', busy: '#F59E0B', away: '#EF4444' };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4">
          {mode === 'transfer' ? '↗️ העבר שיחה לנציג' : '👥 שתף שיחה עם נציג'}
        </h3>
        <div className="space-y-2">
          {agents.map(agent => (
            <button
              key={agent.id}
              onClick={() => handleSelect(agent.id)}
              disabled={loading}
              className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-wa-hover transition text-right"
            >
              <div className="w-10 h-10 rounded-full bg-wa-input flex items-center justify-center font-medium relative">
                {agent.name.charAt(0)}
                <div
                  className="absolute -bottom-0.5 -left-0.5 w-3 h-3 rounded-full border-2 border-wa-sidebar"
                  style={{ backgroundColor: statusColors[agent.status] }}
                />
              </div>
              <div>
                <div className="text-sm font-medium">{agent.name}</div>
                <div className="text-xs text-wa-textSecondary">{agent.role === 'admin' ? 'מנהל' : 'נציג'}</div>
              </div>
            </button>
          ))}
          {agents.length === 0 && (
            <div className="text-center text-wa-textSecondary text-sm py-4">אין נציגים זמינים</div>
          )}
        </div>
        <button
          onClick={onClose}
          className="mt-4 w-full py-2 text-wa-textSecondary hover:text-wa-text text-sm"
        >
          ביטול
        </button>
      </div>
    </div>
  );
}
