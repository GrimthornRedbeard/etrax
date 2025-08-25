import { apiClient } from './api';
import { Equipment, Transaction, User } from '@shared/types';

export interface VoiceCommandData {
  transcript: string;
  confidence?: number;
  language?: string;
  context?: {
    currentPage?: string;
    selectedEquipment?: string[];
    activeFilters?: Record<string, any>;
  };
  metadata?: {
    audioBlob?: Blob;
    duration?: number;
    timestamp?: string;
  };
}

export interface VoiceCommandResult {
  success: boolean;
  intent: string;
  entities: Record<string, any>;
  actions: Array<{
    type: 'navigate' | 'execute' | 'confirm' | 'display';
    payload: any;
    description: string;
  }>;
  response: string;
  confidence: number;
  needsConfirmation?: boolean;
  confirmationPrompt?: string;
}

export interface VoiceBatchOperation {
  id: string;
  commands: VoiceCommandData[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
  results: VoiceCommandResult[];
  totalCommands: number;
  processedCommands: number;
  failedCommands: number;
  createdAt: string;
  completedAt?: string;
}

export interface VoiceSettings {
  language: string;
  autoStart: boolean;
  continuousListening: boolean;
  noiseReduction: boolean;
  confidenceThreshold: number;
  timeoutSeconds: number;
  maxRetries: number;
  customCommands: VoiceCustomCommand[];
  enabledIntents: string[];
}

export interface VoiceCustomCommand {
  id: string;
  name: string;
  phrases: string[];
  action: {
    type: 'api_call' | 'navigation' | 'form_fill' | 'search';
    endpoint?: string;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    params?: Record<string, any>;
    url?: string;
    formFields?: Record<string, any>;
    searchQuery?: string;
  };
  enabled: boolean;
  createdAt: string;
}

export interface VoiceAnalytics {
  totalCommands: number;
  successfulCommands: number;
  averageConfidence: number;
  mostUsedIntents: Array<{
    intent: string;
    count: number;
    successRate: number;
  }>;
  commandTrends: Array<{
    date: string;
    commands: number;
    successRate: number;
  }>;
  languageDistribution: Array<{
    language: string;
    count: number;
  }>;
  errorPatterns: Array<{
    error: string;
    count: number;
    examples: string[];
  }>;
}

export class VoiceService {
  private static recognition: SpeechRecognition | null = null;
  private static isListening = false;
  private static settings: VoiceSettings | null = null;

  // Core voice recognition
  static async initializeVoiceRecognition(): Promise<boolean> {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      console.warn('Speech recognition not supported');
      return false;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();

    const settings = await this.getVoiceSettings();
    
    this.recognition.continuous = settings.continuousListening;
    this.recognition.interimResults = true;
    this.recognition.lang = settings.language;
    this.recognition.maxAlternatives = 3;

    return true;
  }

  static async startListening(
    onResult: (transcript: string, isFinal: boolean) => void,
    onError?: (error: string) => void
  ): Promise<boolean> {
    if (!this.recognition) {
      const initialized = await this.initializeVoiceRecognition();
      if (!initialized) return false;
    }

    if (this.isListening) {
      this.stopListening();
    }

    return new Promise((resolve, reject) => {
      if (!this.recognition) {
        reject(false);
        return;
      }

      this.recognition.onresult = (event) => {
        const results = Array.from(event.results);
        const transcript = results
          .map(result => result[0].transcript)
          .join(' ');
        
        const isFinal = results[results.length - 1].isFinal;
        onResult(transcript, isFinal);
      };

      this.recognition.onerror = (event) => {
        this.isListening = false;
        const errorMessage = `Speech recognition error: ${event.error}`;
        if (onError) {
          onError(errorMessage);
        }
        reject(false);
      };

      this.recognition.onstart = () => {
        this.isListening = true;
        resolve(true);
      };

      this.recognition.onend = () => {
        this.isListening = false;
      };

      try {
        this.recognition.start();
      } catch (error) {
        reject(false);
      }
    });
  }

  static stopListening(): void {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
      this.isListening = false;
    }
  }

  static isCurrentlyListening(): boolean {
    return this.isListening;
  }

  // Command processing
  static async processVoiceCommand(data: VoiceCommandData): Promise<VoiceCommandResult> {
    return await apiClient.post('/voice/process', data);
  }

