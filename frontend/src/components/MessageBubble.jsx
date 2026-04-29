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
  // Proxy WhatsApp media through our backend (with auth token)
  if (url.startsWith('wa-media://')) {
    const mediaId = url.replace('wa-media://', '');
    const token = localStorage.getItem('token');
    return `/api/webhook/whatsapp/media/${mediaId}?token=${token}`;
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
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-yellow-600" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
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
          <div className="mb-2">
            <img src={mediaUrl} alt="" className="rounded-md max-w-full cursor-pointer" style={{ maxHeight: 250, objectFit: 'contain' }} onClick={() => window.open(mediaUrl, '_blank')} />
            <a href={mediaUrl} download className="text-[10px] text-wa-light hover:underline mt-1 inline-flex items-center gap-1"><svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg> הורד תמונה</a>
          </div>
        )}

        {message.message_type === 'video' && mediaUrl && (
          <video src={mediaUrl} controls className="rounded-md mb-2 max-w-full" style={{ maxHeight: 300 }} />
        )}

        {(message.message_type === 'audio' || message.message_type === 'voice') && mediaUrl && (
          <div className="flex items-center gap-2 mb-2">
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-wa-dark shrink-0" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
            <audio src={mediaUrl} controls className="flex-1" style={{ height: 36 }} />
          </div>
        )}

        {message.message_type === 'file' && mediaUrl && (
          <a href={mediaUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2 mb-2 text-sm text-wa-dark hover:underline border border-gray-200">
            <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> {message.content || 'קובץ'}
          </a>
        )}

        {message.message_type === 'sticker' && mediaUrl && (
          <img src={mediaUrl} alt="סטיקר" className="w-32 h-32 object-contain mb-1" />
        )}

        {message.message_type === 'location' && (
          <div className="bg-gray-100 rounded-lg px-3 py-2 mb-2 text-sm border border-gray-200">
            <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 inline" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg> {message.content || 'מיקום'}
          </div>
        )}

        {message.message_type === 'contact' && (
          <div className="bg-gray-100 rounded-lg px-3 py-2 mb-2 text-sm border border-gray-200">
            <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 inline" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> {message.content || 'איש קשר'}
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
