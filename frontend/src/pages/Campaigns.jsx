import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import CampaignModal from '../components/CampaignModal';
import { getCampaigns, sendCampaign } from '../api';
import { useAuth } from '../App';

const statusLabels = { draft: 'טיוטה', sent: 'נשלח' };
const statusColors = { draft: '#F59E0B', sent: '#25D366' };
const targetLabels = { manual: 'ידני', category: 'קטגוריה', status: 'סטטוס' };

export default function Campaigns() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const isAdmin = user?.role === 'admin';

  const fetchCampaigns = async () => {
    try {
      const data = await getCampaigns();
      setCampaigns(data);
    } catch (e) {}
    setLoading(false);
  };

  useEffect(() => { fetchCampaigns(); }, []);

  const handleSend = async (id) => {
    if (!confirm('לשלוח את הקמפיין?')) return;
    try {
      await sendCampaign(id);
      fetchCampaigns();
    } catch (e) {
      alert('שגיאה בשליחת קמפיין');
    }
  };

  return (
    <div className="h-screen flex font-rubik" dir="rtl">
      <Sidebar />
      <div className="flex-1 overflow-y-auto bg-wa-bg p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">📢 קמפיינים</h1>
            <p className="text-wa-textSecondary text-sm mt-1">ניהול קמפיינים והודעות המוניות</p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setShowModal(true)}
              className="bg-wa-dark hover:bg-wa-medium text-white px-5 py-2.5 rounded-lg font-medium transition"
            >
              + קמפיין חדש
            </button>
          )}
        </div>

        {loading ? (
          <div className="text-center py-20 text-wa-textSecondary">טוען...</div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-20 text-wa-textSecondary">
            <div className="text-4xl mb-3">📢</div>
            <p>אין קמפיינים עדיין</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {campaigns.map(camp => (
              <div key={camp.id} className="bg-wa-sidebar rounded-xl p-5 border border-wa-border">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-lg">{camp.name}</h3>
                    <div className="flex items-center gap-3 mt-1 text-sm text-wa-textSecondary">
                      <span>יוצר: {camp.creator_name}</span>
                      <span>•</span>
                      <span>סוג: {targetLabels[camp.target_type]}</span>
                      {camp.target_value && <><span>•</span><span>{camp.target_value === 'service' ? 'שירות' : camp.target_value === 'sales' ? 'מכירות' : camp.target_value}</span></>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className="px-3 py-1 rounded-lg text-sm font-medium"
                      style={{ backgroundColor: `${statusColors[camp.status]}20`, color: statusColors[camp.status] }}
                    >
                      {statusLabels[camp.status]}
                    </span>
                    {camp.status === 'draft' && isAdmin && (
                      <button
                        onClick={() => handleSend(camp.id)}
                        className="bg-wa-dark hover:bg-wa-medium text-white px-4 py-1.5 rounded-lg text-sm transition"
                      >
                        שלח עכשיו
                      </button>
                    )}
                  </div>
                </div>

                <div className="bg-wa-chat rounded-lg p-3 mb-3">
                  <p className="text-sm whitespace-pre-wrap">{camp.message_text}</p>
                  {camp.buttons && camp.buttons.length > 0 && (
                    <div className="flex gap-2 mt-2">
                      {camp.buttons.map((b, i) => (
                        <span key={i} className="px-3 py-1 border border-wa-light/30 rounded-lg text-xs text-wa-light">
                          {b.text}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {camp.status === 'sent' && (
                  <div className="flex items-center gap-6 text-sm text-wa-textSecondary">
                    <span>📨 נשלח: {camp.recipients_count}</span>
                    <span>✓✓ התקבל: {camp.delivered_count}</span>
                    <span className="text-wa-light">👁 נקרא: {camp.read_count}</span>
                    {camp.sent_at && (
                      <span>🕐 {new Date(camp.sent_at).toLocaleDateString('he-IL')} {new Date(camp.sent_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {showModal && (
          <CampaignModal
            onClose={() => setShowModal(false)}
            onCreated={() => { setShowModal(false); fetchCampaigns(); }}
          />
        )}
      </div>
    </div>
  );
}