  static async processBatchCommands(commands: VoiceCommandData[]): Promise<VoiceBatchOperation> {
    return await apiClient.post('/voice/batch', { commands });
  }

  static async getBatchOperationStatus(batchId: string): Promise<VoiceBatchOperation> {
    return await apiClient.get(`/voice/batch/${batchId}`);
  }

  // Equipment operations via voice
  static async executeEquipmentCommand(
    command: string,
    equipmentIds: string[],
    options: {
      confirmationRequired?: boolean;
      context?: Record<string, any>;
    } = {}
  ): Promise<{
    success: boolean;
    results: Array<{
      equipmentId: string;
      action: string;
      result: any;
      error?: string;
    }>;
    message: string;
  }> {
    return await apiClient.post('/voice/equipment/execute', {
      command,
      equipmentIds,
      ...options,
    });
  }

  // Transaction operations via voice
  static async processTransactionCommand(data: {
    command: string;
    equipmentCode?: string;
    userEmail?: string;
    dueDate?: string;
    notes?: string;
    location?: string;
  }): Promise<{
    success: boolean;
    transaction?: Transaction;
    message: string;
    nextAction?: string;
  }> {
    return await apiClient.post('/voice/transaction', data);
  }

  // Search via voice
  static async voiceSearch(query: string, filters: {
    type?: 'equipment' | 'users' | 'transactions';
    limit?: number;
  } = {}): Promise<{
    results: {
      equipment?: Equipment[];
      users?: User[];
      transactions?: Transaction[];
    };
    query: string;
    totalResults: number;
  }> {
    return await apiClient.post('/voice/search', { query, ...filters });
  }

  // Custom commands
  static async getCustomCommands(): Promise<VoiceCustomCommand[]> {
    return await apiClient.get('/voice/commands/custom');
  }

  static async createCustomCommand(command: Omit<VoiceCustomCommand, 'id' | 'createdAt'>): Promise<VoiceCustomCommand> {
    return await apiClient.post('/voice/commands/custom', command);
  }

  static async updateCustomCommand(id: string, updates: Partial<VoiceCustomCommand>): Promise<VoiceCustomCommand> {
    return await apiClient.put(`/voice/commands/custom/${id}`, updates);
  }

  static async deleteCustomCommand(id: string): Promise<{ success: boolean; message: string }> {
    return await apiClient.delete(`/voice/commands/custom/${id}`);
  }

  static async testCustomCommand(id: string, testPhrase: string): Promise<{
    success: boolean;
    recognized: boolean;
    confidence: number;
    result?: any;
    message: string;
  }> {
    return await apiClient.post(`/voice/commands/custom/${id}/test`, { testPhrase });
  }

  // Settings management
  static async getVoiceSettings(): Promise<VoiceSettings> {
    if (this.settings) return this.settings;
    
    try {
      this.settings = await apiClient.get('/voice/settings');
      return this.settings;
    } catch (error) {
      // Return default settings if API fails
      this.settings = {
        language: 'en-US',
        autoStart: false,
        continuousListening: false,
        noiseReduction: true,
        confidenceThreshold: 0.7,
        timeoutSeconds: 10,
        maxRetries: 3,
        customCommands: [],
        enabledIntents: [
          'checkout_equipment',
          'checkin_equipment',
          'search_equipment',
          'view_dashboard',
          'create_report',
        ],
      };
      return this.settings;
    }
  }

  static async updateVoiceSettings(settings: Partial<VoiceSettings>): Promise<VoiceSettings> {
    const updatedSettings = await apiClient.put('/voice/settings', settings);
    this.settings = updatedSettings;
    
    // Update recognition settings if recognition is initialized
    if (this.recognition) {
      this.recognition.lang = updatedSettings.language;
      this.recognition.continuous = updatedSettings.continuousListening;
    }
    
    return updatedSettings;
  }

