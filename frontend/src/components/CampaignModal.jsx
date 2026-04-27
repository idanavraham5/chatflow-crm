import React, { useState, useEffect } from 'react';
import { getContacts, createCampaign } from '../api';

export default function CampaignModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [targetType, setTargetType] = useState('manual');
  const [targetValue, setTargetValue] = useState('');
  const [messageText, setMessageText] = useState('');
  const [buttons, setButtons] = useState([]);
  const [buttonText, setButtonText] = useState('');
  const [contacts, setContacts] = useState([]);
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (targetType === 'manual') {
      getContacts().then(setContacts).catch(() => {});
    }
  }, [targetType]);

  const addButton = () => {
    if (buttonText.trim() && buttons.length < 3) {
      setButtons([...buttons, { text: buttonText.trim() }]);
      setButtonText('');
    }
  };

  const removeButton = (idx) => {
    setButtons(buttons.filter((_, i) => i !== idx));
  };

  const toggleContact = (id) => {
    setSelectedContacts(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const handleSubmit = async () => {
    if (!name || !messageText) return;
    setLoading(true);
    try {
      await createCampaign({
        name,
        target_type: targetType,
        target_value: targetValue || null,
        message_text: messageText,
        buttons: buttons.length > 0 ? buttons : null,
        contact_ids: targetType === 'manual' ? selectedContacts : null,
      });
      onCreated();
    } catch (e) {
      alert('שגיאה ביצירת קמפיין');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content !max-w-[700px]" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-5">📢 יצירת קמפיין חדש</h3>

        <div className="grid grid-cols-2 gap-6">
          {/* Form */}
          <div className="space-y-4">
            <div>
              <label className="block text-wa-textSecondary text-xs mb-1.5">שם הקמפיין</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-wa-input text-wa-text rounded-lg px-3 py-2 text-sm outline-none"
                placeholder="מבצע קיץ 2024"
              />
            </div>

            <div>
              <label className="block text-wa-textSecondary text-xs mb-1.5">קהל יעד</label>
              <select
                value={targetType}
                onChange={(e) => setTargetType(e.target.value)}
                className="w-full bg-wa-input text-wa-text rounded-lg px-3 py-2 text-sm outline-none cursor-pointer"
              >
                <option value="manual">בחירה ידנית</option>
                <option value="category">לפי קטגוריה</option>
                <option value="status">לפי סטטוס</option>
              </select>
            </div>

            {targetType === 'category' && (
              <div>
                <select
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                  className="w-full bg-wa-input text-wa-text rounded-lg px-3 py-2 text-sm outline-none cursor-pointer"
                >
                  <option value="">בחר קטגוריה</option>
                  <option value="service">שירות</option>
                  <option value="sales">מכירות</option>
                </select>
              </div>
            )}

            {targetType === 'manual' && (
              <div className="max-h-32 overflow-y-auto bg-wa-input rounded-lg p-2 space-y-1">
                {contacts.map(c => (
                  <label key={c.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-wa-hover cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={selectedContacts.includes(c.id)}
                      onChange={() => toggleContact(c.id)}
                      className="accent-wa-light"
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            )}

            <div>
              <label className="block text-wa-textSecondary text-xs mb-1.5">טקסט ההודעה</label>
              <textarea
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                className="w-full bg-wa-input text-wa-text rounded-lg px-3 py-2 text-sm outline-none resize-none h-24"
                placeholder="הקלד את תוכן ההודעה..."
              />
            </div>

            <div>
              <label className="block text-wa-textSecondary text-xs mb-1.5">כפתורים (עד 3)</label>
              <div className="flex gap-2 mb-2">
                <input
                  value={buttonText}
                  onChange={(e) => setButtonText(e.target.value)}
                  className="flex-1 bg-wa-input text-wa-text rounded-lg px-3 py-2 text-sm outline-none"
                  placeholder="טקסט הכפתור"
                  onKeyDown={(e) => e.key === 'Enter' && addButton()}
                />
                <button
                  onClick={addButton}
                  disabled={buttons.length >= 3}
                  className="px-3 py-2 bg-wa-dark text-white rounded-lg text-sm disabled:opacity-30"
                >+</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {buttons.map((b, i) => (
                  <span key={i} className="bg-wa-input px-3 py-1 rounded-lg text-sm flex items-center gap-2">
                    {b.text}
                    <button onClick={() => removeButton(i)} className="text-red-400 text-xs">✕</button>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Preview */}
          <div>
            <label className="block text-wa-textSecondary text-xs mb-1.5">תצוגה מקדימה</label>
            <div className="bg-wa-chat rounded-xl p-4 min-h-[300px]">
              <div className="bg-wa-bubble-out rounded-lg px-4 py-3 max-w-[250px]">
                <p className="text-sm whitespace-pre-wrap">{messageText || 'הקלד הודעה...'}</p>
                {buttons.length > 0 && (
                  <div className="mt-3 space-y-1.5 border-t border-white/10 pt-2">
                    {buttons.map((b, i) => (
                      <div key={i} className="text-center py-1.5 text-sm text-wa-light border border-wa-light/30 rounded-lg">
                        {b.text}
                      </div>
                    ))}
                  </div>
                )}
                <div className="text-left text-[10px] text-wa-textSecondary mt-2">
                  {new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })} ✓✓
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleSubmit}
            disabled={loading || !name || !messageText}
            className="flex-1 bg-wa-dark hover:bg-wa-medium text-white py-2.5 rounded-lg font-medium transition disabled:opacity-30"
          >
            {loading ? 'יוצר...' : 'צור קמפיין'}
          </button>
          <button onClick={onClose} className="px-6 py-2.5 text-wa-textSecondary hover:text-wa-text">ביטול</button>
        </div>
      </div>
    </div>
  );
}
