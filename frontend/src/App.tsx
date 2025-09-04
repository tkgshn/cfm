import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  Label,
} from 'recharts'

type Scenario = 'funded' | 'not_funded'
type Side = 'UP' | 'DOWN'
type ProjectId = 'ascoe' | 'civichat' | 'handbook' | 'yadokari'
type Phase = 'open' | 'decided' | 'resolved'

type MarketState = { qUp: number; qDown: number; b: number }
type Project = {
  id: ProjectId
  name: string
  rangeMin: number
  rangeMax: number
  markets: Record<Scenario, MarketState>
}

type Holdings = Record<ProjectId, Record<Scenario, Record<Side, number>>>
type Account = {
  id: string
  name: string
  balance: number
  isAdmin: boolean
  holdings: Holdings
}

const DEFAULT_B = 180

const impliedValue = (p: number, min: number, max: number) => min + p * (max - min)
const clamp01 = (x: number) => Math.max(0.000001, Math.min(0.999999, x))
const nowTs = () => Date.now()

const lmsrCost = (qUp: number, qDown: number, b: number) => b * Math.log(Math.exp(qUp / b) + Math.exp(qDown / b))
const priceUp = (qUp: number, qDown: number, b: number) => {
  const eU = Math.exp(qUp / b)
  const eD = Math.exp(qDown / b)
  return eU / (eU + eD)
}
const tradeCost = (m: MarketState, side: Side, delta: number) => {
  const pre = lmsrCost(m.qUp, m.qDown, m.b)
  const qUp2 = m.qUp + (side === 'UP' ? delta : 0)
  const qDown2 = m.qDown + (side === 'DOWN' ? delta : 0)
  const post = lmsrCost(qUp2, qDown2, m.b)
  return { cost: post - pre, qUp2, qDown2, pre, post }
}
const qUpForTargetPrice = (qDown: number, b: number, p: number) => qDown - b * Math.log(1 / clamp01(p) - 1)

const initialProjects: Project[] = [
  { id: 'ascoe', name: 'アスコエ', rangeMin: 0, rangeMax: 10000, markets: { funded: { qUp: 0, qDown: 0, b: DEFAULT_B }, not_funded: { qUp: 0, qDown: 0, b: DEFAULT_B } } },
  { id: 'civichat', name: 'Civichat', rangeMin: 0, rangeMax: 10000, markets: { funded: { qUp: 0, qDown: 0, b: DEFAULT_B }, not_funded: { qUp: 0, qDown: 0, b: DEFAULT_B } } },
  { id: 'handbook', name: 'お悩みハンドブック', rangeMin: 0, rangeMax: 10000, markets: { funded: { qUp: 0, qDown: 0, b: DEFAULT_B }, not_funded: { qUp: 0, qDown: 0, b: DEFAULT_B } } },
  { id: 'yadokari', name: 'みつもりヤドカリくん', rangeMin: 0, rangeMax: 10000, markets: { funded: { qUp: 0, qDown: 0, b: DEFAULT_B }, not_funded: { qUp: 0, qDown: 0, b: DEFAULT_B } } },
]

function emptyHoldings(): Holdings {
  return {
    ascoe: { funded: { UP: 0, DOWN: 0 }, not_funded: { UP: 0, DOWN: 0 } },
    civichat: { funded: { UP: 0, DOWN: 0 }, not_funded: { UP: 0, DOWN: 0 } },
    handbook: { funded: { UP: 0, DOWN: 0 }, not_funded: { UP: 0, DOWN: 0 } },
    yadokari: { funded: { UP: 0, DOWN: 0 }, not_funded: { UP: 0, DOWN: 0 } },
  }
}

const initialAccounts: Account[] = [
  { id: 'admin', name: 'Admin', balance: 1000, isAdmin: true, holdings: emptyHoldings() },
  { id: 'user1', name: 'User 1', balance: 1000, isAdmin: false, holdings: emptyHoldings() },
  { id: 'user2', name: 'User 2', balance: 1000, isAdmin: false, holdings: emptyHoldings() },
]

