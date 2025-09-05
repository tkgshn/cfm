import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import type { Project, Holdings, ProjectId } from '@/lib/types'

type Props = {
  projects: Project[]
  holdings: Holdings
  className?: string
}

const fmt = (n: number) => n.toFixed(2)

export const UserPositionsAllCard: React.FC<Props> = ({ projects, holdings, className }) => {
  return (
    <Card className={`shadow ${className ?? ''}`}>
      <CardContent className="p-4 space-y-2">
        <div className="text-sm font-medium">あなたのポジション（全プロジェクト）</div>
        <div className="text-[11px] text-gray-600">Funded/Not Funded × UP/DOWN</div>
        <div className="divide-y">
          {projects.map((p) => {
            const h = holdings[p.id as ProjectId]
            return (
              <div key={p.id} className="py-2">
                <div className="text-sm font-medium mb-1">{p.name}</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-700">
                  <div>Funded UP</div>
                  <div className="text-right">{fmt(h.funded.UP)}</div>
                  <div>Funded DOWN</div>
                  <div className="text-right">{fmt(h.funded.DOWN)}</div>
                  <div>Not Funded UP</div>
                  <div className="text-right">{fmt(h.not_funded.UP)}</div>
                  <div>Not Funded DOWN</div>
                  <div className="text-right">{fmt(h.not_funded.DOWN)}</div>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

export default UserPositionsAllCard

