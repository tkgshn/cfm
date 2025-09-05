import React from 'react'
import { Card, CardContent } from '@/components/ui/card'

type HoldingOneProject = {
  funded: { UP: number; DOWN: number }
  not_funded: { UP: number; DOWN: number }
}

export const UserPositionCard: React.FC<{ holding: HoldingOneProject; className?: string }> = ({ holding, className }) => {
  return (
    <Card className={`shadow ${className ?? ''}`}>
      <CardContent className="p-4">
        <div className="text-[11px] text-gray-600">あなたのポジション</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-700 pt-1">
          <div>Funded UP</div>
          <div className="text-right">{holding.funded.UP.toFixed(2)}</div>
          <div>Funded DOWN</div>
          <div className="text-right">{holding.funded.DOWN.toFixed(2)}</div>
          <div>Not Funded UP</div>
          <div className="text-right">{holding.not_funded.UP.toFixed(2)}</div>
          <div>Not Funded DOWN</div>
          <div className="text-right">{holding.not_funded.DOWN.toFixed(2)}</div>
        </div>
      </CardContent>
    </Card>
  )
}

export default UserPositionCard

