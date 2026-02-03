
import React, { useState, useRef } from 'react';
import { User, UserRole } from '../types';
import { apiService } from '../services/apiService';

interface ProfileProps {
  user: User;
  onLogout: () => void;
  onUpdateUser: (u: User) => void;
}

const Profile: React.FC<ProfileProps> = ({ user, onLogout, onUpdateUser }) => {
  const [showBindModal, setShowBindModal] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(user.name || '');
  const [targetPhone, setTargetPhone] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{field: string, status: 'idle' | 'uploading' | 'success'}>({field: '', status: 'idle'});

  const imageInputRef = useRef<HTMLInputElement>(null);
  const voiceInputRef = useRef<HTMLInputElement>(null);

  const handleBind = async () => {
    if (!targetPhone) return;
    setIsProcessing(true);
    try {
      const u = await apiService.bindFamily(user.id, targetPhone);
      onUpdateUser(u);
      setShowBindModal(false);
      setTargetPhone('');
    } finally { setIsProcessing(false); }
  };

  const handleUpdateName = async () => {
    if (!tempName.trim()) return setIsEditingName(false);
    setIsProcessing(true);
    try {
      const updatedUser = await apiService.updateProfile(user.id, { name: tempName });
      onUpdateUser(updatedUser);
      setIsEditingName(false);
    } catch (e) {
      alert('更新姓名失败');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUnbind = async (phone: string) => {
    if (!confirm(`确定解绑 ${phone} 吗？`)) return;
    const u = await apiService.unbindFamily(user.id, phone);
    onUpdateUser(u);
  };

  const handleFileUpload = async (type: 'image' | 'voice', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadStatus({ field: type, status: 'uploading' });
    try {
      let updatedUser;
      if (type === 'image') {
        updatedUser = await apiService.uploadImageSample(user.id, file);
      } else {
        updatedUser = await apiService.uploadVoiceSample(user.id, file);
      }
      onUpdateUser(updatedUser);
      setUploadStatus({ field: type, status: 'success' });
      setTimeout(() => setUploadStatus({ field: '', status: 'idle' }), 3000);
    } catch (err) {
      alert('上传失败');
      setUploadStatus({ field: '', status: 'idle' });
    }
  };

  // 根据角色获取对应的图标和颜色
  const getRoleTheme = () => {
    switch(user.role) {
      case UserRole.PARENT: return { icon: 'fa-user-shield', color: 'text-blue-500', bg: 'bg-blue-50' };
      case UserRole.ELDERLY: return { icon: 'fa-heart', color: 'text-green-500', bg: 'bg-green-50' };
      case UserRole.CHILD: return { icon: 'fa-child', color: 'text-orange-500', bg: 'bg-orange-50' };
      default: return { icon: 'fa-user', color: 'text-gray-400', bg: 'bg-gray-100' };
    }
  };

  const theme = getRoleTheme();

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="flex flex-col items-center py-12 space-y-4">
        {/* 取消头像显示，改为角色标识卡片 */}
        <div className={`w-20 h-20 ${theme.bg} rounded-[28px] shadow-sm flex items-center justify-center border border-white`}>
          <i className={`fas ${theme.icon} ${theme.color} text-3xl`}></i>
        </div>
        
        <div className="text-center w-full px-4">
          {isEditingName ? (
            <div className="flex items-center justify-center space-x-2">
              <input 
                value={tempName} 
                onChange={e => setTempName(e.target.value)}
                className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-center font-bold text-lg focus:ring-2 focus:ring-blue-400 outline-none shadow-sm"
                autoFocus
                onBlur={handleUpdateName}
                onKeyDown={e => e.key === 'Enter' && handleUpdateName()}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center space-x-2">
              <h2 className="text-2xl font-black text-gray-800">{user.name || '未设置姓名'}</h2>
              <button onClick={() => setIsEditingName(true)} className="text-gray-300 hover:text-blue-500 transition-colors">
                <i className="fas fa-edit text-sm"></i>
              </button>
            </div>
          )}
          <p className="text-gray-400 text-sm mt-1 font-medium">{user.phone}</p>
          <span className={`text-[10px] font-black uppercase ${theme.bg} px-3 py-1 rounded-full ${theme.color} inline-block mt-3 tracking-wider`}>
            {user.role}
          </span>
        </div>
      </div>

      {/* 数字人克隆设置 - 仅家长端可见 */}
      {user.role === UserRole.PARENT && (
        <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-[32px] p-6 mb-8 shadow-xl text-white">
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <i className="fas fa-magic text-lg"></i>
            </div>
            <div>
              <h3 className="font-bold">数字人克隆中心</h3>
              <p className="text-[10px] text-white/60 uppercase tracking-widest">Clone Your Presence</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div 
              onClick={() => imageInputRef.current?.click()}
              className="bg-white/10 border border-white/20 rounded-2xl p-4 flex flex-col items-center justify-center space-y-2 cursor-pointer active:scale-95 transition hover:bg-white/20"
            >
              <input type="file" ref={imageInputRef} className="hidden" accept="image/*" onChange={(e) => handleFileUpload('image', e)} />
              <i className={`fas ${user.did_image_url ? 'fa-check-circle text-green-400' : 'fa-portrait text-white/50'} text-2xl`}></i>
              <span className="text-xs font-bold">形象上传</span>
              <span className="text-[9px] text-white/40">{uploadStatus.field === 'image' && uploadStatus.status === 'uploading' ? '上传中...' : (user.did_image_url ? '已就绪' : '未同步')}</span>
            </div>

            <div 
              onClick={() => voiceInputRef.current?.click()}
              className="bg-white/10 border border-white/20 rounded-2xl p-4 flex flex-col items-center justify-center space-y-2 cursor-pointer active:scale-95 transition hover:bg-white/20"
            >
              <input type="file" ref={voiceInputRef} className="hidden" accept="audio/*" onChange={(e) => handleFileUpload('voice', e)} />
              <i className={`fas ${user.did_voice_id ? 'fa-check-circle text-green-400' : 'fa-microphone-lines text-white/50'} text-2xl`}></i>
              <span className="text-xs font-bold">音色录入</span>
              <span className="text-[9px] text-white/40">{uploadStatus.field === 'voice' && uploadStatus.status === 'uploading' ? '处理中...' : (user.did_voice_id ? '已就绪' : '未录入')}</span>
            </div>
          </div>
          
          <p className="mt-4 text-[9px] text-white/40 text-center leading-relaxed">
            * 上传正面清晰照片和 10s 以上的音频样本以获得最佳克隆效果。
          </p>
        </div>
      )}

      <div className="bg-white rounded-[32px] p-6 shadow-sm border border-gray-100 space-y-6">
        <div className="flex justify-between items-center px-1">
          <h3 className="font-black text-gray-800">已绑定家人 ({(user.boundPhones || []).length})</h3>
          <button onClick={() => setShowBindModal(true)} className="text-blue-600 font-bold text-sm">+ 新增</button>
        </div>
        
        <div className="space-y-3">
          {(user.boundPhones || []).length === 0 ? (
            <p className="text-center text-gray-400 py-6 text-xs font-bold">暂无绑定家人</p>
          ) : (
            (user.boundPhones || []).map(p => (
              <div key={p} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-transparent hover:border-gray-200 transition-all">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm">
                    <i className="fas fa-user text-gray-300 text-sm"></i>
                  </div>
                  <span className="font-bold text-gray-700">{p}</span>
                </div>
                <button onClick={() => handleUnbind(p)} className="text-red-400 text-xs font-bold px-3 py-1 hover:bg-red-50 rounded-lg transition-colors">解绑</button>
              </div>
            ))
          )}
        </div>
      </div>

      <button onClick={onLogout} className="w-full mt-10 bg-white border border-gray-100 text-gray-400 font-black py-5 rounded-2xl hover:bg-gray-100 transition-colors">退出登录</button>

      {showBindModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl animate-scale-up">
            <h3 className="text-xl font-bold mb-4">绑定家人</h3>
            <p className="text-gray-400 text-xs mb-6">输入对方注册的手机号进行双向绑定</p>
            <input 
              type="text" 
              placeholder="手机号" 
              value={targetPhone} 
              onChange={e => setTargetPhone(e.target.value)} 
              className="w-full bg-gray-50 border-0 rounded-2xl p-5 mb-8 focus:ring-2 focus:ring-blue-400 outline-none" 
              autoFocus
            />
            <div className="flex space-x-4">
              <button onClick={() => setShowBindModal(false)} className="flex-1 py-4 font-bold text-gray-400 hover:text-gray-600 transition-colors">取消</button>
              <button onClick={handleBind} disabled={isProcessing} className="flex-1 bg-black text-white py-4 rounded-2xl font-bold shadow-lg active:scale-95 transition-transform disabled:opacity-50">立即绑定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;