  // Training and analytics
  static async getVoiceAnalytics(filters: {
    startDate?: string;
    endDate?: string;
    intent?: string;
    language?: string;
  } = {}): Promise<VoiceAnalytics> {
    const params = new URLSearchParams();
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      }
    });

    return await apiClient.get(`/voice/analytics?${params.toString()}`);
  }

  static async exportVoiceData(filters: {
    startDate?: string;
    endDate?: string;
    format?: 'csv' | 'xlsx';
    includeAudio?: boolean;
  } = {}): Promise<Blob> {
    const params = new URLSearchParams();
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined) {
        params.set(key, value.toString());
      }
    });

    const response = await apiClient.getRawClient().get(`/voice/export?${params.toString()}`, {
      responseType: 'blob',
    });

    return response.data;
  }

  static async trainVoiceModel(trainingData: {
    commands: Array<{
      phrase: string;
      intent: string;
      entities?: Record<string, any>;
    }>;
    language?: string;
  }): Promise<{
    success: boolean;
    modelId: string;
    accuracy: number;
    message: string;
  }> {
    return await apiClient.post('/voice/training', trainingData);
  }

  // Utility methods
  static getSupportedLanguages(): Array<{ code: string; name: string; nativeName: string }> {
    return [
      { code: 'en-US', name: 'English (US)', nativeName: 'English (US)' },
      { code: 'en-GB', name: 'English (UK)', nativeName: 'English (UK)' },
      { code: 'es-ES', name: 'Spanish (Spain)', nativeName: 'Español (España)' },
      { code: 'es-MX', name: 'Spanish (Mexico)', nativeName: 'Español (México)' },
      { code: 'fr-FR', name: 'French', nativeName: 'Français' },
      { code: 'de-DE', name: 'German', nativeName: 'Deutsch' },
      { code: 'it-IT', name: 'Italian', nativeName: 'Italiano' },
      { code: 'pt-BR', name: 'Portuguese (Brazil)', nativeName: 'Português (Brasil)' },
      { code: 'ru-RU', name: 'Russian', nativeName: 'Русский' },
      { code: 'zh-CN', name: 'Chinese (Simplified)', nativeName: '中文(简体)' },
      { code: 'ja-JP', name: 'Japanese', nativeName: '日本語' },
      { code: 'ko-KR', name: 'Korean', nativeName: '한국어' },
    ];
  }

  static isVoiceSupported(): boolean {
    return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
  }

  static async checkMicrophonePermission(): Promise<'granted' | 'denied' | 'prompt'> {
    try {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      return result.state;
    } catch (error) {
      // Fallback: try to access microphone
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        return 'granted';
      } catch {
        return 'denied';
      }
    }
  }

  static validateVoiceCommand(command: string): {
    isValid: boolean;
    intent?: string;
    confidence: number;
    suggestions: string[];
  } {
    const commonIntents = [
      'checkout',
      'check out',
      'return',
      'check in',
      'search',
      'find',
      'show',
      'list',
      'report',
      'dashboard',
      'status',
      'help',
    ];

    const words = command.toLowerCase().split(' ');
    let bestMatch = '';
    let confidence = 0;

    for (const intent of commonIntents) {
      for (const word of words) {
        if (word.includes(intent) || intent.includes(word)) {
          const similarity = this.calculateSimilarity(word, intent);
          if (similarity > confidence) {
            confidence = similarity;
            bestMatch = intent;
          }
        }
      }
    }

    const suggestions = commonIntents
      .filter(intent => intent !== bestMatch)
      .slice(0, 3);

    return {
      isValid: confidence > 0.5,
      intent: bestMatch || undefined,
      confidence,
      suggestions,
    };
  }

  private static calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  private static levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  // Quick commands for common operations
  static async quickCheckout(equipmentCode: string, userEmail: string): Promise<Transaction> {
    const result = await this.processTransactionCommand({
      command: `checkout ${equipmentCode} to ${userEmail}`,
      equipmentCode,
      userEmail,
    });

    if (!result.success || !result.transaction) {
      throw new Error(result.message);
    }

    return result.transaction;
  }

  static async quickCheckin(equipmentCode: string): Promise<Transaction> {
    const result = await this.processTransactionCommand({
      command: `checkin ${equipmentCode}`,
      equipmentCode,
    });

    if (!result.success || !result.transaction) {
      throw new Error(result.message);
    }

    return result.transaction;
  }

  static async quickSearch(query: string): Promise<Equipment[]> {
    const result = await this.voiceSearch(query, { type: 'equipment', limit: 10 });
    return result.results.equipment || [];
  }
}