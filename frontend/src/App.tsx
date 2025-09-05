import React, { useEffect, useMemo, useState } from 'react'
import Home from '@/pages/Home'
import MarketPage from '@/pages/MarketPage'
import { markets } from '@/lib/markets'
import type { Account, BaseHoldings, Holdings } from '@/lib/types'

type Route = { name: 'home' } | { name: 'market'; id: string }

const parseHash = (): Route => {
  const h = window.location.hash.replace(/^#/, '')
  const m = h.match(/^market\/(.+)$/)
  if (m) return { name: 'market', id: m[1] }
  return { name: 'home' }
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseHash())
  // アカウント状態をグローバル管理（ヘッダー共通化のため）
  const emptyHoldings = (): Holdings => ({
    ascoe: { funded: { UP: 0, DOWN: 0 }, not_funded: { UP: 0, DOWN: 0 } },
    civichat: { funded: { UP: 0, DOWN: 0 }, not_funded: { UP: 0, DOWN: 0 } },
    handbook: { funded: { UP: 0, DOWN: 0 }, not_funded: { UP: 0, DOWN: 0 } },
    yadokari: { funded: { UP: 0, DOWN: 0 }, not_funded: { UP: 0, DOWN: 0 } },
  })
  const emptyBase = (): BaseHoldings => ({
    ascoe: { funded: 0, not_funded: 0 },
    civichat: { funded: 0, not_funded: 0 },
    handbook: { funded: 0, not_funded: 0 },
    yadokari: { funded: 0, not_funded: 0 },
  })
  const [accounts, setAccounts] = useState<Account[]>([
    { id: 'admin', name: 'Admin', balance: 1000, isAdmin: true, holdings: emptyHoldings(), base: emptyBase() },
    { id: 'user1', name: 'User 1', balance: 1000, isAdmin: false, holdings: emptyHoldings(), base: emptyBase() },
    { id: 'user2', name: 'User 2', balance: 1000, isAdmin: false, holdings: emptyHoldings(), base: emptyBase() },
  ])
  const [activeAccountId, setActiveAccountId] = useState<string>('admin')
  const activeAccount = useMemo(() => accounts.find(a => a.id === activeAccountId)!, [accounts, activeAccountId])
  useEffect(() => {
    const onHash = () => setRoute(parseHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const Header = () => (
    <div className="w-full border-b bg-white sticky top-0 z-10">
      <div className="mx-auto max-w-7xl px-6 py-3 flex items-center justify-between">
        <a href="#" className="text-sm font-semibold hover:opacity-80">条件付き市場のシミュレーション</a>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600">アカウント</span>
          <select className="h-8 border rounded px-2 text-xs" value={activeAccountId} onChange={(e) => setActiveAccountId(e.target.value)}>
            {accounts.map((a) => (<option key={a.id} value={a.id}>{a.name}{a.isAdmin ? ' 管理者' : ''}</option>))}
          </select>
          {activeAccount?.isAdmin && (
            <span className="text-[10px] font-semibold text-amber-900 bg-amber-200 border border-amber-300 rounded px-2 py-0.5">管理者</span>
          )}
          <span className="text-xs text-gray-600">残高: <b>{activeAccount?.balance.toFixed(2)}</b> USDC</span>
        </div>
      </div>
    </div>
  )

  if (route.name === 'market') {
    const exists = markets.some((m) => m.id === route.id)
    if (!exists) return (
      <div>
        <Header />
        <div className="p-6 max-w-3xl mx-auto">指定のマーケットが見つかりません。<a className="underline" href="#">ホームへ</a></div>
      </div>
    )
    return (
      <div>
        <Header />
        <MarketPage
          marketId={route.id}
          accounts={accounts}
          setAccounts={setAccounts}
          activeAccountId={activeAccountId}
          setActiveAccountId={setActiveAccountId}
        />
      </div>
    )
  }
  return (
    <div>
      <Header />
      <Home />
    </div>
  )
}
