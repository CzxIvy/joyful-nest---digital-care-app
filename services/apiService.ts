
import { User, SentimentReport, ScheduleItem, HealthLog } from '../types';

const BASE_URL = 'http://localhost:3001/api';

export const apiService = {
  login: async (creds: any): Promise<User> => {
    const res = await fetch(`${BASE_URL}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(creds) });
    if (!res.ok) throw new Error('登录失败');
    return res.json();
  },

  register: async (data: any): Promise<User> => {
    const res = await fetch(`${BASE_URL}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) throw new Error('注册失败');
    return res.json();
  },

  queueVideoForAnalysis: async (userId: string, blob: Blob) => {
    const formData = new FormData();
    formData.append('video', blob, 'video.webm');
    formData.append('userId', userId);
    const res = await fetch(`${BASE_URL}/queue-video`, { method: 'POST', body: formData });
    return res.json();
  },

  // Added uploadImageSample to handle profile image uploads for digital human cloning
  uploadImageSample: async (userId: string, file: File): Promise<User> => {
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch(`${BASE_URL}/users/${userId}/image`, { method: 'POST', body: formData });
    if (!res.ok) throw new Error('上传形象失败');
    return res.json();
  },

  // Added uploadVoiceSample to handle voice sample uploads for digital human cloning
  uploadVoiceSample: async (userId: string, file: File): Promise<User> => {
    const formData = new FormData();
    formData.append('voice', file);
    const res = await fetch(`${BASE_URL}/users/${userId}/voice`, { method: 'POST', body: formData });
    if (!res.ok) throw new Error('上传音频失败');
    return res.json();
  },

  triggerMidnightSync: async () => {
    const res = await fetch(`${BASE_URL}/admin/midnight-sync`, { method: 'POST' });
    return res.json();
  },

  getReports: async (userIds?: string[]): Promise<any[]> => {
    let url = `${BASE_URL}/reports`;
    if (userIds && userIds.length > 0) {
      const params = new URLSearchParams();
      userIds.forEach(id => params.append('userIds', id));
      url += `?${params.toString()}`;
    }
    const res = await fetch(url);
    return res.json();
  },

  getUsersByPhones: async (phones: string[]): Promise<any[]> => {
    const res = await fetch(`${BASE_URL}/users/batch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phones }) });
    return res.json();
  },

  getHealthLogs: async (phone: string): Promise<HealthLog[]> => {
    const res = await fetch(`${BASE_URL}/health-logs/${phone}`);
    return res.json();
  },

  createHealthLog: async (data: Partial<HealthLog>) => {
    const res = await fetch(`${BASE_URL}/health-logs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    return res.json();
  },

  getSchedules: async (phone: string): Promise<ScheduleItem[]> => {
    const res = await fetch(`${BASE_URL}/schedules/${phone}`);
    return res.json();
  },

  createSchedule: async (data: Partial<ScheduleItem>) => {
    const res = await fetch(`${BASE_URL}/schedules`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    return res.json();
  },

  updateSchedule: async (id: string, data: Partial<ScheduleItem>) => {
    const res = await fetch(`${BASE_URL}/schedules/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    return res.json();
  },

  deleteSchedule: async (id: string) => {
    const res = await fetch(`${BASE_URL}/schedules/${id}`, { method: 'DELETE' });
    return res.json();
  },

  bindFamily: async (userId: string, targetPhone: string) => {
    const res = await fetch(`${BASE_URL}/bind-family`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, targetPhone }) });
    return res.json();
  },

  unbindFamily: async (userId: string, targetPhone: string) => {
    const res = await fetch(`${BASE_URL}/unbind-family`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, targetPhone }) });
    return res.json();
  },

  updateProfile: async (id: string, data: Partial<User>): Promise<User> => {
    const res = await fetch(`${BASE_URL}/users/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    return res.json();
  },

  sendMessage: async (data: any) => {
    const res = await fetch(`${BASE_URL}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    return res.json();
  },

  getPendingMessages: async (phone: string) => {
    const res = await fetch(`${BASE_URL}/messages/${phone}`);
    return res.json();
  },

  markMessageDelivered: async (id: string) => {
    await fetch(`${BASE_URL}/messages/${id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'delivered' }) });
  }
};
