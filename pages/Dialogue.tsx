import React, { useState, useRef, useEffect } from 'react';
import { User } from '../types';
import { apiService } from '../services/apiService';
// 引入 D-ID SDK
import * as SDK from '@d-id/client-sdk';

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

const Dialogue: React.FC<{ user: User }> = ({ user }) => {
  // 状态管理
  const [agentManager, setAgentManager] = useState<any>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [statusMessage, setStatusMessage] = useState('点击开启 AI 数字人关怀');
  const [transcription, setTranscription] = useState('');
  const [pendingMessages, setPendingMessages] = useState<any[]>([]);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const userVideoRef = useRef<HTMLVideoElement>(null);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // 1. 初始化 Agent Manager 和 语音识别
  useEffect(() => {
    const initAgent = async () => {
      try {
        // 从后端获取配置 (避免将 Key 硬编码在前端)
        const config = await fetch('http://localhost:3001/api/did/config').then(res => res.json());
        
        if (!config.clientKey || !config.agentId) {
            console.error('缺少 D-ID 配置');
            return;
        }

        // 创建 SDK 实例
        const manager = await SDK.createAgentManager(config.agentId, {
          auth: { type: 'key', clientKey: config.clientKey },
          callbacks: {
            // SDK 核心回调：当视频流就绪时
            onSrcObjectReady: (stream: MediaStream) => {
              // 1. 核心检查：如果 videoRef 已经不在了，直接退出
              if (!videoRef.current) return;

              // 2. 绑定视频流
              videoRef.current.srcObject = stream;
              
              // 3. 安全播放逻辑
              // 只有当 video 元素确实连接在页面文档上时，才执行 play
              if (videoRef.current.isConnected) {
                videoRef.current.play().catch(e => {
                  // 忽略 "AbortError"，这是 React 开发模式下的常见噪音，不影响实际功能
                  if (e.name === 'AbortError') {
                    console.log('Video play aborted (safe to ignore)');
                    return;
                  }
                  console.error('Video play error:', e);
                });
              }
            },
            // SDK 核心回调：连接状态变化
            onConnectionStateChange: (state: string) => {
              console.log('D-ID Connection State:', state);
              if (state === 'connected') {
                setIsConnected(true);
                setIsConnecting(false);
                setStatusMessage('数字人已就绪');
              } else if (state === 'disconnected' || state === 'closed' || state === 'fail') {
                setIsConnected(false);
                setIsConnecting(false);
                setStatusMessage('连接已断开');
              }
            },
            // SDK 核心回调：视频播放状态 (IDLE/STREAMING)
            onVideoStateChange: (state: string) => {
                console.log('Video State:', state);
            },
            // 错误处理
            onError: (error: any, errorData: any) => {
                console.error('D-ID Error:', error, errorData);
                setStatusMessage(`错误: ${error.message || '未知错误'}`);
                setIsConnecting(false);
            }
          }
        });

        setAgentManager(manager);
      } catch (e) {
        console.error('Failed to init agent manager:', e);
      }
    };

    initAgent();

    // 初始化语音识别 (保持原有逻辑)
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'zh-CN';
      recognition.onresult = (event: any) => {
        let text = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          text += event.results[i][0].transcript;
        }
        setTranscription(text);
      };
      recognitionRef.current = recognition;
    }

    // 检查待办消息 (保持原有逻辑)
    const checkMessages = async () => {
      if (!user.phone) return;
      try {
        const msgs = await apiService.getPendingMessages(user.phone);
        setPendingMessages(msgs);
      } catch (e) { console.error(e); }
    };
    checkMessages();

    // 清理函数
    return () => {
      if (agentManager) {
        agentManager.disconnect();
      }
    };
  }, [user.phone]);

  // 2. 启动连接
  const startAgentSession = async () => {
    if (!agentManager) return;
    setIsConnecting(true);
    setStatusMessage('正在连接 D-ID 服务...');
    
    try {
        // SDK 一键连接
        await agentManager.connect();
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
      
        // 同时开启本地摄像头 (保持原有逻辑)
        const userStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (userVideoRef.current) userVideoRef.current.srcObject = userStream;
    } catch (err) {
        console.error('Connect error:', err);
        setIsConnecting(false);
        setStatusMessage('连接失败，请重试');
    }
  };

  // 3. 录音控制 (保持逻辑，但修改发送部分)
  const startRecording = () => {
    if (!userVideoRef.current?.srcObject) return;
    setIsRecording(true);
    setTranscription('');
    recordedChunksRef.current = [];
    
    // 媒体录制用于后续情感分析
    const recorder = new MediaRecorder(userVideoRef.current.srcObject as MediaStream, { mimeType: 'video/webm' });
    mediaRecorderRef.current = recorder;
    recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
    recorder.onstop = async () => {
      const videoBlob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
      await apiService.queueVideoForAnalysis(user.id, videoBlob);
    };
    recorder.start();
    recognitionRef.current?.start();
  };

  const stopRecording = async () => {
    setIsRecording(false);
    mediaRecorderRef.current?.stop();
    recognitionRef.current?.stop();
    // await sendToAgent("你好，请做一个自我介绍");
    // 延迟以确保获取完整的 transcription
    setTimeout(async () => {
      if (transcription.trim()) {
        await sendToAgent(transcription);
      }
    }, 500);
  };

  // 4. 发送消息给数字人 (核心修改)
  const sendToAgent = async (text: string) => {
    if (!agentManager || !isConnected) return;
    
    try {
      console.log('Sending to agent:', text);
      // SDK 提供的 speak 方法
      // await agentManager.speak({
      //   type: 'text',
      //   input: text
      // });

      await agentManager.chat(text);
    } catch (err) {
      console.error('Speak error:', err);
    }
  };

  const handleDeliveringMessage = async (msg: any) => {
    await sendToAgent(`家人发来一条寄语：“${msg.content}”。请转告我。`);
    await apiService.markMessageDelivered(msg.id);
    setPendingMessages(prev => prev.filter(m => m.id !== msg.id));
  };

  // ... (JSX 部分保持不变，UI 逻辑完全复用) ...
  return (
    <div className="min-h-screen bg-black flex flex-col p-6 overflow-hidden relative">
      {/* 你的原有 UI 代码保持不变 */}
      <div className="flex items-center justify-between mb-4 z-20">
        <div className="bg-white/10 px-4 py-2 rounded-full border border-white/5 flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
          <span className="text-[10px] text-white/60 font-black uppercase tracking-widest">{isConnected ? 'Agent Stream' : 'Disconnected'}</span>
        </div>
        {pendingMessages.length > 0 && (
          <div className="bg-indigo-600 text-white text-[10px] font-black px-4 py-1.5 rounded-full animate-bounce flex items-center">
            <i className="fas fa-envelope mr-2"></i>
            家信送达
          </div>
        )}
      </div>

      <div className="relative flex-1 rounded-[48px] overflow-hidden bg-zinc-900 border border-white/5 shadow-2xl">
        <video ref={videoRef} autoPlay playsInline className={`w-full h-full object-cover transition-opacity duration-700 ${isConnected ? 'opacity-100' : 'opacity-0'}`} />
        
        {isConnected && (
          <div className="absolute top-8 right-8 w-24 h-32 rounded-3xl overflow-hidden border-2 border-white/10 shadow-2xl z-30">
            <video ref={userVideoRef} autoPlay muted playsInline className="w-full h-full object-cover grayscale-[0.2]" />
            {isRecording && <div className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-lg"></div>}
          </div>
        )}

        {!isConnected && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-12 text-center">
            {isConnecting ? (
                <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-4"></div>
            ) : (
                <i className="fas fa-robot text-white/10 text-6xl mb-6"></i>
            )}
            <h3 className="text-white text-xl font-black mb-2">{isConnecting ? '正在唤醒...' : 'AI 数字人空间'}</h3>
            <p className="text-white/30 text-[10px] font-black uppercase tracking-widest leading-relaxed">
                {statusMessage}
            </p>
            </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 p-10 bg-gradient-to-t from-black via-black/60 to-transparent">
          <p className="text-white text-center text-lg font-medium tracking-tight drop-shadow-xl min-h-[3em] flex items-center justify-center">
            {transcription || (isConnected ? "我在听，您想聊点什么？" : "")}
          </p>
        </div>
      </div>

      <div className="mt-8">
        {!isConnected ? (
          <button onClick={startAgentSession} disabled={isConnecting} className="w-full bg-indigo-600 text-white font-black py-6 rounded-[32px] shadow-2xl active:scale-95 transition-all disabled:opacity-50">
            {isConnecting ? '初始化中...' : '启动对话'}
          </button>
        ) : (
          <button 
            onMouseDown={startRecording} onMouseUp={stopRecording}
            onTouchStart={startRecording} onTouchEnd={stopRecording}
            className={`w-full ${isRecording ? 'bg-red-500' : 'bg-white'} text-black font-black py-6 rounded-[32px] shadow-2xl active:scale-95 transition-all flex items-center justify-center space-x-4`}
          >
            <i className={`fas ${isRecording ? 'fa-stop-circle animate-pulse' : 'fa-microphone-lines text-xl'}`}></i>
            <span>{isRecording ? '正在倾听并录制...' : '按住说话'}</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default Dialogue;