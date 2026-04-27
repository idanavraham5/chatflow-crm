import React, { useState, useEffect } from 'react';
import { getTemplates } from '../api';

export default function TemplatesPicker({ onSelect, onSend, onClose }) {
  const [templates, setTemplates] = useState([]);
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    getTemplates().then(setTemplates).catch(() => {});
  }, []);

  const filtered = templates.filter(t =>
    t.title.includes(search) || t.content.includes(search)
  );

  return (
    <div className="absolute bottom-20 right-4 w-96 bg-wa-sidebar rounded-xl shadow-2xl border border-wa-border z-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-wa-border">
        <h3 className="font-medium text-sm">
          {preview ? '👁️ תצוגה מקדימה' : '⚡ טמפלייטים'}
        </h3>
        <button
          onClick={preview ? () => setPreview(null) : onClose}
          className="text-wa-textSecondary hover:text-wa-text text-lg"
        >
          {preview ? '←' : '✕'}
        </button>
      </div>

      {/* Preview mode */}
      {preview ? (
        <div className="p-4">
          <div className="font-medium text-sm text-wa-light mb-2">{preview.title}</div>
          <div className="bg-wa-input rounded-lg p-3 text-sm text-wa-text whitespace-pre-wrap mb-4 max-h-48 overflow-y-auto">
            {preview.content}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { onSend ? onSend(preview) : onSelect(preview); }}
              className="flex-1 bg-wa-dark hover:bg-wa-medium text-white rounded-lg py-2.5 text-sm font-medium transition flex items-center justify-center gap-2"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 rotate-180" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
              שלח עכשיו
            </button>
            <button
              onClick={() => { onSelect(preview); }}
              className="flex-1 bg-wa-input hover:bg-wa-hover text-wa-text rounded-lg py-2.5 text-sm transition flex items-center justify-center gap-2"
            >
              ✏️ ערוך לפני שליחה
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Search */}
          <div className="p-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש טמפלייט..."
              className="w-full bg-wa-input text-wa-text rounded-lg px-3 py-2 text-sm outline-none"
              autoFocus
            />
          </div>

          {/* Template list */}
          <div className="max-h-72 overflow-y-auto">
            {filtered.map(t => (
              <div
                key={t.id}
                onClick={() => setPreview(t)}
                className="px-4 py-3 hover:bg-wa-hover cursor-pointer border-b border-wa-border/30 flex items-center gap-3 group"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-wa-light mb-1">⚡ {t.title}</div>
                  <div className="text-xs text-wa-textSecondary line-clamp-2">{t.content}</div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSend ? onSend(t) : onSelect(t);
                  }}
                  className="shrink-0 w-8 h-8 rounded-full bg-wa-dark/80 hover:bg-wa-dark text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                  title="שלח ישירות"
                >
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 rotate-180" fill="currentColor">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                  </svg>
                </button>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="p-6 text-center text-wa-textSecondary text-sm">
                {templates.length === 0 ? (
                  <>
                    <div className="text-2xl mb-2">📝</div>
                    <div>אין טמפלייטים עדיין</div>
                    <div className="text-xs mt-1">הוסף טמפלייטים בהגדרות הקמפיינים</div>
                  </>
                ) : (
                  'לא נמצאו תוצאות'
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
