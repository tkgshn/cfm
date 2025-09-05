import React from 'react'
import type { Account, ProjectId } from '@/lib/types'
import UserPositionsAllCard from '@/components/UserPositionsAllCard'

const projectItems: { id: ProjectId; name: string }[] = [
  { id: 'ascoe', name: 'アスコエ' },
  { id: 'civichat', name: 'Civichat' },
  { id: 'handbook', name: 'お悩みハンドブック' },
  { id: 'yadokari', name: 'みつもりヤドカリくん' },
]

export default function Portfolio({ account }: { account: Account }) {
  return (
    <div className="min-h-dvh w-full bg-white">
      <div className="p-6 md:p-8">
        <div className="mx-auto max-w-7xl space-y-4">
          <nav aria-label="Breadcrumb" className="text-xs text-gray-600">
            <a className="underline hover:text-gray-900" href="#">ホーム</a>
            <span className="mx-1">/</span>
            <span className="text-gray-900">ポートフォリオ</span>
          </nav>
          <h1 className="text-lg font-medium">{account.name} のポートフォリオ</h1>
          <div>
            <UserPositionsAllCard items={projectItems} holdings={account.holdings} />
          </div>
        </div>
      </div>
    </div>
  )
}

