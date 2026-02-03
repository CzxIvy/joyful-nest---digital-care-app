
import React, { useState } from 'react';
import { User, UserRole } from '../types';
import { apiService } from '../services/apiService';

interface LoginProps {
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [role, setRole] = useState<UserRole | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || !password || (isRegistering && !name)) return setError('请填写完整');
    setIsLoading(true);
    try {
      if (isRegistering) {
        await apiService.register({ phone, name, password, role });
        alert('注册成功，请登录');
        setIsRegistering(false);
      } else {
        const u = await apiService.login({ phone, password });
        onLogin(u);
      }
    } catch (err: any) {
      setError(err.message || '操作失败');
    } finally {
      setIsLoading(false);
    }
  };

  if (!role) {
    return (
      <div className="min-h-screen bg-gray-900 p-6 flex flex-col justify-center space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-black text-white mb-2">乐居巢</h1>
          <p className="text-white/40 text-sm font-bold tracking-widest">SELECT YOUR ROLE</p>
        </div>
        <div className="space-y-4">
          <button onClick={() => setRole(UserRole.PARENT)} className="w-full bg-blue-600 p-8 rounded-[32px] text-white flex items-center justify-between group active:scale-95 transition">
            <div className="text-left">
              <div className="text-2xl font-black">我是家长</div>
              <div className="text-white/60 text-xs mt-1">远程关爱与数据查看</div>
            </div>
            <i className="fas fa-user-shield text-3xl opacity-20 group-hover:opacity-100 transition"></i>
          </button>
          <button onClick={() => setRole(UserRole.ELDERLY)} className="w-full bg-green-600 p-8 rounded-[32px] text-white flex items-center justify-between group active:scale-95 transition">
            <div className="text-left">
              <div className="text-2xl font-black">我是老人</div>
              <div className="text-white/60 text-xs mt-1">数字陪伴与健康登记</div>
            </div>
            <i className="fas fa-heart text-3xl opacity-20 group-hover:opacity-100 transition"></i>
          </button>
          <button onClick={() => setRole(UserRole.CHILD)} className="w-full bg-orange-500 p-8 rounded-[32px] text-white flex items-center justify-between group active:scale-95 transition">
            <div className="text-left">
              <div className="text-2xl font-black">我是小孩</div>
              <div className="text-white/60 text-xs mt-1">快乐对话与成长记录</div>
            </div>
            <i className="fas fa-child text-3xl opacity-20 group-hover:opacity-100 transition"></i>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white p-10 flex flex-col">
      <button onClick={() => setRole(null)} className="mb-10 text-gray-400"><i className="fas fa-arrow-left text-2xl"></i></button>
      <div className="mb-10">
        <h2 className="text-4xl font-black text-gray-900">{isRegistering ? '注册' : '登录'}</h2>
        <p className="text-gray-400 font-bold mt-2 uppercase tracking-tighter">{role} PORTAL</p>
      </div>
      <form onSubmit={handleAuth} className="space-y-6">
        {error && <div className="text-red-500 text-xs font-bold">{error}</div>}
        {isRegistering && (
          <input 
            type="text" 
            placeholder="姓名 / 昵称" 
            value={name} 
            onChange={e => setName(e.target.value)} 
            className="w-full bg-gray-50 border-0 rounded-2xl p-5" 
          />
        )}
        <input type="text" placeholder="手机号" value={phone} onChange={e => setPhone(e.target.value)} className="w-full bg-gray-50 border-0 rounded-2xl p-5" />
        <input type="password" placeholder="密码" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-gray-50 border-0 rounded-2xl p-5" />
        <button disabled={isLoading} className="w-full bg-black text-white font-black py-5 rounded-2xl shadow-xl">{isLoading ? '请稍后...' : (isRegistering ? '立即注册' : '登录系统')}</button>
      </form>
      <button onClick={() => setIsRegistering(!isRegistering)} className="mt-8 text-sm text-gray-400 font-bold">{isRegistering ? '已有账号？登录' : '没有账号？注册'}</button>
    </div>
  );
};

export default Login;
