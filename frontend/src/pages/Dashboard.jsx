import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import Sidebar from '../components/Sidebar';
import { getDashboard } from '../api';
import { useAuth } from '../context/AuthContext';

const COLORS = ['#25D366', '#128C7E', '#075E54', '#F59E0B', '#3B82F6'];
const statusColors = { online: '#25D366', busy: '#F59E0B', away: '#EF4444' };
const statusLabels = { online: 'מחובר', busy: 'עסוק', away: 'לא זמין' };

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

  return (
    <div className="h-screen flex font-rubik" dir="rtl">
      <Sidebar />
      <div className="flex-1 overflow-y-auto bg-wa-bg p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">📊 דשבורד</h1>
            <p className="text-wa-textSecondary text-sm mt-1">סקירת ביצועים כללית</p>
          </div>
          <div className="flex gap-2">
            {[7, 30, 90].map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-4 py-2 rounded-lg text-sm transition
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
            {/* Stat cards */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              {[
                { label: 'שיחות פתוחות', value: data.stats.open_conversations, icon: '💬', color: '#25D366' },
                { label: 'בטיפול', value: data.stats.in_progress_conversations, icon: '⏳', color: '#F59E0B' },
                { label: 'נסגרו היום', value: data.stats.closed_today, icon: '✅', color: '#3B82F6' },
                { label: 'זמן תגובה ממוצע', value: `${data.stats.avg_response_time} דק'`, icon: '⚡', color: '#8B5CF6' },
              ].map((stat, i) => (
                <div key={i} className="bg-wa-sidebar rounded-xl p-5 border border-wa-border">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-2xl">{stat.icon}</span>
                    <span className="text-3xl font-bold" style={{ color: stat.color }}>{stat.value}</span>
                  </div>
                  <p className="text-wa-textSecondary text-sm">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Charts row 1 */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              {/* Line chart */}
              <div className="col-span-2 bg-wa-sidebar rounded-xl p-5 border border-wa-border">
                <h3 className="font-semibold mb-4">שיחות לפי יום</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={data.conversations_by_day}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="date" tick={{ fill: '#667781', fontSize: 11 }}
                      tickFormatter={v => new Date(v).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })} />
                    <YAxis tick={{ fill: '#667781', fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ background: '#FFFFFF', border: '1px solid #E9EDEF', borderRadius: 8 }}
                      labelFormatter={v => new Date(v).toLocaleDateString('he-IL')}
                    />
                    <Line type="monotone" dataKey="count" stroke="#25D366" strokeWidth={2} dot={{ fill: '#25D366' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Pie chart */}
              <div className="bg-wa-sidebar rounded-xl p-5 border border-wa-border">
                <h3 className="font-semibold mb-4">שירות vs מכירות</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90}
                      paddingAngle={5} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #E9EDEF', borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Bar chart - hourly */}
            <div className="bg-wa-sidebar rounded-xl p-5 border border-wa-border mb-6">
              <h3 className="font-semibold mb-4">שיחות לפי שעות ביום</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.conversations_by_hour}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="hour" tick={{ fill: '#667781', fontSize: 11 }}
                    tickFormatter={v => `${v}:00`} />
                  <YAxis tick={{ fill: '#667781', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #E9EDEF', borderRadius: 8 }}
                    labelFormatter={v => `${v}:00`} />
                  <Bar dataKey="count" fill="#128C7E" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Agents table */}
            <div className="bg-wa-sidebar rounded-xl p-5 border border-wa-border">
              <h3 className="font-semibold mb-4">👥 ביצועי נציגים</h3>
              <table className="w-full">
                <thead>
                  <tr className="text-wa-textSecondary text-sm border-b border-wa-border">
                    <th className="text-right py-3 px-4">נציג</th>
                    <th className="text-center py-3 px-4">סטטוס</th>
                    <th className="text-center py-3 px-4">שיחות פתוחות</th>
                    <th className="text-center py-3 px-4">נסגרו היום</th>
                    <th className="text-center py-3 px-4">זמן תגובה ממוצע</th>
                  </tr>
                </thead>
                <tbody>
                  {data.agents.map(agent => (
                    <tr key={agent.id} className="border-b border-wa-border/30 hover:bg-wa-hover transition">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-wa-input flex items-center justify-center text-sm font-medium">
                            {agent.name.charAt(0)}
                          </div>
                          {agent.name}
                        </div>
                      </td>
                      <td className="text-center py-3 px-4">
                        <span className="inline-flex items-center gap-1.5 text-sm">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: statusColors[agent.status] }} />
                          {statusLabels[agent.status]}
                        </span>
                      </td>
                      <td className="text-center py-3 px-4 font-medium">{agent.open_count}</td>
                      <td className="text-center py-3 px-4 font-medium">{agent.closed_today}</td>
                      <td className="text-center py-3 px-4 text-wa-textSecondary">{agent.avg_response_time} דק'</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
