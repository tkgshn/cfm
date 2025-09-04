import React, { createContext, useContext, useState } from 'react'

type Ctx = {
  value?: string
  setValue?: (v: string) => void
  open: boolean
  setOpen: (v: boolean) => void
}

const SelectCtx = createContext<Ctx | null>(null)

export const Select: React.FC<{
  value?: string
  onValueChange?: (v: string) => void
  children: React.ReactNode
}> = ({ value, onValueChange, children }) => {
  const [open, setOpen] = useState(false)
  const setValue = (v: string) => onValueChange?.(v)
  return (
    <SelectCtx.Provider value={{ value, setValue, open, setOpen }}>
      <div className="relative inline-block w-full">{children}</div>
    </SelectCtx.Provider>
  )
}

export const SelectTrigger: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className = '', ...props }) => {
  const ctx = useContext(SelectCtx)!
  return (
    <div
      className={`h-9 w-full rounded-md border border-gray-300 bg-white px-3 py-1 text-sm flex items-center justify-between ${className}`}
      onClick={() => ctx.setOpen(!ctx.open)}
      {...props}
    />
  )
}

export const SelectValue: React.FC<{ placeholder?: string; value?: string }> = ({ placeholder, value }) => {
  const ctx = useContext(SelectCtx)
  const v = value ?? ctx?.value
  return <span className="text-sm text-gray-700">{v ?? placeholder}</span>
}

export const SelectContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className = '', ...props }) => {
  const ctx = useContext(SelectCtx)!
  if (!ctx.open) return null
  return <div className={`absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white shadow ${className}`} {...props} />
}

export const SelectItem: React.FC<{
  value: string
  className?: string
  children: React.ReactNode
}> = ({ value, className = '', children }) => {
  const ctx = useContext(SelectCtx)!
  return (
    <div
      role="option"
      tabIndex={0}
      className={`cursor-pointer px-3 py-2 text-sm hover:bg-gray-100 ${className}`}
      onClick={() => {
        ctx.setValue?.(value)
        ctx.setOpen(false)
      }}
    >
      {children}
    </div>
  )
}
