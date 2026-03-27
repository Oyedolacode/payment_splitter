import { useEffect } from 'react'
import { CheckIcon, XIcon, InfoIcon, AlertIcon } from './Icons'

interface ToastData {
  id: string
  message: string
  type: 'success' | 'error' | 'info' | 'warning'
}

interface ToastProps {
  toast: ToastData
  onClose: () => void
}

export function Toast({ toast, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000)
    return () => clearTimeout(timer)
  }, [onClose])

  const icons = {
    success: <CheckIcon className="w-4 h-4" />,
    error: <XIcon className="w-4 h-4" />,
    info: <InfoIcon className="w-4 h-4" />,
    warning: <AlertIcon className="w-4 h-4" />,
  }

  const colors = {
    success: 'bg-[#10b98110] border-[#10b98130] text-[#10b981]',
    error: 'bg-[#ef444410] border-[#ef444430] text-[#ef4444]',
    info: 'bg-[#2d31fa10] border-[#2d31fa30] text-[#2d31fa]',
    warning: 'bg-[#f59e0b10] border-[#f59e0b30] text-[#f59e0b]',
  }

  return (
    <div className={`p-4 pr-12 rounded-2xl border shadow-xl animate-slideIn relative pointer-events-auto min-w-[300px] backdrop-blur-md ${colors[toast.type]}`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5">{icons[toast.type]}</span>
        <p className="text-[13px] font-700 leading-tight">{toast.message}</p>
      </div>
      <button onClick={onClose} className="absolute top-4 right-4 opacity-50 hover:opacity-100 transition-opacity">
        <XIcon className="w-4 h-4" />
      </button>
    </div>
  )
}
