import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from 'recharts';
import Sidebar from '../components/Sidebar';
import { getDashboard } from '../api';
import { useAuth } from '../context/AuthContext';

const COLORS = ['#25D366', '#128C7E', '#075E54', '#F59E0B', '#3B82F6'];
const statusColors = { online: '#25D366', busy: '#F59E0B', away: '#EF4444' };
const statusLabels = { online: 'מחובר', busy: 'עסוק', away: 'לא זמין' };

const StatCard = ({ icon, label, value, color, sub }) => (
  <div className="bg-wa-sidebar rounded-xl p-5 border border-wa-border">
    <div className="flex items-center justify-between mb-2">
      <span className="text-2xl">{icon}</span>
      <span className="text-3xl font-bold" style={{ color }}>{value}</span>
    </div>
    <p className="text-wa-textSecondary text-sm">{label}</p>
    {sub && <p className="text-xs mt-1" style={{ color: sub.color || '#667781' }}>{sub.text}</p>}
  </div>
);

const ChartCard = ({ title, children, className = '' }) => (
  <div className={`bg-wa-sidebar rounded-xl p-5 border border-wa-border ${className}`}>
    <h3 className="font-semibold mb-4">{title}</h3>
    {children}
  </div>
);

const tooltipStyle = { background: '#FFFFFF', border: '1px solid #E9EDEF', borderRadius: 8, direction: 'rtl' };
const tickStyle = { fill: '#667781', fontSize: 11 };

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.role !== 'admin') { navigate('/chat'); return; }
  }, []);

  useEffect(() => {
    setLoading(true);
    getDashboard(days)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [days]);

  const pieData = data ? [
    { name: 'שירות', value: data.conversations_by_category?.service || 0 },
    { name: 'מכירות', value: data.conversations_by_category?.sales || 0 },
  ] : [];

  const formatDate = (v) => new Date(v).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });

  return (
    <div className="h-screen flex flex-col md:flex-row font-rubik" dir="rtl">
      <div className="hidden md:block"><Sidebar /></div>
      <div className="flex-1 overflow-y-auto bg-wa-bg p-3 md:p-6 pb-20 md:pb-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 md:mb-6 gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold">📊 דשבורד</h1>
            <p className="text-wa-textSecondary text-xs md:text-sm mt-1">סקירת ביצועים כללית</p>
          </div>
          <div className="flex gap-2">
            {[7, 30, 90].map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 md:px-4 py-1.5 md:py-2 rounded-lg text-xs md:text-sm transition
                  ${days === d ? 'bg-wa-dark text-white' : 'bg-wa-sidebar text-wa-textSecondary hover:bg-wa-hover'}`}
              >
                {d === 7 ? '7 ימים' : d === 30 ? 'חודש' : '3 חודשים'}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-wa-textSecondary">טוען נתונים...</div>
        ) : data && (
          <>
            {/* Row 1: Main stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-4 md:mb-6">
              <StatCard icon="💬" label="שיחות פתוחות" value={data.stats.open_conversations} color="#25D366" />
              <StatCard icon="⏳" label="בטיפול" value={data.stats.in_progress_conversations} color="#F59E0B" />
              <StatCard icon="✅" label="נסגרו היום" value={data.stats.closed_today} color="#3B82F6" />
              <StatCard icon="⚡" label="זמן תגובה ממוצע" value={`${data.stats.avg_response_time} דק'`} color="#8B5CF6" />
            </div>

            {/* Row 2: Messages & unanswered */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-4 md:mb-6">
              <StatCard icon="📤" label="הודעות שנשלחו היום" value={data.stats.messages_sent_today} color="#128C7E" />
              <StatCard icon="📥" label="הודעות שהתקבלו היום" value={data.stats.messages_received_today} color="#3B82F6" />
              <StatCard icon="🔴" label="ממתינות למענה" value={data.stats.unanswered_conversations} color="#EF4444"
                sub={data.stats.unanswered_conversations > 0 ? { text: 'לקוחות מחכים לתשובה!', color: '#EF4444' } : { text: 'הכל מטופל 👍' }} />
              <StatCard icon="📋" label={`סה"כ שיחות (${days} ימים)`} value={data.stats.total_conversations} color="#6366F1" />
            </div>

            {/* Row 3: Messages by day + Pie */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mb-4 md:mb-6">
              <ChartCard title="📨 הודעות לפי יום" className="md:col-span-2">
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={data.messages_by_day}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="date" tick={tickStyle} tickFormatter={formatDate} />
                    <YAxis tick={tickStyle} />
                    <Tooltip contentStyle={tooltipStyle} labelFormatter={v => new Date(v).toLocaleDateString('he-IL')} />
                    <Legend formatter={(v) => v === 'sent' ? 'נשלחו' : 'התקבלו'} />
                    <Line type="monotone" dataKey="sent" stroke="#25D366" strokeWidth={2} dot={{ fill: '#25D366', r: 3 }} name="sent" />
                    <Line type="monotone" dataKey="received" stroke="#3B82F6" strokeWidth={2} dot={{ fill: '#3B82F6', r: 3 }} name="received" />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="🏷️ שירות vs מכירות">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90}
                      paddingAngle={5} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            {/* Row 4: Conversations by day */}
            <ChartCard title="📈 שיחות חדשות לפי יום" className="mb-6">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={data.conversations_by_day}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="date" tick={tickStyle} tickFormatter={formatDate} />
                  <YAxis tick={tickStyle} />
                  <Tooltip contentStyle={tooltipStyle} labelFormatter={v => new Date(v).toLocaleDateString('he-IL')} />
                  <Line type="monotone" dataKey="count" stroke="#6366F1" strokeWidth={2} dot={{ fill: '#6366F1', r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Row 5: Messages by hour */}
            <ChartCard title="🕐 הודעות לפי שעות ביום" className="mb-6">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.messages_by_hour}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="hour" tick={tickStyle} tickFormatter={v => `${v}:00`} />
                  <YAxis tick={tickStyle} />
                  <Tooltip contentStyle={tooltipStyle} labelFormatter={v => `${v}:00`} />
                  <Legend formatter={(v) => v === 'inbound' ? 'נכנסות' : 'יוצאות'} />
                  <Bar dataKey="inbound" fill="#3B82F6" radius={[4, 4, 0, 0]} name="inbound" />
                  <Bar dataKey="outbound" fill="#25D366" radius={[4, 4, 0, 0]} name="outbound" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Row 6: Agents table */}
            <div className="bg-wa-sidebar rounded-xl p-5 border border-wa-border">
              <h3 className="font-semibold mb-4">👥 ביצועי נציגים</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-wa-textSecondary text-sm border-b border-wa-border">
                      <th className="text-right py-3 px-3">#</th>
                      <th className="text-right py-3 px-3">נציג</th>
                      <th className="text-center py-3 px-3">סטטוס</th>
                      <th className="text-center py-3 px-3">שיחות פתוחות</th>
                      <th className="text-center py-3 px-3">נסגרו היום</th>
                      <th className="text-center py-3 px-3">הודעות ({days} ימים)</th>
                      <th className="text-center py-3 px-3">הודעות היום</th>
                      <th className="text-center py-3 px-3">זמן תגובה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.agents.map((agent, idx) => (
                      <tr key={agent.id} className="border-b border-wa-border/30 hover:bg-wa-hover transition">
                        <td className="py-3 px-3 text-wa-textSecondary text-sm">
                          {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-wa-input flex items-center justify-center text-sm font-medium">
                              {agent.name.charAt(0)}
                            </div>
                            <span className="font-medium">{agent.name}</span>
                          </div>
                        </td>
                        <td className="text-center py-3 px-3">
                          <span className="inline-flex items-center gap-1.5 text-sm">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: statusColors[agent.status] }} />
                            {statusLabels[agent.status]}
                          </span>
                        </td>
                        <td className="text-center py-3 px-3 font-medium">{agent.open_count}</td>
                        <td className="text-center py-3 px-3 font-medium">{agent.closed_today}</td>
                        <td className="text-center py-3 px-3">
                          <span className="font-bold text-wa-dark">{agent.messages_sent}</span>
                        </td>
                        <td className="text-center py-3 px-3">
                          <span className="font-medium">{agent.messages_sent_today}</span>
                        </td>
                        <td className="text-center py-3 px-3 text-wa-textSecondary">
                          {agent.avg_response_time > 0 ? `${agent.avg_response_time} דק'` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.agents.length === 0 && (
                <p className="text-center text-wa-textSecondary py-6">אין נציגים להציג</p>
              )}
            </div>
          </>
        )}
      </div>
      {/* Mobile bottom nav */}
      <div className="md:hidden"><Sidebar isMobile={true} /></div>
    </div>
  );
}
