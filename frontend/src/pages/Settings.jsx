import React, { useState, useEffect, useRef } from 'react';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../App';
import { useNavigate } from 'react-router-dom';
import {
  getTemplates, createTemplate, updateTemplate, deleteTemplate,
  getAgents, createAgent, updateAgent, resetAgentPassword,
  getLabels, createLabel, updateLabel, deleteLabel,
  getWhatsAppNumbers
} from '../api';

const statusColors = { online: '#25D366', busy: '#F59E0B', away: '#EF4444' };
const statusLabels = { online: 'מחובר', busy: 'עסוק', away: 'לא זמין' };
const labelColors = ['#378ADD', '#25D366', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

const sections = [
  { id: 'general', label: 'כללי', icon: '⚙️' },
  { id: 'templates', label: 'טמפלייטים', icon: '⚡' },
  { id: 'agents', label: 'נציגים', icon: '👥' },
  { id: 'labels', label: 'תוויות', icon: '🏷️' },
];

export default function Settings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';

  // Refs for scrolling
  const sectionRefs = useRef({});
  const [activeSection, setActiveSection] = useState('general');

  // ── Templates state ──
  const [templates, setTemplates] = useState([]);
  const [tplForm, setTplForm] = useState({ title: '', content: '' });
  const [tplEditing, setTplEditing] = useState(null);
  const [showTplForm, setShowTplForm] = useState(false);
  const [tplSearch, setTplSearch] = useState('');

  // ── Agents state ──
  const [agents, setAgents] = useState([]);
  const [agentForm, setAgentForm] = useState({ name: '', username: '', password: '', role: 'agent' });
  const [showAgentForm, setShowAgentForm] = useState(false);
  const [editAgent, setEditAgent] = useState(null);
  const [editAgentForm, setEditAgentForm] = useState({ name: '', status: '' });
  const [resetId, setResetId] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  // ── Labels state ──
  const [labels, setLabels] = useState([]);
  const [labelForm, setLabelForm] = useState({ name: '', color: '#378ADD' });
  const [editingLabel, setEditingLabel] = useState(null);

  // ── General settings state ──
  const [generalForm, setGeneralForm] = useState({
    businessName: 'יש לי זכות',
    businessHours: 'א׳-ה׳ 9:00-18:00, ו׳ 9:00-13:00',
    autoReplyOutside: 'שלום, תודה על הפנייה. כרגע אנחנו מחוץ לשעות הפעילות. נחזור אליך ביום העסקים הבא.',
    autoReplyEnabled: true,
  });
  const [generalSaved, setGeneralSaved] = useState(false);

  // ── WhatsApp state ──
  const [waStatus, setWaStatus] = useState({ connected: false, numbers: [] });

  // ── Loading ──
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin) { navigate('/chat'); return; }
    Promise.all([
      getTemplates().then(setTemplates).catch(() => {}),
      getAgents().then(setAgents).catch(() => {}),
      getLabels().then(setLabels).catch(() => {}),
      getWhatsAppNumbers().then(setWaStatus).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  // Scroll to section
  const scrollTo = (id) => {
    setActiveSection(id);
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ── Template handlers ──
  const fetchTemplates = async () => { try { setTemplates(await getTemplates()); } catch {} };
  const openNewTpl = () => { setTplEditing(null); setTplForm({ title: '', content: '' }); setShowTplForm(true); };
  const openEditTpl = (t) => { setTplEditing(t); setTplForm({ title: t.title, content: t.content }); setShowTplForm(true); };
  const handleSaveTpl = async () => {
    if (!tplForm.title.trim() || !tplForm.content.trim()) return;
    try {
      if (tplEditing) await updateTemplate(tplEditing.id, tplForm);
      else await createTemplate(tplForm);
      setShowTplForm(false);
      fetchTemplates();
    } catch { alert('שגיאה בשמירת טמפלייט'); }
  };
  const handleDeleteTpl = async (id) => {
    if (!confirm('למחוק את הטמפלייט?')) return;
    try { await deleteTemplate(id); fetchTemplates(); } catch {}
  };
  const filteredTpls = templates.filter(t => t.title.includes(tplSearch) || t.content.includes(tplSearch));

  // ── Agent handlers ──
  const fetchAgents = async () => { try { setAgents(await getAgents()); } catch {} };
  const handleCreateAgent = async () => {
    if (!agentForm.name || !agentForm.username || !agentForm.password) return;
    try { await createAgent(agentForm); setShowAgentForm(false); setAgentForm({ name: '', username: '', password: '', role: 'agent' }); fetchAgents(); }
    catch (e) { alert(e.message || 'שגיאה'); }
  };
  const handleToggleActive = async (agent) => {
    try { await updateAgent(agent.id, { is_active: !agent.is_active }); fetchAgents(); } catch {}
  };
  const handleResetPassword = async () => {
    if (!newPassword) return;
    try { await resetAgentPassword(resetId, newPassword); setResetId(null); setNewPassword(''); alert('הסיסמה אופסה בהצלחה'); }
    catch { alert('שגיאה באיפוס סיסמה'); }
  };
  const openEditAgentModal = (a) => { setEditAgent(a); setEditAgentForm({ name: a.name, status: a.status }); };
  const handleEditAgentSave = async () => {
    if (!editAgentForm.name) return;
    try { await updateAgent(editAgent.id, editAgentForm); setEditAgent(null); fetchAgents(); }
    catch { alert('שגיאה בעדכון נציג'); }
  };

  // ── Label handlers ──
  const fetchLabels = async () => { try { setLabels(await getLabels()); } catch {} };
  const handleCreateLabel = async () => {
    if (!labelForm.name.trim()) return;
    try { await createLabel(labelForm); setLabelForm({ name: '', color: '#378ADD' }); fetchLabels(); }
    catch (e) { alert(e.message || 'שגיאה'); }
  };
  const handleDeleteLabel = async (id) => {
    if (!confirm('למחוק את התווית?')) return;
    try { await deleteLabel(id); fetchLabels(); } catch {}
  };
  const handleUpdateLabel = async (id, data) => {
    try { await updateLabel(id, data); fetchLabels(); setEditingLabel(null); } catch {}
  };

  // ── General handlers ──
  const handleSaveGeneral = () => {
    // In production this would be an API call
    setGeneralSaved(true);
    setTimeout(() => setGeneralSaved(false), 2000);
  };

  if (loading) {
    return (
      <div className="h-screen flex font-rubik" dir="rtl">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center bg-wa-bg">
          <div className="text-wa-textSecondary text-lg">טוען הגדרות...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex font-rubik" dir="rtl">
      <Sidebar />

      {/* Side navigation */}
      <div className="w-[200px] bg-wa-sidebar border-l border-wa-border flex flex-col py-6 shrink-0">
        <h2 className="text-lg font-bold px-5 mb-5">הגדרות</h2>
        <nav className="flex flex-col gap-1 px-3">
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => scrollTo(s.id)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition text-right
                ${activeSection === s.id
                  ? 'bg-wa-dark text-white'
                  : 'text-wa-textSecondary hover:bg-wa-hover hover:text-wa-text'
                }`}
            >
              <span>{s.icon}</span>
              <span>{s.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Main content — scrollable */}
      <div className="flex-1 overflow-y-auto bg-wa-bg p-8">
        <div className="max-w-4xl mx-auto space-y-10">

          {/* ═══════════════════ GENERAL ═══════════════════ */}
          <section ref={el => sectionRefs.current.general = el}>
            <div className="flex items-center gap-3 mb-5">
              <span className="text-2xl">⚙️</span>
              <div>
                <h2 className="text-xl font-bold">הגדרות כלליות</h2>
                <p className="text-wa-textSecondary text-sm">שם העסק, שעות פעילות והודעות אוטומטיות</p>
              </div>
            </div>

            <div className="bg-wa-sidebar rounded-xl border border-wa-border p-6 space-y-5">
              <div>
                <label className="block text-sm text-wa-textSecondary mb-1.5">שם העסק</label>
                <input
                  value={generalForm.businessName}
                  onChange={e => setGeneralForm({ ...generalForm, businessName: e.target.value })}
                  className="w-full max-w-md bg-wa-input text-wa-text rounded-lg px-4 py-2.5 outline-none text-sm"
                />
              </div>

              <div>
                <label className="block text-sm text-wa-textSecondary mb-1.5">שעות פעילות</label>
                <input
                  value={generalForm.businessHours}
                  onChange={e => setGeneralForm({ ...generalForm, businessHours: e.target.value })}
                  className="w-full max-w-md bg-wa-input text-wa-text rounded-lg px-4 py-2.5 outline-none text-sm"
                />
              </div>

              <div className="border-t border-wa-border/50 pt-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <label className="block text-sm font-medium">הודעה אוטומטית מחוץ לשעות פעילות</label>
                    <p className="text-xs text-wa-textSecondary mt-0.5">נשלחת אוטומטית כאשר לקוח פונה מחוץ לשעות</p>
                  </div>
                  <button
                    onClick={() => setGeneralForm({ ...generalForm, autoReplyEnabled: !generalForm.autoReplyEnabled })}
                    className={`w-11 h-6 rounded-full transition relative ${generalForm.autoReplyEnabled ? 'bg-wa-light' : 'bg-gray-600'}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${generalForm.autoReplyEnabled ? 'right-1' : 'left-1'}`} />
                  </button>
                </div>
                {generalForm.autoReplyEnabled && (
                  <textarea
                    value={generalForm.autoReplyOutside}
                    onChange={e => setGeneralForm({ ...generalForm, autoReplyOutside: e.target.value })}
                    className="w-full bg-wa-input text-wa-text rounded-lg px-4 py-3 outline-none text-sm resize-none"
                    rows={3}
                  />
                )}
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleSaveGeneral}
                  className="bg-wa-dark hover:bg-wa-medium text-white px-6 py-2.5 rounded-lg text-sm font-medium transition"
                >
                  שמור שינויים
                </button>
                {generalSaved && <span className="text-green-500 text-sm">נשמר בהצלחה ✓</span>}
              </div>
            </div>

            {/* WhatsApp Connection Status */}
            <div className="bg-wa-sidebar rounded-xl border border-wa-border p-6 mt-5">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-xl">📱</span>
                <div>
                  <h3 className="text-base font-bold">חיבור WhatsApp Cloud API</h3>
                  <p className="text-wa-textSecondary text-xs">סטטוס חיבור מספרי WhatsApp Business</p>
                </div>
                <div className={`mr-auto px-3 py-1 rounded-full text-xs font-medium ${waStatus.connected ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                  {waStatus.connected ? 'מחובר' : 'לא מחובר (מצב דמו)'}
                </div>
              </div>

              {waStatus.numbers.length > 0 ? (
                <div className="space-y-2">
                  {waStatus.numbers.map((num, i) => (
                    <div key={i} className="flex items-center gap-3 bg-wa-input rounded-lg px-4 py-3">
                      <span className="text-green-400">✓</span>
                      <div>
                        <div className="text-sm font-medium">{num.name}</div>
                        <div className="text-xs text-wa-textSecondary">ID: {num.phone_number_id}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-wa-textSecondary bg-wa-input rounded-lg px-4 py-3">
                  לא הוגדרו מספרי WhatsApp. הגדר את משתני הסביבה WHATSAPP_TOKEN ו-WHATSAPP_PHONE_IDS בקובץ .env
                </div>
              )}
            </div>
          </section>

          {/* ═══════════════════ TEMPLATES ═══════════════════ */}
          <section ref={el => sectionRefs.current.templates = el}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <span className="text-2xl">⚡</span>
                <div>
                  <h2 className="text-xl font-bold">טמפלייטים</h2>
                  <p className="text-wa-textSecondary text-sm">תבניות הודעות מוכנות לשליחה מהירה</p>
                </div>
              </div>
              <button onClick={openNewTpl} className="bg-wa-dark hover:bg-wa-medium text-white px-4 py-2 rounded-lg text-sm font-medium transition">
                + טמפלייט חדש
              </button>
            </div>

            {/* Search */}
            <div className="mb-4">
              <input
                value={tplSearch}
                onChange={e => setTplSearch(e.target.value)}
                placeholder="חיפוש טמפלייט..."
                className="w-full max-w-sm bg-wa-sidebar text-wa-text rounded-lg px-4 py-2.5 outline-none border border-wa-border text-sm"
              />
            </div>

            {/* Templates grid */}
            {filteredTpls.length === 0 ? (
              <div className="text-center py-12 text-wa-textSecondary bg-wa-sidebar rounded-xl border border-wa-border">
                <div className="text-3xl mb-2">📝</div>
                <p className="text-sm">{templates.length === 0 ? 'אין טמפלייטים עדיין' : 'לא נמצאו תוצאות'}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredTpls.map(t => (
                  <div key={t.id} className="bg-wa-sidebar rounded-xl border border-wa-border overflow-hidden group hover:border-wa-medium/50 transition">
                    <div className="px-4 py-3 border-b border-wa-border/50 flex items-center justify-between">
                      <h3 className="font-semibold text-sm truncate">⚡ {t.title}</h3>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                        <button onClick={() => openEditTpl(t)} className="w-7 h-7 rounded hover:bg-wa-hover flex items-center justify-center text-xs" title="ערוך">✏️</button>
                        <button onClick={() => handleDeleteTpl(t.id)} className="w-7 h-7 rounded hover:bg-red-50 flex items-center justify-center text-xs text-red-400" title="מחק">🗑️</button>
                      </div>
                    </div>
                    <div className="px-4 py-3">
                      <p className="text-xs text-wa-textSecondary whitespace-pre-wrap leading-relaxed line-clamp-3">{t.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ═══════════════════ AGENTS ═══════════════════ */}
          <section ref={el => sectionRefs.current.agents = el}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <span className="text-2xl">👥</span>
                <div>
                  <h2 className="text-xl font-bold">נציגים</h2>
                  <p className="text-wa-textSecondary text-sm">הוספה, עריכה, השעיה ואיפוס סיסמאות</p>
                </div>
              </div>
              <button onClick={() => setShowAgentForm(true)} className="bg-wa-dark hover:bg-wa-medium text-white px-4 py-2 rounded-lg text-sm font-medium transition">
                + נציג חדש
              </button>
            </div>

            <div className="bg-wa-sidebar rounded-xl border border-wa-border overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="text-wa-textSecondary text-xs border-b border-wa-border bg-wa-header">
                    <th className="text-right py-3 px-4">נציג</th>
                    <th className="text-center py-3 px-4">שם משתמש</th>
                    <th className="text-center py-3 px-4">תפקיד</th>
                    <th className="text-center py-3 px-4">סטטוס</th>
                    <th className="text-center py-3 px-4">פעיל</th>
                    <th className="text-center py-3 px-4">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map(agent => (
                    <tr key={agent.id} className="border-b border-wa-border/30 hover:bg-wa-hover transition">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-full bg-wa-input flex items-center justify-center text-sm font-medium relative">
                            {agent.name.charAt(0)}
                            <div className="absolute -bottom-0.5 -left-0.5 w-2.5 h-2.5 rounded-full border-2 border-wa-sidebar" style={{ backgroundColor: statusColors[agent.status] }} />
                          </div>
                          <span className="font-medium text-sm">{agent.name}</span>
                        </div>
                      </td>
                      <td className="text-center py-3 px-4 text-wa-textSecondary text-sm">{agent.username}</td>
                      <td className="text-center py-3 px-4">
                        <span className={`px-2.5 py-0.5 rounded-lg text-xs font-medium ${agent.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {agent.role === 'admin' ? 'מנהל' : 'נציג'}
                        </span>
                      </td>
                      <td className="text-center py-3 px-4">
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColors[agent.status] }} />
                          {statusLabels[agent.status]}
                        </span>
                      </td>
                      <td className="text-center py-3 px-4">
                        <button
                          onClick={() => handleToggleActive(agent)}
                          className={`w-10 h-6 rounded-full transition relative ${agent.is_active ? 'bg-wa-light' : 'bg-gray-600'}`}
                        >
                          <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${agent.is_active ? 'right-1' : 'left-1'}`} />
                        </button>
                      </td>
                      <td className="text-center py-3 px-4">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => openEditAgentModal(agent)} className="text-wa-textSecondary hover:text-wa-light text-xs">✏️</button>
                          <button onClick={() => { setResetId(agent.id); setNewPassword(''); }} className="text-wa-textSecondary hover:text-wa-light text-xs">🔑</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ═══════════════════ LABELS ═══════════════════ */}
          <section ref={el => sectionRefs.current.labels = el}>
            <div className="flex items-center gap-3 mb-5">
              <span className="text-2xl">🏷️</span>
              <div>
                <h2 className="text-xl font-bold">תוויות</h2>
                <p className="text-wa-textSecondary text-sm">ניהול תוויות צבעוניות לסיווג שיחות</p>
              </div>
            </div>

            <div className="bg-wa-sidebar rounded-xl border border-wa-border p-6">
              {/* Existing labels */}
              <div className="flex flex-wrap gap-2 mb-6">
                {labels.map(l => (
                  <div
                    key={l.id}
                    className="flex items-center gap-2 bg-wa-input rounded-lg px-3 py-2 group"
                  >
                    <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                    {editingLabel === l.id ? (
                      <input
                        autoFocus
                        defaultValue={l.name}
                        className="bg-transparent outline-none text-sm w-24"
                        onBlur={e => handleUpdateLabel(l.id, { name: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') handleUpdateLabel(l.id, { name: e.target.value }); }}
                      />
                    ) : (
                      <span className="text-sm">{l.name}</span>
                    )}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button onClick={() => setEditingLabel(l.id)} className="text-xs text-wa-textSecondary hover:text-wa-text">✏️</button>
                      <button onClick={() => handleDeleteLabel(l.id)} className="text-xs text-red-400 hover:text-red-600">✕</button>
                    </div>
                  </div>
                ))}
                {labels.length === 0 && <p className="text-sm text-wa-textSecondary">אין תוויות עדיין</p>}
              </div>

              {/* Create new label */}
              <div className="border-t border-wa-border/50 pt-5">
                <h4 className="text-sm font-medium mb-3">תווית חדשה</h4>
                <div className="flex items-center gap-3">
                  <input
                    value={labelForm.name}
                    onChange={e => setLabelForm({ ...labelForm, name: e.target.value })}
                    placeholder="שם התווית..."
                    className="bg-wa-input text-wa-text rounded-lg px-3 py-2 text-sm outline-none w-48"
                    onKeyDown={e => { if (e.key === 'Enter') handleCreateLabel(); }}
                  />
                  <div className="flex gap-1.5">
                    {labelColors.map(c => (
                      <button
                        key={c}
                        onClick={() => setLabelForm({ ...labelForm, color: c })}
                        className="w-6 h-6 rounded-full transition"
                        style={{
                          backgroundColor: c,
                          outline: labelForm.color === c ? '2px solid var(--tw-color-wa-text, #E9EDEF)' : 'none',
                          outlineOffset: '2px'
                        }}
                      />
                    ))}
                  </div>
                  <button
                    onClick={handleCreateLabel}
                    disabled={!labelForm.name.trim()}
                    className="bg-wa-dark hover:bg-wa-medium text-white px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-30"
                  >
                    + הוסף
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Bottom spacer */}
          <div className="h-20" />
        </div>
      </div>

      {/* ═══════════════════ MODALS ═══════════════════ */}

      {/* Template form modal */}
      {showTplForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowTplForm(false)}>
          <div className="bg-wa-sidebar rounded-2xl w-[520px] max-h-[80vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-wa-border">
              <h2 className="font-bold text-lg">{tplEditing ? '✏️ עריכת טמפלייט' : '⚡ טמפלייט חדש'}</h2>
              <button onClick={() => setShowTplForm(false)} className="text-wa-textSecondary hover:text-wa-text text-lg">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm text-wa-textSecondary mb-1.5">שם הטמפלייט</label>
                <input
                  value={tplForm.title}
                  onChange={e => setTplForm({ ...tplForm, title: e.target.value })}
                  placeholder="למשל: ברכת פתיחה, הצעת מחיר..."
                  className="w-full bg-wa-input text-wa-text rounded-lg px-4 py-2.5 outline-none text-sm"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm text-wa-textSecondary mb-1.5">תוכן ההודעה</label>
                <textarea
                  value={tplForm.content}
                  onChange={e => setTplForm({ ...tplForm, content: e.target.value })}
                  placeholder="כתוב את תוכן ההודעה כאן..."
                  className="w-full bg-wa-input text-wa-text rounded-lg px-4 py-3 outline-none text-sm resize-none"
                  rows={5}
                />
                <p className="text-xs text-wa-textSecondary mt-1">טיפ: השתמש ב-{'{שם}'} כדי להכניס את שם הלקוח</p>
              </div>
              {tplForm.content.trim() && (
                <div>
                  <label className="block text-sm text-wa-textSecondary mb-1.5">תצוגה מקדימה</label>
                  <div className="bg-wa-chat rounded-xl p-4">
                    <div className="bg-[#005C4B] text-white rounded-xl rounded-tl-sm px-4 py-2.5 text-sm max-w-[85%] mr-auto whitespace-pre-wrap">{tplForm.content}</div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-wa-border">
              <button onClick={() => setShowTplForm(false)} className="px-5 py-2.5 rounded-lg text-wa-textSecondary hover:bg-wa-hover text-sm">ביטול</button>
              <button
                onClick={handleSaveTpl}
                disabled={!tplForm.title.trim() || !tplForm.content.trim()}
                className="bg-wa-dark hover:bg-wa-medium text-white px-6 py-2.5 rounded-lg font-medium transition disabled:opacity-50 text-sm"
              >
                {tplEditing ? 'שמור שינויים' : 'צור טמפלייט'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create agent modal */}
      {showAgentForm && (
        <div className="modal-overlay" onClick={() => setShowAgentForm(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-5">👤 הוספת נציג חדש</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-wa-textSecondary text-xs mb-1.5">שם מלא</label>
                <input value={agentForm.name} onChange={e => setAgentForm({ ...agentForm, name: e.target.value })} className="w-full bg-wa-input text-wa-text rounded-lg px-3 py-2 text-sm outline-none" />
              </div>
              <div>
                <label className="block text-wa-textSecondary text-xs mb-1.5">שם משתמש</label>
                <input value={agentForm.username} onChange={e => setAgentForm({ ...agentForm, username: e.target.value })} className="w-full bg-wa-input text-wa-text rounded-lg px-3 py-2 text-sm outline-none" />
              </div>
              <div>
                <label className="block text-wa-textSecondary text-xs mb-1.5">סיסמה</label>
                <input type="password" value={agentForm.password} onChange={e => setAgentForm({ ...agentForm, password: e.target.value })} className="w-full bg-wa-input text-wa-text rounded-lg px-3 py-2 text-sm outline-none" />
              </div>
              <div>
                <label className="block text-wa-textSecondary text-xs mb-1.5">תפקיד</label>
                <select value={agentForm.role} onChange={e => setAgentForm({ ...agentForm, role: e.target.value })} className="w-full bg-wa-input text-wa-text rounded-lg px-3 py-2 text-sm outline-none cursor-pointer">
                  <option value="agent">נציג</option>
                  <option value="admin">מנהל</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleCreateAgent} disabled={!agentForm.name || !agentForm.username || !agentForm.password} className="flex-1 bg-wa-dark hover:bg-wa-medium text-white py-2.5 rounded-lg font-medium transition disabled:opacity-30">צור נציג</button>
              <button onClick={() => setShowAgentForm(false)} className="px-6 py-2.5 text-wa-textSecondary">ביטול</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit agent modal */}
      {editAgent && (
        <div className="modal-overlay" onClick={() => setEditAgent(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-5">✏️ עריכת נציג — {editAgent.name}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-wa-textSecondary text-xs mb-1.5">שם מלא</label>
                <input value={editAgentForm.name} onChange={e => setEditAgentForm({ ...editAgentForm, name: e.target.value })} className="w-full bg-wa-input text-wa-text rounded-lg px-3 py-2 text-sm outline-none" />
              </div>
              <div>
                <label className="block text-wa-textSecondary text-xs mb-1.5">סטטוס</label>
                <select value={editAgentForm.status} onChange={e => setEditAgentForm({ ...editAgentForm, status: e.target.value })} className="w-full bg-wa-input text-wa-text rounded-lg px-3 py-2 text-sm outline-none cursor-pointer">
                  <option value="online">מחובר</option>
                  <option value="busy">עסוק</option>
                  <option value="away">לא זמין</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleEditAgentSave} disabled={!editAgentForm.name} className="flex-1 bg-wa-dark hover:bg-wa-medium text-white py-2.5 rounded-lg font-medium transition disabled:opacity-30">שמור שינויים</button>
              <button onClick={() => setEditAgent(null)} className="px-6 py-2.5 text-wa-textSecondary">ביטול</button>
            </div>
          </div>
        </div>
      )}

      {/* Reset password modal */}
      {resetId && (
        <div className="modal-overlay" onClick={() => setResetId(null)}>
          <div className="modal-content !min-w-[350px]" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">🔑 איפוס סיסמה</h3>
            <div>
              <label className="block text-wa-textSecondary text-xs mb-1.5">סיסמה חדשה</label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full bg-wa-input text-wa-text rounded-lg px-3 py-2 text-sm outline-none" autoFocus />
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={handleResetPassword} disabled={!newPassword} className="flex-1 bg-wa-dark hover:bg-wa-medium text-white py-2.5 rounded-lg font-medium transition disabled:opacity-30">אפס סיסמה</button>
              <button onClick={() => setResetId(null)} className="px-6 py-2.5 text-wa-textSecondary">ביטול</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
