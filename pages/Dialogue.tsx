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
  // 新增：专门用来存摄像头流，不受页面渲染影响
  const userStreamRef = useRef<MediaStream | null>(null);

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
              if (!videoRef.current) return;

              // 1. 绑定视频流
              videoRef.current.srcObject = stream;
              
              // 2. 核心修改：强制开启音频的“三板斧”
              // 第一斧：确保属性层面的静音是关闭的
              videoRef.current.muted = false; 

              // 第二斧：尝试播放
              videoRef.current.play().then(() => {
                  console.log('视频开始播放');
                  // 第三斧：再次强制解除静音（防止浏览器自动给静音了）
                  videoRef.current.muted = false;
                  videoRef.current.volume = 1.0; // 拉满音量
              }).catch(e => {
                  console.error('播放报错:', e);
                  // 如果报错 NotAllowedError，说明浏览器拦截了声音
                  // 这种情况下，我们需要先静音播放，让画面动起来，然后引导用户点一下页面
                  if (e.name === 'NotAllowedError') {
                      console.log('浏览器阻止了自动播放音频，尝试静音播放...');
                      videoRef.current.muted = true;
                      videoRef.current.play();
                      // 这里可以弹个提示告诉用户：“请点击屏幕任意位置开启声音”
                  }
              });
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

  useEffect(() => {
    if (isConnected && userVideoRef.current && userStreamRef.current) {
      userVideoRef.current.srcObject = userStreamRef.current;
      userVideoRef.current.muted = true; // 本地预览静音
    }
  }, [isConnected]);

  // 2. 启动连接
const startAgentSession = async () => {
    if (!agentManager) return;
    setIsConnecting(true);
    setStatusMessage('正在检查设备...'); // 修改提示

    try {
        // 1. 获取流
        const userStream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: { echoCancellation: true, noiseSuppression: true } 
        });

        // 关键修改：把流存到 Ref 里，而不是直接给 DOM
        userStreamRef.current = userStream;

        setStatusMessage('正在连接 D-ID 服务...');
        await agentManager.connect();
        
        // 3. 处理音频上下文 (放在最后)
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        // 如果之前被浏览器静音了，这里再试一次解除
        if (videoRef.current) {
            videoRef.current.muted = false;
        }

    } catch (err: any) {
        console.error('Connect error:', err);
        setIsConnecting(false);
        
        // 给用户更友好的错误提示
        if (err.name === 'NotReadableError') {
            setStatusMessage('麦克风被占用，请关闭其他占用麦克风的软件');
            alert('无法访问麦克风/摄像头。请检查是否被 Zoom/腾讯会议 等软件占用，或检查 Windows 隐私设置。');
        } else if (err.name === 'NotAllowedError') {
            setStatusMessage('请允许浏览器访问摄像头和麦克风');
        } else {
            setStatusMessage('连接失败，请重试');
        }
    }
  };

  // 3. 录音控制 (保持逻辑，但修改发送部分)
const startRecording = () => {
    // 1. 直接检查 Ref 里的流
    if (!userStreamRef.current) {
      console.error("没有检测到媒体流，尝试重新获取...");
      // 容错：如果真的没了，这里可以加个重新获取的逻辑，或者直接报错提示
      alert("无法录音：未检测到麦克风信号，请刷新页面重试。");
      return;
    }
    
    setIsRecording(true);
    setTranscription('');
    recordedChunksRef.current = [];
    
    // 2. 从 Ref 中提取音频
    const stream = userStreamRef.current;
    const audioTrack = stream.getAudioTracks()[0];
    
    if (!audioTrack) {
        alert("错误：流中没有音频轨道，请检查麦克风权限。");
        setIsRecording(false);
        return;
    }

    const audioStream = new MediaStream([audioTrack]);
    const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
    const options = mimeType ? { mimeType } : {};
    
    try {
        const recorder = new MediaRecorder(audioStream, options);
        mediaRecorderRef.current = recorder;
        
        recorder.ondataavailable = (e) => { 
            if (e.data.size > 0) recordedChunksRef.current.push(e.data); 
        };
        
        recorder.onstop = async () => {
            const audioBlob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
            await apiService.queueAudioForAnalysis(user.id, audioBlob);
        };
        
        recorder.start();
        if (recognitionRef.current) recognitionRef.current.start();
    } catch (e) {
        console.error("Recorder error:", e);
        alert("录音启动失败，请查看控制台。");
        setIsRecording(false);
    }
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
    <div className="h-screen bg-black flex flex-col p-4 md:p-6 overflow-hidden relative">
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

      <div className="relative flex-1 rounded-[32px] md:rounded-[48px] overflow-hidden bg-zinc-900 border border-white/5 shadow-2xl max-h-[70vh] min-h-0">
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

      <div className="mt-4 md:mt-6 shrink-0 pb-2">
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