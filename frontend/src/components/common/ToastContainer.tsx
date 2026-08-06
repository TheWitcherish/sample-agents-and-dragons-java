import { createPortal } from 'react-dom';
import Toast from './Toast';
import type { ToastType } from './Toast';
import styles from './ToastContainer.module.css';

export interface ToastData {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContainerProps {
  toasts: ToastData[];
  onRemoveToast: (id: string) => void;
}

const ToastContainer = ({ toasts, onRemoveToast }: ToastContainerProps) => {
  if (toasts.length === 0) return null;

  return createPortal(
    <div className={styles.toastContainer}>
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          id={toast.id}
          type={toast.type}
          title={toast.title}
          message={toast.message}
          duration={toast.duration}
          onClose={onRemoveToast}
        />
      ))}
    </div>,
    document.body
  );
};

export default ToastContainer;