import { useEffect } from 'react';
import styles from './Toast.module.css';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  onClose: (id: string) => void;
}

const Toast = ({ id, type, title, message, duration = 5000, onClose }: ToastProps) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(id);
    }, duration);

    return () => clearTimeout(timer);
  }, [id, duration, onClose]);

  const getIcon = () => {
    switch (type) {
      case 'success':
        return '✅';
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      case 'info':
        return 'ℹ️';
      default:
        return 'ℹ️';
    }
  };

  return (
    <div className={`${styles.toast} ${styles[type]}`}>
      <div className={styles.toastContent}>
        <div className={styles.toastIcon}>
          {getIcon()}
        </div>
        <div className={styles.toastText}>
          <div className={styles.toastTitle}>{title}</div>
          {message && <div className={styles.toastMessage}>{message}</div>}
        </div>
        <button
          className={styles.toastClose}
          onClick={() => onClose(id)}
          aria-label="Close notification"
        >
          ×
        </button>
      </div>
      <div className={styles.toastProgress}>
        <div 
          className={styles.toastProgressBar}
          style={{ animationDuration: `${duration}ms` }}
        />
      </div>
    </div>
  );
};

export default Toast;