import { format, isValid, parseISO } from 'date-fns';

// Date utilities
export const formatDate = (date: Date | string, formatStr: string = 'MM/dd/yyyy'): string => {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return isValid(dateObj) ? format(dateObj, formatStr) : '';
};

export const formatDateTime = (date: Date | string): string => {
  return formatDate(date, 'MM/dd/yyyy HH:mm');
};

export const isExpired = (date: Date | string): boolean => {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return isValid(dateObj) && dateObj < new Date();
};

// String utilities
export const slugify = (text: string): string => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

export const capitalize = (text: string): string => {
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
};

export const truncate = (text: string, length: number = 50): string => {
  if (text.length <= length) return text;
  return text.substring(0, length).trim() + '...';
};

// QR Code utilities
export const generateQRCode = (schoolPrefix: string, equipmentId: string): string => {
  return `${schoolPrefix}-${equipmentId.slice(-8).toUpperCase()}`;
};

export const parseQRCode = (qrCode: string): { prefix: string; id: string } | null => {
  const parts = qrCode.split('-');
  if (parts.length !== 2) return null;
  return { prefix: parts[0], id: parts[1] };
};

// Equipment utilities
export const getStatusColor = (status: string): string => {
  const colors: Record<string, string> = {
    GREEN: '#22c55e',
    YELLOW: '#f59e0b',
    RED: '#ef4444',
    RETIRED: '#6b7280',
    LOST: '#7c2d12',
  };
  return colors[status] || '#6b7280';
};

export const getStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    GREEN: 'Available',
    YELLOW: 'Needs Attention',
    RED: 'Out of Service',
    RETIRED: 'Retired',
    LOST: 'Lost/Missing',
  };
  return labels[status] || status;
};

export const getConditionLabel = (condition: string): string => {
  const labels: Record<string, string> = {
    EXCELLENT: 'Excellent',
    GOOD: 'Good',
    FAIR: 'Fair',
    POOR: 'Poor',
    DAMAGED: 'Damaged',
  };
  return labels[condition] || condition;
};

// Validation utilities
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const isValidPhone = (phone: string): boolean => {
  const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
};

export const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

// Array utilities
export const groupBy = <T>(array: T[], key: keyof T): Record<string, T[]> => {
  return array.reduce((groups, item) => {
    const group = String(item[key]);
    return {
      ...groups,
      [group]: [...(groups[group] || []), item],
    };
  }, {} as Record<string, T[]>);
};

export const sortBy = <T>(array: T[], key: keyof T, order: 'asc' | 'desc' = 'asc'): T[] => {
  return [...array].sort((a, b) => {
    const aVal = a[key];
    const bVal = b[key];
    
    if (aVal < bVal) return order === 'asc' ? -1 : 1;
    if (aVal > bVal) return order === 'asc' ? 1 : -1;
    return 0;
  });
};

export const unique = <T>(array: T[], key?: keyof T): T[] => {
  if (!key) return [...new Set(array)];
  
  const seen = new Set();
  return array.filter((item) => {
    const value = item[key];
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
};

// Number utilities
export const formatCurrency = (amount: number, currency: string = 'USD'): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
};

export const formatNumber = (num: number, decimals: number = 0): string => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
};

// File utilities
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const getFileExtension = (filename: string): string => {
  return filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2);
};

export const isImageFile = (filename: string): boolean => {
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
  const extension = getFileExtension(filename).toLowerCase();
  return imageExtensions.includes(extension);
};

// Local storage utilities
export const storage = {
  get: <T>(key: string): T | null => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch {
      return null;
    }
  },
  
  set: <T>(key: string, value: T): void => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn('Failed to save to localStorage:', error);
    }
  },
  
  remove: (key: string): void => {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn('Failed to remove from localStorage:', error);
    }
  },
  
  clear: (): void => {
    try {
      localStorage.clear();
    } catch (error) {
      console.warn('Failed to clear localStorage:', error);
    }
  },
};

// Debounce utility
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  
  return (...args: Parameters<T>): void => {
    const later = () => {
      clearTimeout(timeoutId);
      func(...args);
    };
    
    clearTimeout(timeoutId);
    timeoutId = setTimeout(later, wait);
  };
};

// Deep clone utility
export const deepClone = <T>(obj: T): T => {
  return JSON.parse(JSON.stringify(obj));
};

// Generate random ID
export const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};