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

  // 使い方モーダル（ヘッダーから常時開ける）
  const [helpOpen, setHelpOpen] = useState(false)
  const [helpPage, setHelpPage] = useState(0)
  const helpPages: React.ReactNode[] = [
    (
      <div className="space-y-2">
        <div className="text-base font-medium">ようこそ</div>
        <p className="text-sm text-gray-700">各プロジェクトの「投資あり/なし」で1カ月後の申請数を予測し、上がる（UP）/下がる（DOWN）に賭けます。</p>
      </div>
    ),
    (
      <div className="space-y-2">
        <div className="text-base font-medium">シナリオと取引</div>
        <p className="text-sm text-gray-700">右のパネルでプロジェクトとシナリオを選び、金額を入力して購入します。スライダーで自分の予想を調整し、損益の目安を確認できます。</p>
      </div>
    ),
    (
      <div className="space-y-2">
        <div className="text-base font-medium">資金配分と清算</div>
        <p className="text-sm text-gray-700">予測期間後、予測インパクト最大のプロジェクトに1億円を配分し、その1カ月後の実測値で清算します。</p>
      </div>
    ),
  ]

  const Header = () => (
    <div className="w-full border-b bg-white sticky top-0 z-10">
      <div className="mx-auto max-w-7xl px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="#" className="text-sm font-semibold hover:opacity-80">条件付き市場のシミュレーション</a>
          <button className="h-7 px-2 text-xs border rounded hover:bg-gray-50" onClick={() => { setHelpPage(0); setHelpOpen(true) }}>使い方</button>
        </div>
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
        {helpOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={() => setHelpOpen(false)} />
            <div
              className="relative bg-white/95 backdrop-blur rounded-lg shadow-xl w-[92vw] max-w-lg p-5 md:p-6 space-y-3"
              onClick={() => { if (helpPage === helpPages.length - 1) setHelpOpen(false); else setHelpPage((p) => p + 1) }}
            >
              <button aria-label="閉じる" className="absolute top-2 right-2 text-gray-600 hover:text-black" onClick={(e) => { e.stopPropagation(); setHelpOpen(false) }}>✕</button>
              <div className="text-xs text-gray-500">クリックで次へ（{helpPage + 1}/{helpPages.length}）</div>
              {helpPages[helpPage]}
              <div className="flex items-center justify-end pt-2 gap-2">
                <button className="h-8 px-3 text-xs border rounded" onClick={(e) => { e.stopPropagation(); setHelpPage((p) => (p - 1 + helpPages.length) % helpPages.length) }}>前へ</button>
                <button className="h-8 px-3 text-xs border rounded bg-black text-white" onClick={(e) => { e.stopPropagation(); helpPage === helpPages.length - 1 ? setHelpOpen(false) : setHelpPage((p) => p + 1) }}>{helpPage === helpPages.length - 1 ? '閉じる' : '次へ'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }
  return (
    <div>
      <Header />
      <Home />
      {helpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setHelpOpen(false)} />
          <div
            className="relative bg-white/95 backdrop-blur rounded-lg shadow-xl w-[92vw] max-w-lg p-5 md:p-6 space-y-3"
            onClick={() => { if (helpPage === helpPages.length - 1) setHelpOpen(false); else setHelpPage((p) => p + 1) }}
          >
            <button aria-label="閉じる" className="absolute top-2 right-2 text-gray-600 hover:text-black" onClick={(e) => { e.stopPropagation(); setHelpOpen(false) }}>✕</button>
            <div className="text-xs text-gray-500">クリックで次へ（{helpPage + 1}/{helpPages.length}）</div>
            {helpPages[helpPage]}
            <div className="flex items-center justify-end pt-2 gap-2">
              <button className="h-8 px-3 text-xs border rounded" onClick={(e) => { e.stopPropagation(); setHelpPage((p) => (p - 1 + helpPages.length) % helpPages.length) }}>前へ</button>
              <button className="h-8 px-3 text-xs border rounded bg-black text-white" onClick={(e) => { e.stopPropagation(); helpPage === helpPages.length - 1 ? setHelpOpen(false) : setHelpPage((p) => p + 1) }}>{helpPage === helpPages.length - 1 ? '閉じる' : '次へ'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
