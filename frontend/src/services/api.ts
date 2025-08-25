import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import toast from 'react-hot-toast';

export interface ApiConfig {
  baseURL?: string;
  timeout?: number;
}

export interface ApiError {
  message: string;
  status?: number;
  code?: string;
  details?: any;
}

class ApiClient {
  private client: AxiosInstance;

  constructor(config: ApiConfig = {}) {
    this.client = axios.create({
      baseURL: config.baseURL || '/api',
      timeout: config.timeout || 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor to add auth token
    this.client.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('auth_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response: AxiosResponse) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Token expired or invalid
          localStorage.removeItem('auth_token');
          localStorage.removeItem('refresh_token');
          window.location.href = '/login';
          return Promise.reject(error);
        }

        // Handle other errors
        const apiError: ApiError = {
          message: error.response?.data?.message || error.message || 'An unexpected error occurred',
          status: error.response?.status,
          code: error.response?.data?.code,
          details: error.response?.data?.details,
        };

        // Show error toast for 4xx and 5xx errors
        if (error.response?.status >= 400) {
          toast.error(apiError.message);
        }

        return Promise.reject(apiError);
      }
    );
  }

  // HTTP Methods
  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get<T>(url, config);
    return response.data;
  }

  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.post<T>(url, data, config);
    return response.data;
  }

  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.put<T>(url, data, config);
    return response.data;
  }

  async patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.patch<T>(url, data, config);
    return response.data;
  }

  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.delete<T>(url, config);
    return response.data;
  }

  // File upload method
  async upload<T = any>(url: string, file: File, onProgress?: (progress: number) => void): Promise<T> {
    const formData = new FormData();
    formData.append('file', file);

    const config: AxiosRequestConfig = {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    };

    if (onProgress) {
      config.onUploadProgress = (progressEvent) => {
        if (progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(progress);
        }
      };
    }

    const response = await this.client.post<T>(url, formData, config);
    return response.data;
  }

  // Raw client for special cases
  getRawClient(): AxiosInstance {
    return this.client;
  }
}

// Export singleton instance
export const apiClient = new ApiClient({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 15000, // 15 seconds
});

// Export for creating custom instances if needed
export { ApiClient };