import React from 'react';

function ReadCheck({ status }) {
  if (status === 'read') return <span className="check-mark read">✓✓</span>;
  if (status === 'delivered') return <span className="check-mark delivered">✓✓</span>;
  return <span className="check-mark sent">✓</span>;
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

function resolveMediaUrl(url) {
  if (!url) return url;
  // Proxy WhatsApp media through our backend
  if (url.startsWith('wa-media://')) {
    const mediaId = url.replace('wa-media://', '');
    return `/api/webhook/whatsapp/media/${mediaId}`;
  }
  return url;
}

export default function MessageBubble({ message, showSender, onContextMenu }) {
  const isOutbound = message.direction === 'outbound';
  const isNote = message.is_internal_note;
  const mediaUrl = resolveMediaUrl(message.media_url);

  const handleContextMenu = (e) => {
    e.preventDefault();
    onContextMenu?.(e, message);
  };

  if (isNote) {
    return (
      <div className={`flex ${isOutbound ? 'justify-start' : 'justify-end'} mb-1 px-16`}>
        <div
          className="max-w-[65%] rounded-lg px-3 py-2 bg-wa-note border border-yellow-500/30"
          onContextMenu={handleContextMenu}
        >
          <div className="flex items-center gap-1 mb-1">
            <span className="text-xs">🔒</span>
            <span className="text-xs text-yellow-700">הערה פנימית</span>
            {showSender && message.sender_name && (
              <span className="text-xs text-yellow-600 mr-1">• {message.sender_name}</span>
            )}
          </div>
          <p className="text-sm text-yellow-900 whitespace-pre-wrap">{message.content}</p>
          <div className="flex items-center justify-end gap-1 mt-1">
            <span className="text-[10px] text-yellow-600">{formatTime(message.created_at)}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isOutbound ? 'justify-start' : 'justify-end'} mb-1 px-16`}>
      <div
        className={`max-w-[65%] rounded-lg px-3 py-2 relative
          ${isOutbound ? 'bg-wa-bubble-out' : 'bg-wa-bubble-in'}`}
        onContextMenu={handleContextMenu}
      >
        {showSender && isOutbound && message.sender_name && (
          <div className="text-xs text-wa-light font-medium mb-1">{message.sender_name}</div>
        )}

        {message.message_type === 'image' && mediaUrl && (
          <img src={mediaUrl} alt="" className="rounded-md mb-2 max-w-full" />
        )}

        {message.message_type === 'video' && mediaUrl && (
          <video src={mediaUrl} controls className="rounded-md mb-2 max-w-full" style={{ maxHeight: 300 }} />
        )}

        {(message.message_type === 'audio' || message.message_type === 'voice') && mediaUrl && (
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">{message.message_type === 'voice' ? '🎤' : '🎵'}</span>
            <audio src={mediaUrl} controls className="flex-1" style={{ height: 36 }} />
          </div>
        )}

        {message.message_type === 'file' && mediaUrl && (
          <a href={mediaUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2 mb-2 text-sm text-wa-dark hover:underline border border-gray-200">
            📄 {message.content || 'קובץ'}
          </a>
        )}

        {message.message_type === 'sticker' && mediaUrl && (
          <img src={mediaUrl} alt="סטיקר" className="w-32 h-32 object-contain mb-1" />
        )}

        {message.message_type === 'location' && (
          <div className="bg-gray-100 rounded-lg px-3 py-2 mb-2 text-sm border border-gray-200">
            📍 {message.content || 'מיקום'}
          </div>
        )}

        {message.message_type === 'contact' && (
          <div className="bg-gray-100 rounded-lg px-3 py-2 mb-2 text-sm border border-gray-200">
            👤 {message.content || 'איש קשר'}
          </div>
        )}

        {!['file', 'sticker', 'location', 'contact'].includes(message.message_type) && message.content && (
          <p className="text-sm text-wa-text whitespace-pre-wrap leading-relaxed">{message.content}</p>
        )}
        {['location', 'contact'].includes(message.message_type) ? null : null}

        <div className="flex items-center justify-end gap-1 mt-1">
          <span className="text-[10px] text-wa-textSecondary">{formatTime(message.created_at)}</span>
          {isOutbound && <ReadCheck status={message.read_status} />}
        </div>
      </div>
    </div>
  );
}
