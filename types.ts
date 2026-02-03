
export enum UserRole {
  ELDERLY = 'elderly',
  CHILD = 'child',
  PARENT = 'parent'
}

export interface User {
  id: string;
  phone: string;
  name: string; // 新增姓名属性
  boundPhones: string[];
  role: UserRole;
  avatarUrl?: string;
  voiceSampleUrl?: string;
  did_voice_id?: string;
  did_image_url?: string;
}

export interface ScheduleItem {
  id: string;
  userId: string;
  title: string;
  time: string;
  type: 'medication' | 'life';
  status: 'pending' | 'completed';
  createdBy: string;
}

export interface HealthLog {
  id: string;
  userId: string;
  type: 'blood_pressure' | 'heart_rate' | 'blood_sugar';
  value: string;
  timestamp: string;
}

export interface SentimentReport {
  id: string;
  date: string;
  overallMood: string;
  summary: string;
  details: {
    happiness: number;
    sadness: number;
    anger: number;
    fear: number;
  };
  suggestions: string;
  videoUrl?: string;
}