export default function App() {
  const [projects, setProjects] = useState<Project[]>(initialProjects)
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts)
  const [activeAccountId, setActiveAccountId] = useState<string>('admin')
  const activeAccount = useMemo(() => accounts.find((a) => a.id === activeAccountId)!, [accounts, activeAccountId])

  const [selectedProject, setSelectedProject] = useState<ProjectId | null>(null)
  const [tradeScenario, setTradeScenario] = useState<Scenario>('funded')
  const [tradeSide, setTradeSide] = useState<Side>('UP')
  const [tradeShares, setTradeShares] = useState<number>(10)
  const [fundedTarget, setFundedTarget] = useState<number>(5000)
  const [notTarget, setNotTarget] = useState<number>(5000)

  const [phase, setPhase] = useState<Phase>('open')
  const [phaseMarkers, setPhaseMarkers] = useState<{ t: number; label: string }[]>([{ t: nowTs(), label: 'Open' }])
  const [frozenNot, setFrozenNot] = useState<Record<ProjectId, boolean>>({ ascoe: false, civichat: false, handbook: false, yadokari: false })
  const [frozenFundedZero, setFrozenFundedZero] = useState<Record<ProjectId, boolean>>({ ascoe: false, civichat: false, handbook: false, yadokari: false })
  const [resolution, setResolution] = useState<null | { winner: ProjectId; values: Record<ProjectId, { funded?: number; not_funded?: number }> }>(null)
  const [resolutionForm, setResolutionForm] = useState<Record<ProjectId, { funded?: number; not_funded?: number }>>({
    ascoe: { funded: 5000, not_funded: 5000 },
    civichat: { funded: 5000, not_funded: 5000 },
    handbook: { funded: 5000, not_funded: 5000 },
    yadokari: { funded: 5000, not_funded: 5000 },
  })

  type ImpactPoint = { t: number } & Record<ProjectId, number>
  const [impactHistory, setImpactHistory] = useState<ImpactPoint[]>(() => [{ t: nowTs(), ascoe: 0, civichat: 0, handbook: 0, yadokari: 0 }])
  type PerProjectPoint = { t: number; funded: Record<ProjectId, number>; notFunded: Record<ProjectId, number> }
  const [perProjectHistory, setPerProjectHistory] = useState<PerProjectPoint[]>(() => [{
    t: nowTs(),
    funded: { ascoe: 0, civichat: 0, handbook: 0, yadokari: 0 },
    notFunded: { ascoe: 0, civichat: 0, handbook: 0, yadokari: 0 },
  }])
  const tickerRef = useRef<number | null>(null)

  const getCurrentAbs = (p: Project, scenario: Scenario) => {
    const m = p.markets[scenario]
    const probUp = priceUp(m.qUp, m.qDown, m.b)
    return impliedValue(probUp, p.rangeMin, p.rangeMax)
  }

  useEffect(() => {
    if (!selectedProject) return
    const p = projects.find(x => x.id === selectedProject)!
    setFundedTarget(Math.round(getCurrentAbs(p, 'funded')))
    setNotTarget(Math.round(getCurrentAbs(p, 'not_funded')))
  }, [selectedProject])

  const snapshotImpactAbs = (ps: Project[]) => {
    const res: Record<ProjectId, number> = { ascoe: 0, civichat: 0, handbook: 0, yadokari: 0 }
    ps.forEach((p) => {
      const fu = priceUp(p.markets.funded.qUp, p.markets.funded.qDown, p.markets.funded.b)
      const nf = priceUp(p.markets.not_funded.qUp, p.markets.not_funded.qDown, p.markets.not_funded.b)
      res[p.id] = (fu - nf) * (p.rangeMax - p.rangeMin)
    })
    return res
  }
  const snapshotPerProject = (ps: Project[]): PerProjectPoint => {
    const funded: Record<ProjectId, number> = { ascoe: 0, civichat: 0, handbook: 0, yadokari: 0 }
    const notFunded: Record<ProjectId, number> = { ascoe: 0, civichat: 0, handbook: 0, yadokari: 0 }
    ps.forEach((p) => {
      const fuP = priceUp(p.markets.funded.qUp, p.markets.funded.qDown, p.markets.funded.b)
      const nfP = priceUp(p.markets.not_funded.qUp, p.markets.not_funded.qDown, p.markets.not_funded.b)
      funded[p.id] = impliedValue(fuP, p.rangeMin, p.rangeMax)
      notFunded[p.id] = impliedValue(nfP, p.rangeMin, p.rangeMax)
    })
    return { t: nowTs(), funded, notFunded }
  }

  useEffect(() => {
    const t = nowTs()
    const imp = snapshotImpactAbs(projects)
    setImpactHistory((h) => [...h, { t, ascoe: imp.ascoe, civichat: imp.civichat, handbook: imp.handbook, yadokari: imp.yadokari }])
    setPerProjectHistory((h) => [...h, snapshotPerProject(projects)])
  }, [projects])

  useEffect(() => {
    if (tickerRef.current) window.clearInterval(tickerRef.current)
    tickerRef.current = window.setInterval(() => {
      const t = nowTs()
      const imp = snapshotImpactAbs(projects)
      setImpactHistory((h) => [...h, { t, ascoe: imp.ascoe, civichat: imp.civichat, handbook: imp.handbook, yadokari: imp.yadokari }])
      setPerProjectHistory((h) => [...h, snapshotPerProject(projects)])
    }, 5000)
    return () => {
      if (tickerRef.current) window.clearInterval(tickerRef.current)
    }
  }, [projects])

  const buy = (pid: ProjectId, scenario: Scenario, side: Side, shares: number) => {
    if (shares <= 0) return
    const prj = projects.find((p) => p.id === pid)!
    const m = prj.markets[scenario]
    const { cost, qUp2, qDown2 } = tradeCost(m, side, shares)
    if (activeAccount.balance < cost) {
      alert('残高不足')
      return
    }
    setProjects((ps) => ps.map((p) => (p.id !== pid ? p : ({ ...p, markets: { ...p.markets, [scenario]: { ...m, qUp: qUp2, qDown: qDown2 } } }))))
    setAccounts((as) => as.map((a) => (a.id !== activeAccount.id ? a : ({
      ...a,
      balance: a.balance - cost,
      holdings: { ...a.holdings, [pid]: { ...a.holdings[pid], [scenario]: { ...a.holdings[pid][scenario], [side]: a.holdings[pid][scenario][side] + shares } } },
    }))))
  }

  const sell = (pid: ProjectId, scenario: Scenario, side: Side, shares: number) => {
    if (shares <= 0) return
    const have = activeAccount.holdings[pid][scenario][side]
    if (have < shares) {
      alert('保有シェアが不足')
      return
    }
    const prj = projects.find((p) => p.id === pid)!
    const m = prj.markets[scenario]
    // LMSR厳守: deltaを負にしてpre/post差分で払い戻し
    const { qUp2, qDown2, pre, post } = tradeCost(m, side, -shares)
    const refund = pre - post
    setProjects((ps) => ps.map((p) => (p.id !== pid ? p : ({ ...p, markets: { ...p.markets, [scenario]: { ...m, qUp: qUp2, qDown: qDown2 } } }))))
    setAccounts((as) => as.map((a) => (a.id !== activeAccount.id ? a : ({
      ...a,
      balance: a.balance + refund,
      holdings: { ...a.holdings, [pid]: { ...a.holdings[pid], [scenario]: { ...a.holdings[pid][scenario], [side]: have - shares } } },
    }))))
  }

  const prices = useMemo(() => {
    const map: Record<ProjectId, { funded: { up: number; down: number }; not_funded: { up: number; down: number } }> = {
      ascoe: { funded: { up: 0, down: 0 }, not_funded: { up: 0, down: 0 } },
      civichat: { funded: { up: 0, down: 0 }, not_funded: { up: 0, down: 0 } },
      handbook: { funded: { up: 0, down: 0 }, not_funded: { up: 0, down: 0 } },
      yadokari: { funded: { up: 0, down: 0 }, not_funded: { up: 0, down: 0 } },
    }
    projects.forEach((p) => {
      const fu = priceUp(p.markets.funded.qUp, p.markets.funded.qDown, p.markets.funded.b)
      const nf = priceUp(p.markets.not_funded.qUp, p.markets.not_funded.qDown, p.markets.not_funded.b)
      map[p.id].funded = { up: fu, down: 1 - fu }
      map[p.id].not_funded = { up: nf, down: 1 - nf }
    })
    return map
  }, [projects])

  const applyTarget = (pid: ProjectId, scenario: Scenario, targetAbs: number) => {
    // 目標絶対値に到達するよう、必要なサイドに必要量のトレードを発行（LMSR準拠）
    const prj = projects.find((p) => p.id === pid)!
    const m = prj.markets[scenario]
    const min = prj.rangeMin, max = prj.rangeMax
    const pTarget = clamp01((targetAbs - min) / (max - min))
    const pCurr = clamp01(priceUp(m.qUp, m.qDown, m.b))
    if (Math.abs(pTarget - pCurr) < 1e-6) return
    if (pTarget > pCurr) {
      // UP を買って qUp を上げる
      const qUtarget = qUpForTargetPrice(m.qDown, m.b, pTarget)
      const delta = Math.max(0, qUtarget - m.qUp)
      if (delta <= 0) return
      const { cost, qUp2, qDown2 } = tradeCost(m, 'UP', delta)
      if (activeAccount.balance < cost) return alert('残高不足')
      setProjects((ps) => ps.map((p) => (p.id !== pid ? p : ({ ...p, markets: { ...p.markets, [scenario]: { ...m, qUp: qUp2, qDown: qDown2 } } }))))
      setAccounts((as) => as.map((a) => (a.id !== activeAccount.id ? a : ({
        ...a,
        balance: a.balance - cost,
        holdings: { ...a.holdings, [pid]: { ...a.holdings[pid], [scenario]: { ...a.holdings[pid][scenario], UP: a.holdings[pid][scenario].UP + delta } } },
      }))))
    } else {
      // DOWN を買って qDown を上げる（価格を下げる）
      const logit = Math.log(pTarget / (1 - pTarget))
      const qDownTarget = m.qUp - m.b * logit
      const delta = Math.max(0, qDownTarget - m.qDown)
      if (delta <= 0) return
      const { cost, qUp2, qDown2 } = tradeCost(m, 'DOWN', delta)
      if (activeAccount.balance < cost) return alert('残高不足')
      setProjects((ps) => ps.map((p) => (p.id !== pid ? p : ({ ...p, markets: { ...p.markets, [scenario]: { ...m, qUp: qUp2, qDown: qDown2 } } }))))
      setAccounts((as) => as.map((a) => (a.id !== activeAccount.id ? a : ({
        ...a,
        balance: a.balance - cost,
        holdings: { ...a.holdings, [pid]: { ...a.holdings[pid], [scenario]: { ...a.holdings[pid][scenario], DOWN: a.holdings[pid][scenario].DOWN + delta } } },
      }))))
    }
  }

  const impactChartData = useMemo(() => impactHistory.map((pt) => ({ t: pt.t, ascoe: pt.ascoe, civichat: pt.civichat, handbook: pt.handbook, yadokari: pt.yadokari })), [impactHistory])
  const perProjectSeries = useMemo(() => perProjectHistory, [perProjectHistory])

  const adminFixAtIndex = (idx: number) => {
    if (!activeAccount.isAdmin) return
    let snap: Record<ProjectId, number> | null = null
    if (idx < 0) snap = snapshotImpactAbs(projects)
    else {
      const it = impactHistory[idx]
      if (!it) return
      snap = { ascoe: it.ascoe, civichat: it.civichat, handbook: it.handbook, yadokari: it.yadokari } as any
    }
    const [winner] = (Object.entries(snap!) as [ProjectId, number][]).reduce((a, b) => (a[1] >= b[1] ? a : b))

    setProjects((prev) => {
      const ps = prev.map((p) => ({ ...p, markets: { funded: { ...p.markets.funded }, not_funded: { ...p.markets.not_funded } } }))
      // winner: Not funded = 0 に固定
      const win = ps.find((p) => p.id === winner)!
      {
        const mNF = win.markets.not_funded
        const p0 = clamp01((0 - win.rangeMin) / (win.rangeMax - win.rangeMin))
        const qU0 = qUpForTargetPrice(mNF.qDown, mNF.b, p0)
        win.markets.not_funded = { ...mNF, qUp: qU0 }
      }
      // losers: Funded = 0 に固定
      ps.forEach((p) => {
        if (p.id === winner) return
        const mF = p.markets.funded
        const p0f = clamp01((0 - p.rangeMin) / (p.rangeMax - p.rangeMin))
        const qU0f = qUpForTargetPrice(mF.qDown, mF.b, p0f)
        p.markets.funded = { ...mF, qUp: qU0f }
      })
      setFrozenNot((fn) => ({ ...fn, [winner]: true }))
      setFrozenFundedZero((ff) => {
        const next = { ...ff } as Record<ProjectId, boolean>
        ;(Object.keys(ff) as ProjectId[]).forEach((pid) => {
          if (pid !== winner) next[pid] = true
        })
        return next
      })
      const t = nowTs()
      setPhase('decided')
      setPhaseMarkers((m) => [...m, { t, label: 'Decision' }])
      const vals: Record<ProjectId, { funded?: number; not_funded?: number }> = { ascoe: {}, civichat: {}, handbook: {}, yadokari: {} }
      setResolution({ winner, values: vals })
      return ps
    })
  }

  const adminResolve = () => {
    if (!activeAccount.isAdmin || !resolution) return
    const { winner, values } = resolution
    const filled: Record<ProjectId, { funded?: number; not_funded?: number }> = { ascoe: {}, civichat: {}, handbook: {}, yadokari: {} }
    ;(Object.keys(values) as ProjectId[]).forEach((pid) => {
      filled[pid] = { ...values[pid] }
      if (pid === winner) {
        if (filled[pid].funded == null) filled[pid].funded = 5000
      } else {
        if (filled[pid].not_funded == null) filled[pid].not_funded = 5000
      }
    })
    const t = nowTs()
    setPhase('resolved')
    setPhaseMarkers((m) => [...m, { t, label: 'Resolution' }])
    setResolution({ winner, values: filled })
  }

  const redeemAll = () => {
    if (phase !== 'resolved' || !resolution) return
    const { winner, values } = resolution
    setAccounts((prev) => prev.map((a) => {
      let bal = a.balance
      const newHold = JSON.parse(JSON.stringify(a.holdings)) as Holdings
      ;(Object.keys(newHold) as ProjectId[]).forEach((pid) => {
        const prj = projects.find((p) => p.id === pid)!
        const min = prj.rangeMin, max = prj.rangeMax
        const vFundedAbs = pid === winner ? (values[pid].funded ?? 5000) : undefined
        const vNotAbs = pid !== winner ? (values[pid].not_funded ?? 5000) : undefined
        ;(['funded', 'not_funded'] as Scenario[]).forEach((sc) => {
          const outcomeAbs = sc === 'funded' ? vFundedAbs : vNotAbs
          if (outcomeAbs == null) return
          const v = clamp01((outcomeAbs - min) / (max - min))
          ;(['UP', 'DOWN'] as Side[]).forEach((sd) => {
            const q = newHold[pid][sc][sd]
            if (q > 0) {
              const payout = (sd === 'UP' ? v : 1 - v) * q
              bal += payout
              newHold[pid][sc][sd] = 0
            }
          })
        })
      })
      return { ...a, balance: bal, holdings: newHold }
    }))
  }

  const colors: Record<string, string> = {
    アスコエ: '#1f77b4',
    Civichat: '#2ca02c',
    お悩みハンドブック: '#ff7f0e',
    みつもりヤドカリくん: '#d62728',
    Funded: '#1f77b4',
    NotFunded: '#808080',
  }

  const tableRows = useMemo(() => projects.map((p) => {
    const fuP = priceUp(p.markets.funded.qUp, p.markets.funded.qDown, p.markets.funded.b)
    const nfP = priceUp(p.markets.not_funded.qUp, p.markets.not_funded.qDown, p.markets.not_funded.b)
    return {
      id: p.id,
      name: p.name,
      fundedAbs: impliedValue(fuP, p.rangeMin, p.rangeMax),
      notAbs: impliedValue(nfP, p.rangeMin, p.rangeMax),
      impactAbs: (fuP - nfP) * (p.rangeMax - p.rangeMin),
    }
  }), [projects])

  const adminOptions = useMemo(() => impactHistory.map((h, i) => ({ idx: i, label: `${i}: ${new Date(h.t).toLocaleTimeString()}` })), [impactHistory])
  const [adminIdx, setAdminIdx] = useState<number>(-1)

  const isFundedFrozen = selectedProject ? frozenFundedZero[selectedProject] : false
  const isNotFrozen = selectedProject ? frozenNot[selectedProject] : false

  const activeProject = selectedProject ? projects.find(p => p.id === selectedProject) ?? null : null

  return (
    <div className="min-h-dvh w-full bg-white">
      <div className="w-full border-b bg-white sticky top-0 z-10">
        <div className="mx-auto max-w-7xl px-6 py-3 flex items-center justify-between">
          <div className="text-sm font-semibold">CFM</div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600">アカウント</span>
            <select className="h-8 border rounded px-2 text-xs" value={activeAccountId} onChange={(e) => setActiveAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}{a.isAdmin ? ' (admin)' : ''}</option>
              ))}
            </select>
            <span className="text-xs text-gray-600">残高: <b>{activeAccount.balance.toFixed(2)}</b> USDC</span>
          </div>
        </div>
      </div>
      <div className="p-6 md:p-8">
        <div className="mx-auto max-w-7xl grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="md:col-span-3 space-y-8">
          <header className="space-y-2">
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-bold">それぞれの社会保障制度の診断プロジェクトに1億円を投資した場合、各プロジェクトの申請数を予測する。</h1>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">上段: 全体の <b>Forecasted Impact = P(Funded UP) − P(Not UP)</b>。下段: 各プロジェクトの Funded vs Not Funded。</p>
              {selectedProject && (
                <Button variant="outline" onClick={() => setSelectedProject(null)}>全体を見る</Button>
              )}
            </div>
          </header>

          {activeAccount.isAdmin && (
            <Card className="shadow">
              <CardContent className="p-3 space-y-3">
                {phase === 'open' && (
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="text-sm font-medium">Admin: 指定時点の Impact 最大プロジェクトを確定（Winner→Not funded = 0 / Others→Funded = 0）</div>
                    <div className="flex items-center gap-2">
                      <select className="h-9 border rounded px-2 text-sm" value={String(adminIdx)} onChange={(e) => setAdminIdx(Number(e.target.value))}>
                        <option value="-1">現在（最新）</option>
                        {adminOptions.map((o) => (<option key={o.idx} value={o.idx}>{o.label}</option>))}
                      </select>
                      <Button onClick={() => adminFixAtIndex(adminIdx)}>Impact最大で確定</Button>
                    </div>
                  </div>
                )}
                {phase === 'decided' && (
                  <div className="space-y-2">
                    <div className="font-medium">解決・精算</div>
                    <div className="text-xs text-gray-600">各プロジェクトの最終結果（絶対値）を入力してください。</div>
                    <div className="space-y-2">
                      {(Object.keys(resolutionForm) as ProjectId[]).map((pid) => (
                        <div key={pid} className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
                          <div className="text-sm">{projects.find(p => p.id === pid)?.name}</div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-600">Funded</span>
                            <Input type="number" className="w-28" value={resolutionForm[pid].funded ?? ''}
                              onChange={(e) => setResolutionForm((f) => ({ ...f, [pid]: { ...f[pid], funded: e.target.value === '' ? undefined : Number(e.target.value) } }))} />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-600">Not Funded</span>
                            <Input type="number" className="w-28" value={resolutionForm[pid].not_funded ?? ''}
                              onChange={(e) => setResolutionForm((f) => ({ ...f, [pid]: { ...f[pid], not_funded: e.target.value === '' ? undefined : Number(e.target.value) } }))} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button onClick={() => {
                        const t = nowTs()
                        setPhase('resolved')
                        setPhaseMarkers((m) => [...m, { t, label: 'Resolution' }])
                        if (resolution) setResolution({ winner: resolution.winner, values: resolutionForm })
                      }}>解決にする（数値を適用）</Button>
                      <Button variant="outline" onClick={redeemAll}>全員 Redeem</Button>
                    </div>
                  </div>
                )}
                {phase === 'resolved' && (
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-green-700">解決済みです。Redeem を実行できます。</div>
                    <Button variant="outline" onClick={redeemAll}>全員 Redeem</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {selectedProject == null ? (
            <Card className="shadow">
              <CardContent className="p-4">
                <div className="h-[420px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={impactChartData} margin={{ left: 8, right: 16, top: 20, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(t) => new Date(Number(t)).toLocaleTimeString()} />
                      <YAxis tick={{ fontSize: 12 }} label={{ value: 'Forecasted Impact', angle: -90, position: 'insideLeft' }} />
                      <Tooltip formatter={(v: any) => (typeof v === 'number' ? v.toFixed(2) : v)} labelFormatter={(t: any) => new Date(Number(t)).toLocaleTimeString()} />
                      <Legend />
                      {phaseMarkers.map((m, i) => (
                        <ReferenceLine key={i} x={m.t} stroke="#666" strokeDasharray="4 2">
                          <Label value={m.label} position="insideTop" fill="#666" fontSize={10} />
                        </ReferenceLine>
                      ))}
                      <Line type="monotone" dataKey="ascoe" name="アスコエ" stroke={colors['アスコエ']} dot={false} strokeWidth={2} />
                      <Line type="monotone" dataKey="civichat" name="Civichat" stroke={colors['Civichat']} dot={false} strokeWidth={2} />
                      <Line type="monotone" dataKey="handbook" name="お悩みハンドブック" stroke={colors['お悩みハンドブック']} dot={false} strokeWidth={2} />
                      <Line type="monotone" dataKey="yadokari" name="みつもりヤドカリくん" stroke={colors['みつもりヤドカリくん']} dot={false} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="shadow">
              <CardContent className="p-4">
                <div className="h-[420px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={perProjectHistory.map(s => ({ t: s.t, Funded: s.funded[selectedProject], NotFunded: s.notFunded[selectedProject] }))} margin={{ left: 8, right: 16, top: 20, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(t) => new Date(Number(t)).toLocaleTimeString()} />
                      <YAxis tick={{ fontSize: 12 }} label={{ value: '予想申請数', angle: -90, position: 'insideLeft' }} />
                      <Tooltip formatter={(v: any) => (typeof v === 'number' ? v.toFixed(2) : v)} labelFormatter={(t: any) => new Date(Number(t)).toLocaleTimeString()} />
                      <Legend />
                      {phaseMarkers.map((m, i) => (
                        <ReferenceLine key={i} x={m.t} stroke="#666" strokeDasharray="4 2">
                          <Label value={m.label} position="insideTop" fill="#666" fontSize={10} />
                        </ReferenceLine>
                      ))}
                      <Line type="monotone" dataKey="Funded" stroke={colors.Funded} dot={false} strokeWidth={2} />
                      <Line type="monotone" dataKey="NotFunded" stroke={colors.NotFunded} dot={false} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {selectedProject == null && (
            <div className="space-y-2">
              <div className="text-xs text-gray-600">凍結済みの面は「-」で表示します。各カードの右上は状態（OPEN / FUNDED / NOT FUNDED）。</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {projects.map((p) => {
                  const data = perProjectSeries.map((s) => ({ t: s.t, Funded: s.funded[p.id], NotFunded: s.notFunded[p.id] }))
                  const status = frozenNot[p.id] ? 'FUNDED' : frozenFundedZero[p.id] ? 'NOT FUNDED' : 'OPEN'
                  const fuP = priceUp(p.markets.funded.qUp, p.markets.funded.qDown, p.markets.funded.b)
                  const nfP = priceUp(p.markets.not_funded.qUp, p.markets.not_funded.qDown, p.markets.not_funded.b)
                  const fundedAbs = impliedValue(fuP, p.rangeMin, p.rangeMax)
                  const notAbs = impliedValue(nfP, p.rangeMin, p.rangeMax)
                  const impactAbs = (fuP - nfP) * (p.rangeMax - p.rangeMin)
                  const priceF = prices[p.id].funded
                  const priceN = prices[p.id].not_funded
                  const fundedFrozen = frozenFundedZero[p.id]
                  const notFrozen = frozenNot[p.id]
                  const fmtMaybe = (val: number, hide: boolean) => (hide ? '-' : val.toFixed(2))
                  return (
                    <Card key={p.id} className="shadow">
                      <CardContent className="p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="font-medium">{p.name}</div>
                          <div className="text-xs rounded-full px-2 py-1 border">{status}</div>
                        </div>
                        <div className="h-[180px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={data} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(t) => new Date(Number(t)).toLocaleTimeString()} />
                              <YAxis tick={{ fontSize: 11 }} label={{ value: '予想申請数', angle: -90, position: 'insideLeft' }} />
                              <Tooltip formatter={(v: any) => (typeof v === 'number' ? v.toFixed(2) : v)} labelFormatter={(t: any) => new Date(Number(t)).toLocaleTimeString()} />
                              {phaseMarkers.map((m, i) => (<ReferenceLine key={i} x={m.t} stroke="#92c5de" strokeDasharray="2 2" />))}
                              <Line type="monotone" dataKey="Funded" stroke={colors.Funded} dot={false} strokeWidth={2} />
                              <Line type="monotone" dataKey="NotFunded" stroke={colors.NotFunded} dot={false} strokeWidth={2} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-700">
                          <div>1億円投資の予想</div>
                          <div className="text-right">{fmtMaybe(fundedAbs, fundedFrozen)}</div>
                          <div>非投資の予想</div>
                          <div className="text-right">{fmtMaybe(notAbs, notFrozen)}</div>
                          <div>Forecasted Impact</div>
                          <div className="text-right">{impactAbs.toFixed(2)}</div>
                          <div>価格(Funded UP / DOWN)</div>
                          <div className="text-right">{fmtMaybe(priceF.up, fundedFrozen)} / {fmtMaybe(priceF.down, fundedFrozen)}</div>
                          <div>価格(Not UP / DOWN)</div>
                          <div className="text-right">{fmtMaybe(priceN.up, notFrozen)} / {fmtMaybe(priceN.down, notFrozen)}</div>
                        </div>
                        <div className="pt-2">
                          <Button className="w-full" onClick={() => setSelectedProject(p.id)}>このプロジェクトを見る</Button>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          )}

          

          
        </div>

        <div className="space-y-6">
            <Card className="shadow">
              <CardContent className="p-5 md:p-6 space-y-4">
              <div className="font-medium">トレーディング</div>
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-1 sm:grid-cols-3 items-center gap-2 sm:gap-3">
                  <span className="text-xs text-gray-600">プロジェクト</span>
                  <select className="h-9 border rounded px-2 text-sm w-full sm:col-span-2" value={selectedProject ?? ''} onChange={(e) => setSelectedProject(e.target.value as ProjectId)}>
                    <option value="" disabled>選択してください</option>
                    {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                  </select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 items-center gap-2 sm:gap-3">
                  <span className="text-xs text-gray-600">シナリオ</span>
                  <select className="h-9 border rounded px-2 text-sm w-full sm:col-span-2" value={tradeScenario} onChange={(e) => setTradeScenario(e.target.value as Scenario)} disabled={!activeProject}>
                    <option value="funded" disabled={isFundedFrozen}>Funded</option>
                    <option value="not_funded" disabled={isNotFrozen}>Not Funded</option>
                  </select>
                </div>
                {activeProject && (
                  <div className="space-y-1">
                    <div className="text-xs text-gray-600">市場の予想（対象: {tradeScenario==='funded' ? 'Funded' : 'Not Funded'}）</div>
                    <div className="text-base font-medium">
                      {(() => {
                        const abs = getCurrentAbs(activeProject, tradeScenario)
                        const m = activeProject.markets[tradeScenario]
                        const pUp = priceUp(m.qUp, m.qDown, m.b)
                        return (
                          <span>
                            {Math.round(abs)} 件
                            <span className="text-xs text-gray-500">（上振れ確率 P(UP) {pUp.toFixed(2)}）</span>
                          </span>
                        )
                      })()}
                    </div>
                    <div className="text-[11px] text-gray-500">あなたの見立ては「市場予想より高い」か「低い」かを選んでください。</div>
                  </div>
                )}
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                  <Button className="w-full sm:w-auto" variant={tradeSide==='UP' ? 'default' : 'outline'} disabled={!activeProject} onClick={() => setTradeSide('UP')}>予想より高くなるに賭ける（UP）</Button>
                  <Button className="w-full sm:w-auto" variant={tradeSide==='DOWN' ? 'default' : 'outline'} disabled={!activeProject} onClick={() => setTradeSide('DOWN')}>予想より低くなるに賭ける（DOWN）</Button>
                </div>
                <TradingByAmount
                  project={activeProject}
                  scenario={tradeScenario}
                  side={tradeSide}
                  balance={activeAccount.balance}
                  disabled={(tradeScenario==='funded' && isFundedFrozen) || (tradeScenario==='not_funded' && isNotFrozen) || !activeProject}
                  onExecute={(deltaShares, amountPaid) => {
                    if (!activeProject) return
                    // 実行: deltaShares をそのまま buy に渡す（LMSR準拠）
                    buy(activeProject.id, tradeScenario, tradeSide, deltaShares)
                  }}
                />
              </div>
            </CardContent>
          </Card>

          
        </div>

        
      </div>
    </div>
  </div>
  )
}
;type TradingByAmountProps = {
  project: Project | null
  scenario: Scenario
  side: Side
  balance: number
  disabled?: boolean
  onExecute: (deltaShares: number, amountPaid: number) => void
}

function TradingByAmount({ project, scenario, side, balance, disabled, onExecute }: TradingByAmountProps) {
  const [amount, setAmount] = useState<number>(50)
  const [previewAbs, setPreviewAbs] = useState<number>(() => project ? Math.round((project.rangeMin + project.rangeMax) / 2) : 5000)

  useEffect(() => {
    if (project) setPreviewAbs(Math.round((project.rangeMin + project.rangeMax) / 2))
  }, [project])

  if (!project) {
    return (
      <div className="text-xs text-gray-500">プロジェクトを選択してください。</div>
    )
  }

  const m = project.markets[scenario]

  const deltaForAmount = (amt: number) => {
    if (amt <= 0) return 0
    // 単調性を利用した二分探索
    let lo = 0
    let hi = 1
    const maxIter = 60
    // 上限探索
    while (tradeCost(m, side, hi).cost < amt && hi < 1e6) hi *= 2
    for (let i = 0; i < maxIter; i++) {
      const mid = (lo + hi) / 2
      const c = tradeCost(m, side, mid).cost
      if (c < amt) lo = mid; else hi = mid
    }
    return hi
  }

  const delta = deltaForAmount(Math.min(amount, balance))
  const exactCost = delta > 0 ? tradeCost(m, side, delta).cost : 0

  const v = clamp01((previewAbs - project.rangeMin) / (project.rangeMax - project.rangeMin))
  const payout = (side === 'UP' ? v : (1 - v)) * delta
  const profit = payout - exactCost
  const pct = exactCost > 0 ? (profit / exactCost) * 100 : 0

  const scenJp = scenario === 'funded' ? 'Funded' : 'Not Funded'
  const ctaLabel = `${scenJp} で ${side} を購入`

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="text-xs text-gray-600">金額</div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Input type="number" className="w-full sm:w-40" value={amount} onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))} disabled={disabled} />
            <span className="text-xs text-gray-500">USDC</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button variant="outline" disabled={disabled} onClick={() => setAmount((v) => Math.max(0, v - 1))}>-1</Button>
            <Button variant="outline" disabled={disabled} onClick={() => setAmount((v) => v + 1)}>+1</Button>
            <Button variant="outline" disabled={disabled} onClick={() => setAmount((v) => v + 10)}>+10</Button>
            <Button variant="outline" disabled={disabled} onClick={() => setAmount(balance)}>Max</Button>
          </div>
        </div>
      </div>

      <Button className="w-full h-10" disabled={disabled || amount <= 0 || delta <= 0} onClick={() => onExecute(delta, exactCost)}>{ctaLabel}</Button>

      <div className="pt-1 space-y-3">
        <div className="text-sm font-medium">見込み損益（プレビュー）</div>
        <div className="space-y-2">
          <div className="text-xs text-gray-600">結果の仮定（スライダー）</div>
          <input
            type="range"
            className="w-full accent-black"
            min={project.rangeMin}
            max={project.rangeMax}
            step={Math.max(1, Math.round((project.rangeMax - project.rangeMin) / 100))}
            value={previewAbs}
            onChange={(e) => setPreviewAbs(Number(e.target.value))}
            disabled={disabled}
          />
          <div className="flex justify-between text-[10px] text-gray-500 px-0.5">
            <span>{project.rangeMin}</span>
            <span>{Math.round(project.rangeMin + (project.rangeMax - project.rangeMin) * 0.25)}</span>
            <span>{Math.round((project.rangeMin + project.rangeMax) / 2)}</span>
            <span>{Math.round(project.rangeMin + (project.rangeMax - project.rangeMin) * 0.75)}</span>
            <span>{project.rangeMax}</span>
          </div>
        </div>
        <div className="text-xs text-gray-600">この注文: シェア {delta.toFixed(2)} / コスト {exactCost.toFixed(2)} USDC</div>
        <div className="flex items-center justify-between text-sm">
          <div>結果が {previewAbs} の場合の損益</div>
          <div className={profit >= 0 ? 'text-green-600' : 'text-red-600'}>
            {profit.toFixed(2)} USDC ({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%)
          </div>
        </div>
      </div>
    </div>
  )
}
