import React from 'react'

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'outline' | 'ghost' | 'primary' | 'secondary' | 'destructive'
}

export const Button: React.FC<ButtonProps> = ({ variant = 'default', className = '', ...props }) => {
  const base = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none h-9 px-3'
  const styles = {
    default: 'bg-black text-white hover:bg-gray-800',
    outline: 'border border-gray-300 hover:bg-gray-50',
    ghost: 'hover:bg-gray-100',
    primary: 'bg-amber-600 text-white hover:bg-amber-700',
    secondary: 'bg-indigo-600 text-white hover:bg-indigo-700',
    destructive: 'bg-red-600 text-white hover:bg-red-700',
  } as const
  return <button className={`${base} ${styles[variant]} ${className}`} {...props} />
}
