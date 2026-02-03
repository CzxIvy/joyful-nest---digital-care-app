
import React, { useState, useEffect } from 'react';
import { User, UserRole } from './types';
import Login from './pages/Login';
import Dialogue from './pages/Dialogue';
import Profile from './pages/Profile';
import Reports from './pages/Reports'; // 情感报表
import SchedulePage from './pages/SchedulePage';
import HealthPage from './pages/HealthPage';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<string>('dialogue');
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('joyful_nest_user');
    if (saved) {
      const parsed = JSON.parse(saved);
      setUser(parsed);
      setActiveTab(parsed.role === UserRole.PARENT ? 'reports' : 'dialogue');
    }
    setIsInitialized(true);
  }, []);

  const handleLogin = (u: User) => {
    setUser(u);
    localStorage.setItem('joyful_nest_user', JSON.stringify(u));
    setActiveTab(u.role === UserRole.PARENT ? 'reports' : 'dialogue');
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('joyful_nest_user');
  };

  if (!isInitialized) return null;
  if (!user) return <Login onLogin={handleLogin} />;

  const renderContent = () => {
    switch (activeTab) {
      case 'dialogue': return <Dialogue user={user} />;
      case 'schedule': return <SchedulePage user={user} />;
      case 'health': return <HealthPage user={user} />;
      case 'reports': return <Reports user={user} />;
      case 'profile': return <Profile user={user} onLogout={handleLogout} onUpdateUser={u => { setUser(u); localStorage.setItem('joyful_nest_user', JSON.stringify(u)); }} />;
      default: return <Dialogue user={user} />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col max-w-md mx-auto shadow-2xl relative overflow-hidden">
      <main className="flex-1 overflow-y-auto pb-24">
        {renderContent()}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/90 backdrop-blur-xl border-t border-gray-100 flex justify-around items-center py-4 z-50">
        {(user.role === UserRole.ELDERLY || user.role === UserRole.CHILD) && (
          <button onClick={() => setActiveTab('dialogue')} className={`flex flex-col items-center ${activeTab === 'dialogue' ? 'text-green-600' : 'text-gray-400'}`}>
            <i className="fas fa-comment-dots text-lg"></i>
            <span className="text-[10px] mt-1 font-bold">数字人</span>
          </button>
        )}
        
        {user.role === UserRole.PARENT && (
          <button onClick={() => setActiveTab('reports')} className={`flex flex-col items-center ${activeTab === 'reports' ? 'text-green-600' : 'text-gray-400'}`}>
            <i className="fas fa-chart-pie text-lg"></i>
            <span className="text-[10px] mt-1 font-bold">报表</span>
          </button>
        )}

        <button onClick={() => setActiveTab('schedule')} className={`flex flex-col items-center ${activeTab === 'schedule' ? 'text-green-600' : 'text-gray-400'}`}>
          <i className="fas fa-calendar-check text-lg"></i>
          <span className="text-[10px] mt-1 font-bold">日程</span>
        </button>

        {/* 只有老人端和家长端有健康模块 */}
        {(user.role === UserRole.ELDERLY || user.role === UserRole.PARENT) && (
          <button onClick={() => setActiveTab('health')} className={`flex flex-col items-center ${activeTab === 'health' ? 'text-green-600' : 'text-gray-400'}`}>
            <i className="fas fa-heartbeat text-lg"></i>
            <span className="text-[10px] mt-1 font-bold">健康</span>
          </button>
        )}

        <button onClick={() => setActiveTab('profile')} className={`flex flex-col items-center ${activeTab === 'profile' ? 'text-green-600' : 'text-gray-400'}`}>
          <i className="fas fa-user-circle text-lg"></i>
          <span className="text-[10px] mt-1 font-bold">我的</span>
        </button>
      </nav>
    </div>
  );
};

export default App;
