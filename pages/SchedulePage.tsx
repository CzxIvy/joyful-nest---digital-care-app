
import React, { useState, useEffect } from 'react';
import { User, UserRole, ScheduleItem } from '../types';
import { apiService } from '../services/apiService';

const SchedulePage: React.FC<{ user: User }> = ({ user }) => {
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [boundUsers, setBoundUsers] = useState<Array<{phone: string, name: string}>>([]);
  const [newTask, setNewTask] = useState({ title: '', time: '', type: 'life' as 'life' | 'medication', targetPhone: '' });

  const loadSchedules = async () => {
    const target = user.role === UserRole.PARENT ? (newTask.targetPhone || user.boundPhones[0]) : user.phone;
    if (target) {
      const data = await apiService.getSchedules(target);
      setSchedules(data);
    }
  };

  const loadBoundUsers = async () => {
    if (user.boundPhones.length > 0) {
      const info = await apiService.getUsersByPhones(user.boundPhones);
      setBoundUsers(info);
    }
  };

  useEffect(() => { 
    loadSchedules(); 
    loadBoundUsers();
  }, [newTask.targetPhone]);

  const handleToggleStatus = async (item: ScheduleItem) => {
    const newStatus = item.status === 'pending' ? 'completed' : 'pending';
    await apiService.updateSchedule(item.id, { status: newStatus });
    loadSchedules();
  };

  const handleAddTask = async () => {
    if (!newTask.title || !newTask.time || !newTask.targetPhone) return;
    await apiService.createSchedule({
      userId: newTask.targetPhone,
      title: newTask.title,
      time: newTask.time,
      type: newTask.type,
      createdBy: user.phone
    });
    setShowAddModal(false);
    loadSchedules();
  };

  const handleDelete = async (id: string) => {
    await apiService.deleteSchedule(id);
    loadSchedules();
  };

  const getTargetLabel = (phone: string) => {
    const u = boundUsers.find(bu => bu.phone === phone);
    return u ? `${u.name} (${u.phone})` : phone;
  };

  return (
    <div className="p-6 min-h-screen bg-gray-50">
      <header className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">生活日程</h2>
        {user.role === UserRole.PARENT && (
          <button onClick={() => setShowAddModal(true)} className="w-10 h-10 bg-green-600 text-white rounded-full flex items-center justify-center shadow-lg">
            <i className="fas fa-plus"></i>
          </button>
        )}
      </header>

      {user.role === UserRole.PARENT && user.boundPhones.length > 0 && (
        <select 
          value={newTask.targetPhone || user.boundPhones[0]} 
          onChange={e => setNewTask({...newTask, targetPhone: e.target.value})}
          className="w-full mb-6 p-4 bg-white border border-gray-200 rounded-2xl font-bold text-gray-700 shadow-sm outline-none focus:ring-2 focus:ring-green-400"
        >
          {user.boundPhones.map(p => (
            <option key={p} value={p}>{getTargetLabel(p)}</option>
          ))}
        </select>
      )}

      <div className="space-y-4">
        {schedules.length === 0 ? (
          <div className="text-center py-20 text-gray-400">暂无日程安排</div>
        ) : (
          schedules.sort((a,b) => a.time.localeCompare(b.time)).map(item => (
            <div key={item.id} className={`flex items-center p-4 rounded-2xl border transition-all ${item.status === 'completed' ? 'bg-gray-100 border-transparent opacity-60' : 'bg-white border-gray-100 shadow-sm'}`}>
              <button onClick={() => handleToggleStatus(item)} className={`w-6 h-6 rounded-full border-2 flex items-center justify-center mr-4 ${item.status === 'completed' ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'}`}>
                {item.status === 'completed' && <i className="fas fa-check text-[10px]"></i>}
              </button>
              <div className="flex-1">
                <h4 className={`font-bold ${item.status === 'completed' ? 'line-through text-gray-500' : 'text-gray-800'}`}>{item.title}</h4>
                <div className="flex items-center text-[10px] text-gray-400 mt-1 uppercase tracking-wider">
                  <i className="far fa-clock mr-1"></i> {item.time}
                  <span className="mx-2">•</span>
                  <span className={item.type === 'medication' ? 'text-red-500 font-bold' : ''}>
                    {item.type === 'medication' ? '服药提醒' : '日常任务'}
                  </span>
                </div>
              </div>
              {user.role === UserRole.PARENT && (
                <button onClick={() => handleDelete(item.id)} className="text-gray-300 hover:text-red-500 p-2">
                  <i className="fas fa-trash-alt"></i>
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl animate-scale-up">
            <h3 className="text-xl font-bold mb-6">新增日程</h3>
            <div className="space-y-4">
              <input type="text" placeholder="任务名称 (如: 吃降压药)" value={newTask.title} onChange={e => setNewTask({...newTask, title: e.target.value})} className="w-full bg-gray-50 border-0 rounded-2xl py-4 px-6" />
              <input type="time" value={newTask.time} onChange={e => setNewTask({...newTask, time: e.target.value})} className="w-full bg-gray-50 border-0 rounded-2xl py-4 px-6" />
              <div className="flex space-x-2">
                <button onClick={() => setNewTask({...newTask, type: 'life'})} className={`flex-1 py-3 rounded-xl font-bold ${newTask.type === 'life' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>生活</button>
                <button onClick={() => setNewTask({...newTask, type: 'medication'})} className={`flex-1 py-3 rounded-xl font-bold ${newTask.type === 'medication' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-500'}`}>服药</button>
              </div>
              <select 
                value={newTask.targetPhone} 
                onChange={e => setNewTask({...newTask, targetPhone: e.target.value})}
                className="w-full p-4 bg-gray-50 border-0 rounded-2xl font-medium"
              >
                <option value="">指派给...</option>
                {user.boundPhones.map(p => <option key={p} value={p}>{getTargetLabel(p)}</option>)}
              </select>
            </div>
            <div className="flex space-x-4 mt-8">
              <button onClick={() => setShowAddModal(false)} className="flex-1 py-4 font-bold text-gray-400">取消</button>
              <button onClick={handleAddTask} className="flex-1 bg-green-600 text-white py-4 rounded-2xl font-bold shadow-lg">确认创建</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SchedulePage;
