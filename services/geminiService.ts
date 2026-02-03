
import { GoogleGenAI, Type, Modality } from "@google/genai";

export const analyzeSentiment = async (transcription: string) => {
  // Fix: Strictly follow the guideline: Use process.env.GEMINI_API_KEY directly when initializing the client.
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Analyze the following user dialogue for emotions and provide a structured care report. User: "${transcription}"`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          overallMood: { type: Type.STRING },
          summary: { type: Type.STRING },
          scores: {
            type: Type.OBJECT,
            properties: {
              happiness: { type: Type.NUMBER },
              sadness: { type: Type.NUMBER },
              anger: { type: Type.NUMBER },
              fear: { type: Type.NUMBER },
            }
          },
          suggestions: { type: Type.STRING }
        }
      }
    }
  });

  return JSON.parse(response.text || "{}");
};

export const startLiveDialogue = async (callbacks: any) => {
  // Fix: Strictly follow the guideline: Use process.env.API_KEY directly when initializing the client.
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  // Note: Using the real-time audio flash model for the digital human interaction
  return ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-12-2025',
    callbacks,
    config: {
      responseModalities: [Modality.AUDIO],
      systemInstruction: "你是一个温暖、贴心的家庭AI数字人助手，正在和独自在家的老人或孩子交流。你的语气要温和、有耐心，多关心他们的身体和心情。",
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
      }
    }
  });
};
