
import React, { useState, useEffect } from 'react';
import { User, SentimentReport } from '../types';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, Radar as RadarArea } from 'recharts';
import { apiService } from '../services/apiService';

interface DailySentimentReport extends SentimentReport {
  trend?: string;
  interactionCount?: number;
  userName?: string;
  userRole?: string;
}

const Reports: React.FC<{ user: User }> = ({ user }) => {
  const [reports, setReports] = useState<DailySentimentReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [careMessage, setCareMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const fetchReports = async () => {
    try {
      setIsLoading(true);
      // 仅获取已绑定家人的报告
      // 注意：这里为了简化逻辑，假设 userIds 即为 boundPhones 或通过 boundPhones 转换
      // 实际开发中需要先通过 boundPhones 获取家人的 userId 列表
      const data = await apiService.getReports(); 
      setReports(data);
    } catch (err) {
      console.error('Failed to fetch reports:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const handleMidnightSync = async () => {
    setIsSyncing(true);
    try {
      await apiService.triggerMidnightSync();
      await fetchReports();
      alert('凌晨合辑同步模拟成功！已分别为每位家人生成每日报告。');
    } catch (err) {
      alert('同步失败: ' + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSendMessage = async () => {
    if (!careMessage.trim() || !user.boundPhones || user.boundPhones.length === 0) return;
    setIsSending(true);
    try {
      await apiService.sendMessage({
        fromUserId: user.id,
        targetPhone: user.boundPhones[0],
        content: careMessage,
        type: 'text'
      });
      alert('温馨寄语已发送，数字人会在下次交流时转达。');
      setCareMessage('');
    } catch (err) {
      alert('发送失败');
    } finally {
      setIsSending(false);
    }
  };

  const formatChartData = (details: SentimentReport['details']) => [
    { subject: '快乐', A: details.happiness },
    { subject: '忧郁', A: details.sadness },
    { subject: '愤怒', A: details.anger },
    { subject: '恐惧', A: details.fear },
  ];

  const getRoleIcon = (role?: string) => {
    if (role === 'child') return 'fa-child text-orange-400';
    return 'fa-person-cane text-green-400';
  };

  const getRoleBg = (role?: string) => {
    if (role === 'child') return 'bg-orange-50 border-orange-100';
    return 'bg-green-50 border-green-100';
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="pt-10 space-y-6 pb-20">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-black text-gray-800 tracking-tight">每日关怀报表</h2>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Multi-modal Synthesis Report</p>
          </div>
          <button 
            onClick={handleMidnightSync}
            disabled={isSyncing}
            className="text-[10px] font-black uppercase tracking-widest bg-black text-white px-5 py-2.5 rounded-full shadow-lg active:scale-95 transition disabled:opacity-50"
          >
            {isSyncing ? '深度分析中...' : '模拟凌晨同步'}
          </button>
        </div>

        {/* 温馨寄语发送区 */}
        <div className="bg-indigo-600 rounded-[32px] p-6 shadow-xl text-white relative overflow-hidden group">
           <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
           <div className="flex items-center space-x-3 mb-4">
             <i className="fas fa-heart text-red-400"></i>
             <h3 className="font-bold">向家人传递关怀</h3>
           </div>
           <textarea 
            value={careMessage}
            onChange={(e) => setCareMessage(e.target.value)}
            placeholder="写下你想说的话，数字人会代为转达..."
            className="w-full bg-white/10 border-0 rounded-2xl p-4 text-white placeholder-white/40 text-sm focus:ring-2 focus:ring-white/50 min-h-[80px] outline-none"
           />
           <button 
            onClick={handleSendMessage}
            disabled={isSending || !careMessage.trim()}
            className="w-full mt-4 bg-white text-indigo-600 font-bold py-3.5 rounded-2xl transition-all shadow-lg active:scale-95 disabled:opacity-50"
          >
             {isSending ? '正在送达...' : '发送寄语'}
           </button>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="w-10 h-10 border-4 border-indigo-500/10 border-t-indigo-500 rounded-full animate-spin"></div>
          </div>
        ) : reports.length === 0 ? (
          <div className="bg-white p-12 rounded-[40px] text-center border border-gray-100 shadow-sm">
            <p className="text-gray-500 text-sm font-bold">暂无深度分析报告</p>
            <p className="text-gray-300 text-[10px] mt-2 leading-relaxed">系统会在每天凌晨为您汇总家人的交流情感</p>
          </div>
        ) : (
          reports.map(report => (
            <div key={report.id} className="bg-white rounded-[44px] p-8 shadow-sm border border-gray-100 animate-fade-in relative overflow-hidden mb-6">
              <div className="flex justify-between items-start mb-8">
                <div className="flex items-center space-x-4">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border-2 ${getRoleBg(report.userRole)}`}>
                    <i className={`fas ${getRoleIcon(report.userRole)} text-2xl`}></i>
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-[10px] text-indigo-600 font-black uppercase tracking-widest">{report.date} 报告</span>
                      <span className="bg-gray-100 text-gray-400 text-[9px] font-black px-2 py-0.5 rounded-full">交流 {report.interactionCount} 次</span>
                    </div>
                    <h3 className="text-2xl font-black text-gray-900">{report.userName} 的主状态</h3>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                 <div className="inline-block bg-indigo-600 text-white text-xs font-black px-6 py-2 rounded-2xl shadow-lg mb-4">
                   {report.overallMood}
                 </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center mb-8">
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="80%" data={formatChartData(report.details)}>
                      <PolarGrid stroke="#f1f5f9" />
                      <PolarAngleAxis dataKey="subject" tick={{fontSize: 10, fontWeight: 800, fill: '#94a3b8'}} />
                      <RadarArea name="情绪" dataKey="A" stroke="#4f46e5" fill="#6366f1" fillOpacity={0.3} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                
                <div className="space-y-4">
                   <div className="bg-amber-50 rounded-3xl p-5 border border-amber-100">
                    <h4 className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-2 flex items-center">
                      <i className="fas fa-wave-square mr-2"></i> 情绪波动趋势
                    </h4>
                    <p className="text-xs text-amber-800 leading-relaxed font-bold">{report.trend || '状态稳定'}</p>
                  </div>
                  <div className="bg-gray-50 rounded-3xl p-5 border border-transparent">
                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 flex items-center">
                      <i className="fas fa-file-alt mr-2"></i> 综合评价
                    </h4>
                    <p className="text-xs text-gray-600 leading-relaxed font-medium">{report.summary}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-green-50 rounded-[32px] p-6 border border-green-100 shadow-inner">
                <div className="flex items-center space-x-3 mb-3">
                  <div className="w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center text-[10px]">
                    <i className="fas fa-lightbulb"></i>
                  </div>
                  <h4 className="text-[10px] font-black text-green-700 uppercase tracking-widest">给家长的建议</h4>
                </div>
                <p className="text-sm text-green-800 font-bold italic tracking-tight">“{report.suggestions}”</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Reports;
