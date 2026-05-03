import React, { useState } from 'react';
import { login, getMe } from '../api';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(username, password);
      const token = data.access_token;
      if (!token) throw new Error('No token received');
      localStorage.setItem('token', token);
      if (data.refresh_token) {
        localStorage.setItem('refreshToken', data.refresh_token);
      }
      const user = await getMe();
      onLogin(user, token);
    } catch (err) {
      setError(err.message || 'שם משתמש או סיסמה שגויים');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-wa-bg font-rubik">
      <div className="bg-wa-sidebar rounded-2xl p-6 md:p-10 w-full max-w-[420px] mx-4 shadow-2xl">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-wa-dark flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-10 h-10 text-wa-light" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12c0 1.82.49 3.53 1.34 5L2 22l5.16-1.34C8.58 21.51 10.26 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.61 0-3.11-.46-4.38-1.25l-.31-.19-3.22.84.86-3.14-.2-.32A7.963 7.963 0 014 12c0-4.41 3.59-8 8-8s8 3.59 8 8-3.59 8-8 8z"/>
              <path d="M16.25 13.97c-.23-.12-1.36-.67-1.57-.75-.21-.08-.37-.12-.52.12-.15.23-.6.75-.73.9-.14.16-.27.18-.5.06-.23-.12-.97-.36-1.85-1.14-.68-.61-1.14-1.36-1.28-1.59-.13-.23-.01-.36.1-.47.1-.1.23-.27.35-.4.12-.14.15-.23.23-.39.08-.15.04-.29-.02-.4-.06-.12-.52-1.26-.72-1.73-.19-.45-.38-.39-.52-.4h-.45c-.15 0-.4.06-.61.29-.21.23-.8.78-.8 1.9 0 1.13.82 2.22.93 2.37.12.15 1.61 2.46 3.9 3.45.55.24.97.38 1.3.49.55.17 1.05.15 1.44.09.44-.07 1.36-.56 1.55-1.1.19-.54.19-1 .13-1.1-.06-.1-.22-.15-.45-.27z"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-wa-light mb-1">יש לי זכות</h1>
          <h2 className="text-lg text-wa-textSecondary">ChatFlow</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-wa-textSecondary text-sm mb-2">שם משתמש</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-wa-input text-wa-text rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-wa-medium transition"
              placeholder="הכנס שם משתמש"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-wa-textSecondary text-sm mb-2">סיסמה</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-wa-input text-wa-text rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-wa-medium transition"
              placeholder="הכנס סיסמה"
            />
          </div>

          {error && (
            <div className="text-red-600 text-sm text-center bg-red-50 rounded-lg py-2 border border-red-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !username || !password}
            className="w-full bg-wa-dark hover:bg-wa-medium text-white rounded-lg py-3 font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'מתחבר...' : 'התחבר'}
          </button>
        </form>

        <div className="mt-6 text-center text-wa-textSecondary text-xs">
          מערכת ניהול שיחות WhatsApp
        </div>
      </div>
    </div>
  );
}
