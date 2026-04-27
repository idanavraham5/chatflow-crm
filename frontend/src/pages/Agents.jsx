import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import { getAgents, createAgent, updateAgent, resetAgentPassword, deleteAgent } from '../api';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const statusColors = { online: '#25D366', busy: '#F59E0B', away: '#EF4444' };
const statusLabels = { online: 'מחובר', busy: 'עסוק', away: 'לא זמין' };

export default function Agents() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [agents, setAgents] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', username: '', password: '', role: 'agent' });
  const [resetId, setResetId] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [editAgent, setEditAgent] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', status: '' });
  const [loading, setLoading] = useState(true);

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!isAdmin) { navigate('/chat'); return; }
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    try {
      const data = await getAgents();
      setAgents(data);
    } catch (e) {}
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!form.name || !form.username || !form.password) return;
    try {
      await createAgent(form);
      setShowCreate(false);
      setForm({ name: '', username: '', password: '', role: 'agent' });
      fetchAgents();
    } catch (e) {
      alert(e.message || 'שגיאה');
    }
  };

  const handleToggleActive = async (agent) => {
    try {
      await updateAgent(agent.id, { is_active: !agent.is_active });
      fetchAgents();
    } catch (e) {}
  };

  const handleResetPassword = async () => {
    if (!newPassword) return;
    try {
      await resetAgentPassword(resetId, newPassword);
      setResetId(null);
      setNewPassword('');
      alert('הסיסמה אופסה בהצלחה');
    } catch (e) {
      alert('שגיאה באיפוס סיסמה');
    }
  };

  const handleDeleteAgent = async (agent) => {
    if (!confirm(`למחוק את הנציג ${agent.name}? פעולה זו לא ניתנת לביטול.`)) return;
    try {
      await deleteAgent(agent.id);
      fetchAgents();
    } catch (e) {
      alert(e.message || 'שגיאה במחיקה');
    }
  };

  const openEditAgent = (agent) => {
    setEditAgent(agent);
    setEditForm({ name: agent.name, username: agent.username, status: agent.status });
  };

  const handleEditAgent = async () => {
    if (!editForm.name) return;
    try {
      await updateAgent(editAgent.id, editForm);
      setEditAgent(null);
      fetchAgents();
    } catch (e) {
      alert('שגיאה בעדכון נציג');
    }
  };

  return (
    <div className="h-screen flex font-rubik" dir="rtl">
      <Sidebar />
      <div className="flex-1 overflow-y-auto bg-wa-bg p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">👥 ניהול נציגים</h1>
            <p className="text-wa-textSecondary text-sm mt-1">הוספה, השעיה ואיפוס סיסמאות</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="bg-wa-dark hover:bg-wa-medium text-white px-5 py-2.5 rounded-lg font-medium transition"
          >
            + נציג חדש
          </button>
        </div>

        {loading ? (
          <div className="text-center py-20 text-wa-textSecondary">טוען...</div>
        ) : (
          <div className="bg-wa-sidebar rounded-xl border border-wa-border overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="text-wa-textSecondary text-sm border-b border-wa-border bg-wa-header">
                  <th className="text-right py-4 px-5">נציג</th>
                  <th className="text-center py-4 px-5">שם משתמש</th>
                  <th className="text-center py-4 px-5">תפקיד</th>
                  <th className="text-center py-4 px-5">סטטוס</th>
                  <th className="text-center py-4 px-5">פעיל</th>
                  <th className="text-center py-4 px-5">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {agents.map(agent => (
                  <tr key={agent.id} className="border-b border-wa-border/30 hover:bg-wa-hover transition">
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-wa-input flex items-center justify-center font-medium relative">
                          {agent.name.charAt(0)}
                          <div
                            className="absolute -bottom-0.5 -left-0.5 w-3 h-3 rounded-full border-2 border-wa-sidebar"
                            style={{ backgroundColor: statusColors[agent.status] }}
                          />
                        </div>
                        <span className="font-medium">{agent.name}</span>
                      </div>
                    </td>
                    <td className="text-center py-4 px-5 text-wa-textSecondary">{agent.username}</td>
                    <td className="text-center py-4 px-5">
                      <span className={`px-3 py-1 rounded-lg text-xs font-medium
                        ${agent.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {agent.role === 'admin' ? 'מנהל' : 'נציג'}
                      </span>
                    </td>
                    <td className="text-center py-4 px-5">
                      <span className="inline-flex items-center gap-1.5 text-sm">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: statusColors[agent.status] }} />
                        {statusLabels[agent.status]}
                      </span>
                    </td>
                    <td className="text-center py-4 px-5">
                      <button
                        onClick={() => handleToggleActive(agent)}
                        className={`w-10 h-6 rounded-full transition relative
                          ${agent.is_active ? 'bg-wa-light' : 'bg-gray-600'}`}
                      >
                        <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all
                          ${agent.is_active ? 'right-1' : 'left-1'}`} />
                      </button>
                    </td>
                    <td className="text-center py-4 px-5">
                      <div className="flex items-center justify-center gap-3">
                        <button
                          onClick={() => openEditAgent(agent)}
                          className="text-wa-textSecondary hover:text-wa-light text-sm"
                        >
                          ✏️ עריכה
                        </button>
                        <button
                          onClick={() => { setResetId(agent.id); setNewPassword(''); }}
                          className="text-wa-textSecondary hover:text-wa-light text-sm"
                        >
                          🔑 איפוס סיסמה
                        </button>
                        {agent.role !== 'admin' && (
                          <button
                            onClick={() => handleDeleteAgent(agent)}
                            className="text-wa-textSecondary hover:text-red-500 text-sm"
                          >
                            🗑️ מחיקה
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Create modal */}
        {showCreate && (
          <div className="modal-overlay" onClick={() => setShowCreate(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-semibold mb-5">👤 הוספת נציג חדש</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-wa-textSecondary text-xs mb-1.5">שם מלא</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full bg-wa-input text-wa-text rounded-lg px-3 py-2 text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="block text-wa-textSecondary text-xs mb-1.5">שם משתמש</label>
                  <input
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    className="w-full bg-wa-input text-wa-text rounded-lg px-3 py-2 text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="block text-wa-textSecondary text-xs mb-1.5">סיסמה</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full bg-wa-input text-wa-text rounded-lg px-3 py-2 text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="block text-wa-textSecondary text-xs mb-1.5">תפקיד</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="w-full bg-wa-input text-wa-text rounded-lg px-3 py-2 text-sm outline-none cursor-pointer"
                  >
                    <option value="agent">נציג</option>
                    <option value="admin">מנהל</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleCreate}
                  disabled={!form.name || !form.username || !form.password}
                  className="flex-1 bg-wa-dark hover:bg-wa-medium text-white py-2.5 rounded-lg font-medium transition disabled:opacity-30"
                >
                  צור נציג
                </button>
                <button onClick={() => setShowCreate(false)} className="px-6 py-2.5 text-wa-textSecondary">ביטול</button>
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
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-wa-input text-wa-text rounded-lg px-3 py-2 text-sm outline-none"
                  autoFocus
                />
              </div>
              <div className="flex gap-3 mt-5">
                <button
                  onClick={handleResetPassword}
                  disabled={!newPassword}
                  className="flex-1 bg-wa-dark hover:bg-wa-medium text-white py-2.5 rounded-lg font-medium transition disabled:opacity-30"
                >
                  אפס סיסמה
                </button>
                <button onClick={() => setResetId(null)} className="px-6 py-2.5 text-wa-textSecondary">ביטול</button>
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
                  <input
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full bg-wa-input text-wa-text rounded-lg px-3 py-2 text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="block text-wa-textSecondary text-xs mb-1.5">שם משתמש</label>
                  <input
                    value={editForm.username}
                    onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                    className="w-full bg-wa-input text-wa-text rounded-lg px-3 py-2 text-sm outline-none"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-wa-textSecondary text-xs mb-1.5">סטטוס</label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                    className="w-full bg-wa-input text-wa-text rounded-lg px-3 py-2 text-sm outline-none cursor-pointer"
                  >
                    <option value="online">מחובר</option>
                    <option value="busy">עסוק</option>
                    <option value="away">לא זמין</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleEditAgent}
                  disabled={!editForm.name}
                  className="flex-1 bg-wa-dark hover:bg-wa-medium text-white py-2.5 rounded-lg font-medium transition disabled:opacity-30"
                >
                  שמור שינויים
                </button>
                <button onClick={() => setEditAgent(null)} className="px-6 py-2.5 text-wa-textSecondary">ביטול</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
