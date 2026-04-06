import { ReactNode } from 'react';
import { X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizes = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
};

export default function Modal({ isOpen, onClose, title, children, size = 'md' }: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Fechar"
        onClick={onClose}
      />
      <div
        className={`relative bg-white shadow-xl w-full sm:mx-auto ${sizes[size]} max-h-[min(92dvh,100%)] sm:max-h-[90vh] flex flex-col rounded-t-2xl sm:rounded-xl`}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 shrink-0 gap-2">
          <h2 className="text-base sm:text-lg font-semibold text-gray-800 truncate pr-2">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 touch-manipulation shrink-0"
          >
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-4 min-h-0 overscroll-contain">{children}</div>
      </div>
    </div>
  );
}
