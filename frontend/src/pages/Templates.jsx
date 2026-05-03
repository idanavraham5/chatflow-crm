import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import { getTemplates, createTemplate, updateTemplate, deleteTemplate } from '../api';
import { useAuth } from '../context/AuthContext';

export default function Templates() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ title: '', content: '' });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const isAdmin = user?.role === 'admin';

  const fetchTemplates = async () => {
    try {
      const data = await getTemplates();
      setTemplates(data);
    } catch (e) {}
    setLoading(false);
  };

  useEffect(() => { fetchTemplates(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ title: '', content: '' });
    setShowForm(true);
  };

  const openEdit = (t) => {
    setEditing(t);
    setForm({ title: t.title, content: t.content });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await updateTemplate(editing.id, form);
      } else {
        await createTemplate(form);
      }
      setShowForm(false);
      setEditing(null);
      setForm({ title: '', content: '' });
      fetchTemplates();
    } catch (e) {
      alert('שגיאה בשמירת טמפלייט');
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm('למחוק את הטמפלייט?')) return;
    try {
      await deleteTemplate(id);
      fetchTemplates();
    } catch (e) {}
  };

  const filtered = templates.filter(t =>
    t.title.includes(search) || t.content.includes(search)
  );

  return (
    <div className="h-screen flex flex-col md:flex-row font-rubik" dir="rtl">
      <div className="hidden md:block"><Sidebar /></div>
      <div className="flex-1 overflow-y-auto bg-wa-bg p-4 md:p-6 pb-20 md:pb-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 md:mb-6 gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold">⚡ טמפלייטים</h1>
            <p className="text-wa-textSecondary text-xs md:text-sm mt-1">ניהול תבניות הודעות מוכנות לשליחה</p>
          </div>
          {isAdmin && (
            <button
              onClick={openNew}
              className="bg-wa-dark hover:bg-wa-medium text-white px-5 py-2.5 rounded-lg font-medium transition"
            >
              + טמפלייט חדש
            </button>
          )}
        </div>

        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש טמפלייט..."
            className="w-full max-w-md bg-wa-sidebar text-wa-text rounded-lg px-4 py-2.5 outline-none border border-wa-border focus:ring-2 focus:ring-wa-medium transition text-sm"
          />
        </div>

        {/* Templates grid */}
        {loading ? (
          <div className="text-center py-20 text-wa-textSecondary">טוען...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-wa-textSecondary">
            <div className="text-4xl mb-3">📝</div>
            <p>{templates.length === 0 ? 'אין טמפלייטים עדיין' : 'לא נמצאו תוצאות'}</p>
            {isAdmin && templates.length === 0 && (
              <button onClick={openNew} className="mt-4 text-wa-light hover:underline text-sm">
                + הוסף טמפלייט ראשון
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(t => (
              <div key={t.id} className="bg-wa-sidebar rounded-xl border border-wa-border overflow-hidden group hover:border-wa-medium/50 transition">
                {/* Card header */}
                <div className="px-5 py-4 border-b border-wa-border/50 flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-lg">⚡</span>
                    <h3 className="font-semibold text-wa-text truncate">{t.title}</h3>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                      <button
                        onClick={() => openEdit(t)}
                        className="w-8 h-8 rounded-lg hover:bg-wa-hover flex items-center justify-center text-wa-textSecondary text-sm"
                        title="ערוך"
                      >✏️</button>
                      <button
                        onClick={() => handleDelete(t.id)}
                        className="w-8 h-8 rounded-lg hover:bg-red-50 flex items-center justify-center text-red-400 text-sm"
                        title="מחק"
                      >🗑️</button>
                    </div>
                  )}
                </div>
                {/* Card body */}
                <div className="px-5 py-4">
                  <p className="text-sm text-wa-textSecondary whitespace-pre-wrap leading-relaxed line-clamp-4">
                    {t.content}
                  </p>
                </div>
                {/* Card footer */}
                <div className="px-5 py-3 bg-wa-chat/30 text-xs text-wa-textSecondary">
                  נוצר {new Date(t.created_at).toLocaleDateString('he-IL')}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add/Edit Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
            <div className="bg-wa-sidebar rounded-2xl w-full max-w-[520px] mx-4 max-h-[80vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-4 border-b border-wa-border">
                <h2 className="font-bold text-lg">{editing ? '✏️ עריכת טמפלייט' : '⚡ טמפלייט חדש'}</h2>
                <button onClick={() => setShowForm(false)} className="text-wa-textSecondary hover:text-wa-text text-lg">✕</button>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm text-wa-textSecondary mb-1.5">שם הטמפלייט</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="למשל: ברכת פתיחה, הצעת מחיר..."
                    className="w-full bg-wa-input text-wa-text rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-wa-medium transition text-sm"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm text-wa-textSecondary mb-1.5">תוכן ההודעה</label>
                  <textarea
                    value={form.content}
                    onChange={(e) => setForm({ ...form, content: e.target.value })}
                    placeholder="כתוב את תוכן ההודעה כאן...&#10;&#10;אפשר להשתמש ב-{שם} כמציין מיקום"
                    className="w-full bg-wa-input text-wa-text rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-wa-medium transition text-sm resize-none"
                    rows={6}
                  />
                  <p className="text-xs text-wa-textSecondary mt-1">טיפ: השתמש ב-{'{שם}'} כדי להכניס את שם הלקוח אוטומטית</p>
                </div>

                {/* Preview */}
                {form.content.trim() && (
                  <div>
                    <label className="block text-sm text-wa-textSecondary mb-1.5">תצוגה מקדימה</label>
                    <div className="bg-wa-chat rounded-xl p-4">
                      <div className="bg-[#005C4B] text-white rounded-xl rounded-tl-sm px-4 py-2.5 text-sm max-w-[85%] mr-auto whitespace-pre-wrap">
                        {form.content}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-wa-border">
                <button
                  onClick={() => setShowForm(false)}
                  className="px-5 py-2.5 rounded-lg text-wa-textSecondary hover:bg-wa-hover transition text-sm"
                >
                  ביטול
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !form.title.trim() || !form.content.trim()}
                  className="bg-wa-dark hover:bg-wa-medium text-white px-6 py-2.5 rounded-lg font-medium transition disabled:opacity-50 text-sm"
                >
                  {saving ? 'שומר...' : editing ? 'שמור שינויים' : 'צור טמפלייט'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="md:hidden"><Sidebar isMobile={true} /></div>
    </div>
  );
}
