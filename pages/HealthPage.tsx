
import React, { useState, useEffect } from 'react';
import { User, UserRole, HealthLog } from '../types';
import { apiService } from '../services/apiService';

const HealthPage: React.FC<{ user: User }> = ({ user }) => {
  const [logs, setLogs] = useState<HealthLog[]>([]);
  const [showLogModal, setShowLogModal] = useState(false);
  const [boundUsers, setBoundUsers] = useState<Array<{phone: string, name: string, role: string}>>([]);
  const [selectedTarget, setSelectedTarget] = useState(user.role === UserRole.ELDERLY ? user.phone : '');
  const [newLog, setNewLog] = useState({ type: 'blood_pressure' as any, value: '' });

  const loadLogs = async () => {
    if (selectedTarget) {
      const data = await apiService.getHealthLogs(selectedTarget);
      setLogs(data.sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
    } else {
      setLogs([]);
    }
  };

  const loadBoundUsers = async () => {
    if (user.boundPhones.length > 0) {
      const info = await apiService.getUsersByPhones(user.boundPhones);
      setBoundUsers(info);
      
      // For Parent, auto-select the first elderly if none selected
      if (user.role === UserRole.PARENT && !selectedTarget) {
        const firstElderly = info.find(u => u.role === UserRole.ELDERLY);
        if (firstElderly) {
          setSelectedTarget(firstElderly.phone);
        }
      }
    }
  };

  useEffect(() => { 
    loadLogs(); 
    loadBoundUsers();
  }, [selectedTarget]);

  const handleSubmitLog = async () => {
    if (!newLog.value) return;
    await apiService.createHealthLog({
      userId: user.phone,
      type: newLog.type,
      value: newLog.value
    });
    setShowLogModal(false);
    setNewLog({ ...newLog, value: '' });
    loadLogs();
  };

  const getLabel = (type: string) => {
    switch(type) {
      case 'blood_pressure': return '血压 (mmHg)';
      case 'heart_rate': return '心率 (bpm)';
      case 'blood_sugar': return '血糖 (mmol/L)';
      default: return '指标';
    }
  };

  // Filter: Only show elderly in parent view
  const displayableUsers = boundUsers.filter(u => u.role === UserRole.ELDERLY);

  return (
    <div className="p-6 min-h-screen bg-gray-50">
      <header className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-black text-gray-800 tracking-tight">健康监测</h2>
        {user.role === UserRole.ELDERLY && (
          <button onClick={() => setShowLogModal(true)} className="w-10 h-10 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-transform">
            <i className="fas fa-plus"></i>
          </button>
        )}
      </header>

      {user.role === UserRole.PARENT && (
        <div className="mb-6">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 mb-2 block">选择老人</label>
          <select 
            value={selectedTarget} 
            onChange={e => setSelectedTarget(e.target.value)}
            className="w-full p-5 bg-white border border-gray-100 rounded-[24px] font-bold text-gray-700 shadow-sm outline-none focus:ring-2 focus:ring-red-400 appearance-none"
            style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%23cbd5e1\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1.25rem center', backgroundSize: '1.5em' }}
          >
            <option value="" disabled>请选择查看对象...</option>
            {displayableUsers.length === 0 ? (
              <option disabled>暂无绑定的老人</option>
            ) : (
              displayableUsers.map(u => (
                <option key={u.phone} value={u.phone}>{u.name} ({u.phone})</option>
              ))
            )}
          </select>
        </div>
      )}

      <div className="space-y-4">
        {logs.length === 0 ? (
          <div className="bg-white p-16 rounded-[40px] text-center border border-gray-100 shadow-sm">
            <i className="fas fa-file-waveform text-gray-100 text-5xl mb-4"></i>
            <p className="text-gray-400 text-sm font-bold">暂无健康记录</p>
          </div>
        ) : (
          logs.map(log => (
            <div key={log.id} className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm flex items-center justify-between animate-fade-in">
              <div className="flex items-center space-x-5">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                  log.type === 'blood_pressure' ? 'bg-red-50 text-red-500' : 
                  log.type === 'heart_rate' ? 'bg-blue-50 text-blue-500' : 'bg-orange-50 text-orange-500'
                }`}>
                  <i className={`fas ${
                    log.type === 'blood_pressure' ? 'fa-heart' : 
                    log.type === 'heart_rate' ? 'fa-wave-square' : 'fa-tint'
                  } text-xl`}></i>
                </div>
                <div>
                  <div className="text-[9px] text-gray-400 font-black uppercase tracking-widest mb-1">{getLabel(log.type)}</div>
                  <div className="text-2xl font-black text-gray-800">{log.value}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-gray-400 font-bold">{new Date(log.timestamp).toLocaleDateString()}</div>
                <div className="text-[10px] text-gray-300 font-medium">{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            </div>
          ))
        )}
      </div>

      {showLogModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-[40px] p-8 shadow-2xl animate-scale-up">
            <h3 className="text-xl font-black mb-6">登记今日指标</h3>
            <div className="space-y-6">
              <div className="flex bg-gray-100 p-1 rounded-2xl">
                <button onClick={() => setNewLog({...newLog, type: 'blood_pressure'})} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${newLog.type === 'blood_pressure' ? 'bg-white shadow-sm text-red-500' : 'text-gray-400'}`}>血压</button>
                <button onClick={() => setNewLog({...newLog, type: 'heart_rate'})} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${newLog.type === 'heart_rate' ? 'bg-white shadow-sm text-blue-500' : 'text-gray-400'}`}>心率</button>
                <button onClick={() => setNewLog({...newLog, type: 'blood_sugar'})} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${newLog.type === 'blood_sugar' ? 'bg-white shadow-sm text-orange-500' : 'text-gray-400'}`}>血糖</button>
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 ml-2 mb-2 block tracking-widest uppercase">{getLabel(newLog.type)}</label>
                <input 
                  type="text" 
                  placeholder="数值" 
                  value={newLog.value} 
                  onChange={e => setNewLog({...newLog, value: e.target.value})} 
                  className="w-full bg-gray-50 border-0 rounded-2xl py-5 px-6 text-2xl font-black text-gray-800 focus:ring-2 focus:ring-red-400 outline-none"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex space-x-4 mt-10">
              <button onClick={() => setShowLogModal(false)} className="flex-1 py-4 font-black text-gray-400 uppercase tracking-widest text-[10px]">取消</button>
              <button onClick={handleSubmitLog} className="flex-1 bg-red-500 text-white py-4 rounded-2xl font-black shadow-lg shadow-red-500/30 active:scale-95 transition-transform uppercase tracking-widest text-[10px]">保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HealthPage;
