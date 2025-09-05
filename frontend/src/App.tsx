import React, { useEffect, useMemo, useState } from 'react'
import { marked } from 'marked'
import { InfoIcon } from '@/components/ui/icons'
import Home from '@/pages/Home'
import MarketPage from '@/pages/MarketPage'
import Portfolio from '@/pages/Portfolio'
import { markets } from '@/lib/markets'
import type { Account, BaseHoldings, Holdings, ProjectId } from '@/lib/types'

type Route = { name: 'home' } | { name: 'market'; id: string } | { name: 'portfolio' }

const parseHash = (): Route => {
  const h = window.location.hash.replace(/^#/, '')
  const m = h.match(/^market\/(.+)$/)
  if (m) return { name: 'market', id: m[1] }
  if (h === 'portfolio') return { name: 'portfolio' }
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
  // アカウントの永続化
  const ACCOUNTS_KEY = 'cfm:accounts:v1'
  const ACTIVE_ID_KEY = 'cfm:activeAccountId:v1'
  useEffect(() => {
    try {
      const raw = localStorage.getItem(ACCOUNTS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed) && parsed.length) setAccounts(parsed)
      }
      const aid = localStorage.getItem(ACTIVE_ID_KEY)
      if (aid) setActiveAccountId(aid)
    } catch {}
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts))
      localStorage.setItem(ACTIVE_ID_KEY, activeAccountId)
    } catch {}
  }, [accounts, activeAccountId])
  useEffect(() => {
    const onHash = () => setRoute(parseHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // ===== 総資産（ポジション即時売却想定）の時価評価 =====
  const lmsrCost = (qUp: number, qDown: number, b: number) => b * Math.log(Math.exp((qUp || 0) / (b || 180)) + Math.exp((qDown || 0) / (b || 180)))
  const priceUp = (qUp: number, qDown: number, b: number) => {
    const eU = Math.exp((qUp || 0) / (b || 180))
    const eD = Math.exp((qDown || 0) / (b || 180))
    return eU / (eU + eD)
  }
  const [projectsVersion, setProjectsVersion] = useState(0)
  useEffect(() => {
    const onProjects = () => setProjectsVersion(v => v + 1)
    window.addEventListener('cfm:projects-updated', onProjects as any)
    return () => window.removeEventListener('cfm:projects-updated', onProjects as any)
  }, [])
  const activeMarketId = route.name === 'market' ? route.id : 'default'
  const totalAssets = useMemo(() => {
    const a = activeAccount
    if (!a) return 0
    let total = a.balance
    let projects: any[] = []
    try {
      const raw = localStorage.getItem(`cfm:projects:${activeMarketId}`)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) projects = parsed
      }
    } catch {}
    const findP = (pid: string) => projects.find((p) => p.id === pid)
    const pids: ProjectId[] = ['ascoe', 'civichat', 'handbook', 'yadokari']
    for (const pid of pids) {
      const p = findP(pid)
      // funded マーケットの売却想定
      if (p?.markets?.funded) {
        let qU = p.markets.funded.qUp || 0
        let qD = p.markets.funded.qDown || 0
        const b = p.markets.funded.b || 180
        const sellUp = a.holdings[pid].funded.UP
        if (sellUp > 0) {
          const pre = lmsrCost(qU, qD, b)
          const qU2 = qU - sellUp
          const post = lmsrCost(qU2, qD, b)
          total += pre - post
          qU = qU2
        }
        const sellDown = a.holdings[pid].funded.DOWN
        if (sellDown > 0) {
          const pre = lmsrCost(qU, qD, b)
          const qD2 = qD - sellDown
          const post = lmsrCost(qU, qD2, b)
          total += pre - post
          qD = qD2
        }
      } else {
        const pUpF = 0.5
        total += a.holdings[pid].funded.UP * pUpF
        total += a.holdings[pid].funded.DOWN * (1 - pUpF)
      }
      // not_funded マーケットの売却想定
      if (p?.markets?.not_funded) {
        let qU = p.markets.not_funded.qUp || 0
        let qD = p.markets.not_funded.qDown || 0
        const b = p.markets.not_funded.b || 180
        const sellUp = a.holdings[pid].not_funded.UP
        if (sellUp > 0) {
          const pre = lmsrCost(qU, qD, b)
          const qU2 = qU - sellUp
          const post = lmsrCost(qU2, qD, b)
          total += pre - post
          qU = qU2
        }
        const sellDown = a.holdings[pid].not_funded.DOWN
        if (sellDown > 0) {
          const pre = lmsrCost(qU, qD, b)
          const qD2 = qD - sellDown
          const post = lmsrCost(qU, qD2, b)
          total += pre - post
        }
      } else {
        const pUpN = 0.5
        total += a.holdings[pid].not_funded.UP * pUpN
        total += a.holdings[pid].not_funded.DOWN * (1 - pUpN)
      }
    }
    return total
  }, [activeAccount, activeMarketId, projectsVersion])

  // 使い方モーダル（ヘッダー）: public/howto.md から生成
  const [helpOpen, setHelpOpen] = useState(false)
  const [helpPage, setHelpPage] = useState(0)
  const [helpSections, setHelpSections] = useState<{ title: string; bodyHtml: string }[]>([])
  useEffect(() => {
    // 初回のみ取得
    fetch('/howto.md')
      .then((r) => r.text())
      .then((txt) => {
        const secs: { title: string; bodyHtml: string }[] = []
        const lines = txt.split(/\r?\n/)
        let current: { title: string; bodyLines: string[] } | null = null
        for (const raw of lines) {
          const line = raw.trimEnd()
          if (line.startsWith('## ')) {
            if (current) secs.push({ title: current.title, bodyHtml: marked.parse(current.bodyLines.join('\n').trim()) as string })
            current = { title: line.replace(/^##\s+/, ''), bodyLines: [] }
          } else {
            if (!current) {
              // Skip top-level title (# ...) and prologue until first ##
              continue
            }
            current.bodyLines.push(raw)
          }
        }
        if (current) secs.push({ title: current.title, bodyHtml: marked.parse(current.bodyLines.join('\n').trim()) as string })
        setHelpSections(secs)
        setHelpPage(0)
      })
      .catch(() => setHelpSections([]))
  }, [])

  // 検索バー（ヘッダー）
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchResults = useMemo(() => {
    const q = search.trim()
    if (!q) return [] as typeof markets
    const lower = q.toLowerCase()
    return markets.filter(m =>
      m.name.toLowerCase().includes(lower) ||
      m.title.toLowerCase().includes(lower) ||
      (m.overview?.toLowerCase().includes(lower) ?? false)
    )
  }, [search])
  const goToMarket = (id: string) => {
    setSearch('')
    setSearchOpen(false)
    window.location.hash = `market/${id}`
  }

  const Header = () => (
    <div className="w-full border-b bg-white sticky top-0 z-10">
      <div className="mx-auto max-w-7xl px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="#" className="text-sm font-semibold hover:opacity-80">条件付き市場のシミュレーション</a>
          <div className="relative">
            <input
              type="text"
              className="h-8 w-48 md:w-64 border rounded px-2 text-xs"
              placeholder="市場を検索"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setSearchOpen(true) }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={(e) => { if (e.key === 'Enter' && searchResults[0]) goToMarket(searchResults[0].id) }}
              onBlur={() => setTimeout(() => setSearchOpen(false), 120)}
            />
            {searchOpen && searchResults.length > 0 && (
              <div className="absolute z-20 mt-1 w-full bg-white border rounded shadow text-xs max-h-64 overflow-auto">
                {searchResults.map((m) => (
                  <button key={m.id} className="w-full text-left px-2 py-1 hover:bg-gray-50" onMouseDown={(e) => e.preventDefault()} onClick={() => goToMarket(m.id)}>
                    <div className="font-medium truncate">{m.name}</div>
                    <div className="text-[10px] text-gray-500 truncate">{m.title}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="text-xs inline-flex items-center gap-1 hover:underline" onClick={() => { setHelpPage(0); setHelpOpen(true) }}>
            <InfoIcon className="h-4 w-4" />
            <span>使い方</span>
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600">総資産: <a className="underline font-semibold" href="#portfolio">{totalAssets.toFixed(2)}</a> USDC</span>
          <span className="text-xs text-gray-600">残高: <a className="underline font-semibold" href="#portfolio">{activeAccount?.balance.toFixed(2)}</a> USDC</span>
          <span className="text-xs text-gray-600"></span>
          <select className="h-8 border rounded px-2 text-xs" value={activeAccountId} onChange={(e) => setActiveAccountId(e.target.value)}>
            {accounts.map((a) => (<option key={a.id} value={a.id}>{a.name}{a.isAdmin ? ' 管理者' : ''}</option>))}
          </select>
          {activeAccount?.isAdmin && (
            <span className="text-[10px] font-semibold text-amber-900 bg-amber-200 border border-amber-300 rounded px-2 py-0.5">管理者</span>
          )}
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
            {helpOpen && helpSections.length > 0 && (
              <div className="fixed inset-0 z-50 flex items-center justify-center">
                <div className="absolute inset-0 bg-black/50" onClick={() => setHelpOpen(false)} />
                <div
                  className="relative bg-white/95 backdrop-blur rounded-lg shadow-xl w-[92vw] max-w-lg p-5 md:p-6 space-y-3"
              onClick={() => { if (helpPage === helpSections.length - 1) setHelpOpen(false); else setHelpPage((p) => p + 1) }}
                >
                  <button aria-label="閉じる" className="absolute top-2 right-2 text-gray-600 hover:text-black" onClick={(e) => { e.stopPropagation(); setHelpOpen(false) }}>✕</button>
              <div className="text-xs text-gray-500">{helpPage + 1}/{helpSections.length}</div>
              <div className="space-y-2">
                <div className="text-base font-medium">{helpSections[helpPage].title}</div>
                <div className="prose prose-sm max-w-none text-gray-800" dangerouslySetInnerHTML={{ __html: helpSections[helpPage].bodyHtml }} />
              </div>
              <div className="flex items-center justify-end pt-2 gap-2">
                <button className="h-8 px-3 text-xs border rounded" onClick={(e) => { e.stopPropagation(); setHelpPage((p) => (p - 1 + helpSections.length) % helpSections.length) }}>前へ</button>
                <button className="h-8 px-3 text-xs border rounded bg-black text-white" onClick={(e) => { e.stopPropagation(); helpPage === helpSections.length - 1 ? setHelpOpen(false) : setHelpPage((p) => p + 1) }}>{helpPage === helpSections.length - 1 ? '閉じる' : '次へ'}</button>
              </div>
                </div>
              </div>
            )}
      </div>
    )
  }
  if (route.name === 'portfolio') {
    return (
      <div>
        <Header />
        <Portfolio account={activeAccount} />
      </div>
    )
  }
  return (
    <div>
      <Header />
      <Home />
      {helpOpen && helpSections.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setHelpOpen(false)} />
          <div
            className="relative bg-white/95 backdrop-blur rounded-lg shadow-xl w-[92vw] max-w-lg p-5 md:p-6 space-y-3"
            onClick={() => { if (helpPage === helpSections.length - 1) setHelpOpen(false); else setHelpPage((p) => p + 1) }}
          >
            <button aria-label="閉じる" className="absolute top-2 right-2 text-gray-600 hover:text-black" onClick={(e) => { e.stopPropagation(); setHelpOpen(false) }}>✕</button>
            <div className="text-xs text-gray-500">{helpPage + 1}/{helpSections.length}</div>
            <div className="space-y-2">
              <div className="text-base font-medium">{helpSections[helpPage].title}</div>
              <div className="prose prose-sm max-w-none text-gray-800" dangerouslySetInnerHTML={{ __html: helpSections[helpPage].bodyHtml }} />
            </div>
            <div className="flex items-center justify-end pt-2 gap-2">
              <button className="h-8 px-3 text-xs border rounded" onClick={(e) => { e.stopPropagation(); setHelpPage((p) => (p - 1 + helpSections.length) % helpSections.length) }}>前へ</button>
              <button className="h-8 px-3 text-xs border rounded bg-black text-white" onClick={(e) => { e.stopPropagation(); helpPage === helpSections.length - 1 ? setHelpOpen(false) : setHelpPage((p) => p + 1) }}>{helpPage === helpSections.length - 1 ? '閉じる' : '次へ'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
