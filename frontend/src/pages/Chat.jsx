import React, { useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import ConversationList from '../components/ConversationList';
import ChatWindow from '../components/ChatWindow';
import ContactCard from '../components/ContactCard';
import useWebSocket from '../hooks/useWebSocket';
import useNotifications from '../hooks/useNotifications';
import { updateConversation } from '../api';

export default function Chat() {
  const { user } = useAuth();
  const [selectedConv, setSelectedConv] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const { showNotification } = useNotifications();

  const handleWsMessage = useCallback((data) => {
    if (data.type === 'new_message') {
      setRefreshTrigger(prev => prev + 1);

      if (data.conversation_id === selectedConv?.id) {
        setSelectedConv(prev => ({ ...prev, _refresh: Date.now() }));
      }

      if (data.message?.direction === 'inbound') {
        showNotification(
          data.message.sender_name || 'הודעה חדשה',
          data.message.content
        );
      }
    }

    if (data.type === 'message_status') {
      // Real-time read status update (sent → delivered → read)
      if (data.conversation_id === selectedConv?.id) {
        setSelectedConv(prev => ({ ...prev, _refresh: Date.now() }));
      }
    }

    if (data.type === 'conversation_transferred' || data.type === 'conversation_shared') {
      setRefreshTrigger(prev => prev + 1);
      showNotification(
        data.type === 'conversation_transferred' ? 'שיחה הועברה' : 'שיחה שותפה',
        `מאת ${data.from_agent}`
      );
    }
  }, [selectedConv?.id]);

  useWebSocket(handleWsMessage);

  const handleConversationUpdate = async (update) => {
    if (!selectedConv) return;
    try {
      const updated = await updateConversation(selectedConv.id, update);
      setSelectedConv(updated);
      setRefreshTrigger(prev => prev + 1);
    } catch (e) {}
  };

  return (
    <div className="h-screen flex font-rubik" dir="rtl">
      <Sidebar />
      <ConversationList
        selectedId={selectedConv?.id}
        onSelect={setSelectedConv}
        refreshTrigger={refreshTrigger}
      />
      <ChatWindow
        conversation={selectedConv}
        onConversationUpdate={handleConversationUpdate}
      />
      {selectedConv && (
        <ContactCard
          conversation={selectedConv}
          onConversationUpdate={handleConversationUpdate}
        />
      )}
    </div>
  );
}
