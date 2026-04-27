import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { getMe, logout as apiLogout } from './api';
import Login from './pages/Login';
import Chat from './pages/Chat';
import Dashboard from './pages/Dashboard';
import Campaigns from './pages/Campaigns';
import Agents from './pages/Agents';
import Templates from './pages/Templates';
import Settings from './pages/Settings';

export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      getMe()
        .then(setUser)
        .catch(() => {
          // Fallback: decode JWT manually if /me fails
          // If /me fails, token is likely invalid — force re-login
          localStorage.removeItem('token');
          localStorage.removeItem('refreshToken');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const handleLogin = (userData, token) => {
    localStorage.setItem('token', token);
    setUser(userData);
  };

  const handleLogout = async () => {
    try {
      await apiLogout();
    } catch (e) {
      // Logout API may fail if token already expired — continue anyway
    }
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    setUser(null);
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-wa-bg">
        <div className="text-wa-light text-xl font-rubik">טוען...</div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, setUser, logout: handleLogout }}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/chat" /> : <Login onLogin={handleLogin} />} />
          <Route path="/chat" element={user ? <Chat /> : <Navigate to="/login" />} />
          <Route path="/dashboard" element={user ? <Dashboard /> : <Navigate to="/login" />} />
          <Route path="/campaigns" element={user ? <Campaigns /> : <Navigate to="/login" />} />
          <Route path="/agents" element={user ? <Agents /> : <Navigate to="/login" />} />
          <Route path="/templates" element={user ? <Templates /> : <Navigate to="/login" />} />
          <Route path="/settings" element={user ? <Settings /> : <Navigate to="/login" />} />
          <Route path="*" element={<Navigate to={user ? "/chat" : "/login"} />} />
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}

export default App;
