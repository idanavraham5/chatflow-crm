import React, { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import ConversationList from '../components/ConversationList';
import ChatWindow from '../components/ChatWindow';
import ContactCard from '../components/ContactCard';
import useWebSocket from '../hooks/useWebSocket';
import useNotifications from '../hooks/useNotifications';
import { updateConversation } from '../api';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

export default function Chat() {
  const { user } = useAuth();
  const [selectedConv, setSelectedConv] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showContactCard, setShowContactCard] = useState(false);
  const { showNotification } = useNotifications();
  const isMobile = useIsMobile();

  // Mobile view: 'list' | 'chat' | 'contact'
  const [mobileView, setMobileView] = useState('list');

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
      if (data.conversation_id === selectedConv?.id) {
        setSelectedConv(prev => ({
          ...prev,
          _statusUpdate: {
            message_id: data.message_id,
            wa_message_id: data.wa_message_id,
            status: data.status,
            timestamp: Date.now()
          }
        }));
      }
    }

    if (data.type === 'message_deleted') {
      if (data.conversation_id === selectedConv?.id) {
        setSelectedConv(prev => ({
          ...prev,
          _deletedMessage: { message_id: data.message_id, timestamp: Date.now() }
        }));
      }
      setRefreshTrigger(prev => prev + 1);
    }

    if (data.type === 'conversation_transferred' || data.type === 'conversation_shared') {
      setRefreshTrigger(prev => prev + 1);
      showNotification(
        data.type === 'conversation_transferred' ? 'שיחה הועברה' : 'שיחה שותפה',
        `מאת ${data.from_agent}`
      );
    }
  }, [selectedConv?.id]);

  const { connected } = useWebSocket(handleWsMessage);

  // Refresh conversation list when WS reconnects (after disconnection)
  const prevConnected = React.useRef(false);
  useEffect(() => {
    if (connected && !prevConnected.current) {
      // Just reconnected — refresh everything
      setRefreshTrigger(prev => prev + 1);
      if (selectedConv) {
        setSelectedConv(prev => prev ? { ...prev, _refresh: Date.now() } : prev);
      }
    }
    prevConnected.current = connected;
  }, [connected]);

  const handleSelectConversation = async (conv) => {
    setSelectedConv(conv);
    setShowContactCard(false);
    if (isMobile) setMobileView('chat');
    if (conv && conv.is_new) {
      try {
        await updateConversation(conv.id, { is_new: false });
        setRefreshTrigger(prev => prev + 1);
      } catch (e) {}
    }
  };

  const handleConversationUpdate = async (update) => {
    if (!selectedConv) return;
    try {
      const updated = await updateConversation(selectedConv.id, update);
      setSelectedConv(updated);
      setRefreshTrigger(prev => prev + 1);
    } catch (e) {}
  };

  const handleBack = () => {
    if (mobileView === 'contact') {
      setMobileView('chat');
      setShowContactCard(false);
    } else {
      setMobileView('list');
      setSelectedConv(null);
    }
  };

  const handleShowContact = () => {
    if (isMobile) {
      setMobileView('contact');
    }
    setShowContactCard(prev => !prev);
  };

  // Connection status banner
  const ConnectionBanner = () => {
    if (connected) return null;
    return (
      <div className="bg-red-500 text-white text-center text-xs py-1.5 px-4 z-50 relative">
        ⚠️ אין חיבור — מנסה להתחבר מחדש...
      </div>
    );
  };

  // ── Desktop layout ──
  if (!isMobile) {
    return (
      <div className="h-screen flex flex-col font-rubik" dir="rtl">
        <ConnectionBanner />
        <div className="flex-1 flex min-h-0">
        <Sidebar />
        <ConversationList
          selectedId={selectedConv?.id}
          onSelect={handleSelectConversation}
          refreshTrigger={refreshTrigger}
        />
        <ChatWindow
          conversation={selectedConv}
          onConversationUpdate={handleConversationUpdate}
          onShowContact={handleShowContact}
        />
        {selectedConv && showContactCard && (
          <ContactCard
            conversation={selectedConv}
            onConversationUpdate={handleConversationUpdate}
            onClose={() => setShowContactCard(false)}
          />
        )}
        </div>
      </div>
    );
  }

  // ── Mobile layout ──
  return (
    <div className="h-screen flex flex-col font-rubik" dir="rtl">
      <ConnectionBanner />
      {/* Mobile views */}
      <div className="flex-1 overflow-hidden relative">
        {/* Conversation List */}
        <div className={`absolute inset-0 transition-transform duration-200 ${mobileView === 'list' ? 'translate-x-0' : 'translate-x-full'}`}>
          <ConversationList
            selectedId={selectedConv?.id}
            onSelect={handleSelectConversation}
            refreshTrigger={refreshTrigger}
            isMobile={true}
          />
        </div>

        {/* Chat Window */}
        <div className={`absolute inset-0 transition-transform duration-200 ${mobileView === 'chat' ? 'translate-x-0' : mobileView === 'contact' ? 'translate-x-full' : '-translate-x-full'}`}>
          <ChatWindow
            conversation={selectedConv}
            onConversationUpdate={handleConversationUpdate}
            onBack={handleBack}
            onShowContact={handleShowContact}
            isMobile={true}
          />
        </div>

        {/* Contact Card */}
        <div className={`absolute inset-0 transition-transform duration-200 ${mobileView === 'contact' ? 'translate-x-0' : '-translate-x-full'}`}>
          {selectedConv && (
            <ContactCard
              conversation={selectedConv}
              onConversationUpdate={handleConversationUpdate}
              onClose={handleBack}
              isMobile={true}
            />
          )}
        </div>
      </div>

      {/* Mobile bottom navigation */}
      <Sidebar isMobile={true} />
    </div>
  );
}
