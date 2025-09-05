import React, { useEffect, useMemo, useRef, useState, useLayoutEffect, type Dispatch, type SetStateAction } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  Label,
} from 'recharts'
import type { Scenario, Side, ProjectId, Phase, MarketState, Project, BaseHoldings, Account, Holdings } from '@/lib/types'
import { markets } from '@/lib/markets'
import UserPositionsAllCard from '@/components/UserPositionsAllCard'

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

function emptyBase(): BaseHoldings {
  return {
    ascoe: { funded: 0, not_funded: 0 },
    civichat: { funded: 0, not_funded: 0 },
    handbook: { funded: 0, not_funded: 0 },
    yadokari: { funded: 0, not_funded: 0 },
  }
}

export default function MarketPage({
  marketId,
  accounts,
  setAccounts,
  activeAccountId,
  setActiveAccountId,
}: {
  marketId: string
  accounts: Account[]
  setAccounts: Dispatch<SetStateAction<Account[]>>
  activeAccountId: string
  setActiveAccountId: (id: string) => void
}) {
  const _ = marketId
  const STORAGE_KEY = `cfm:projects:${marketId}`
  const HISTORY_IMPACT_KEY = `cfm:impactHistory:${marketId}`
  const HISTORY_PER_KEY = `cfm:perProjectHistory:${marketId}`
  const PHASE_MARKERS_KEY = `cfm:phaseMarkers:${marketId}`
  const [projects, setProjects] = useState<Project[]>(initialProjects)
  const [hydrated, setHydrated] = useState<boolean>(false)
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
  const persistProjects = (next: Project[]) => {
    setProjects(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      window.dispatchEvent(new CustomEvent('cfm:projects-updated', { detail: { marketId, projects: next } }))
    } catch {}
  }
  // 永続化されたプロジェクト状態の復元（初回描画前に揃えるため layoutEffect）
  useLayoutEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) setProjects(parsed)
      }
      const impRaw = localStorage.getItem(HISTORY_IMPACT_KEY)
      if (impRaw) {
        const parsedImp = JSON.parse(impRaw)
        if (Array.isArray(parsedImp) && parsedImp.length) setImpactHistory(parsedImp)
      }
      const perRaw = localStorage.getItem(HISTORY_PER_KEY)
      if (perRaw) {
        const parsedPer = JSON.parse(perRaw)
        if (Array.isArray(parsedPer) && parsedPer.length) setPerProjectHistory(parsedPer)
      }
      const mkRaw = localStorage.getItem(PHASE_MARKERS_KEY)
      if (mkRaw) {
        const parsedMk = JSON.parse(mkRaw)
        if (Array.isArray(parsedMk) && parsedMk.length) setPhaseMarkers(parsedMk)
      }
      setHydrated(true)
    } catch {}
  }, [STORAGE_KEY])

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
  const snapshotPerProject = (ps: Project[]): { t: number; funded: Record<ProjectId, number>; notFunded: Record<ProjectId, number> } => {
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
    if (!hydrated) return
    const t = nowTs()
    const imp = snapshotImpactAbs(projects)
    setImpactHistory((h) => [...h, { t, ascoe: imp.ascoe, civichat: imp.civichat, handbook: imp.handbook, yadokari: imp.yadokari }])
    setPerProjectHistory((h) => [...h, snapshotPerProject(projects)])
  }, [projects, hydrated])

  // プロジェクト状態を保存（ホームへ戻っても保持）
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects))
    } catch {}
  }, [projects, STORAGE_KEY])

  // アンマウント直前にも確実に保存（ナビゲーション直後でも消えないように）
  useEffect(() => {
    return () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(projects))
      } catch {}
    }
  }, [projects, STORAGE_KEY])

  // チャート履歴・マーカーの保存
  useEffect(() => {
    try { localStorage.setItem(HISTORY_IMPACT_KEY, JSON.stringify(impactHistory)) } catch {}
  }, [impactHistory, HISTORY_IMPACT_KEY])
  useEffect(() => {
    try { localStorage.setItem(HISTORY_PER_KEY, JSON.stringify(perProjectHistory)) } catch {}
  }, [perProjectHistory, HISTORY_PER_KEY])
  useEffect(() => {
    try { localStorage.setItem(PHASE_MARKERS_KEY, JSON.stringify(phaseMarkers)) } catch {}
  }, [phaseMarkers, PHASE_MARKERS_KEY])

  // アンマウント時にも履歴・マーカーを保存
  useEffect(() => {
    return () => {
      try {
        localStorage.setItem(HISTORY_IMPACT_KEY, JSON.stringify(impactHistory))
        localStorage.setItem(HISTORY_PER_KEY, JSON.stringify(perProjectHistory))
        localStorage.setItem(PHASE_MARKERS_KEY, JSON.stringify(phaseMarkers))
      } catch {}
    }
  }, [impactHistory, perProjectHistory, phaseMarkers, HISTORY_IMPACT_KEY, HISTORY_PER_KEY, PHASE_MARKERS_KEY])

  useEffect(() => {
    if (!hydrated) return
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
  }, [projects, hydrated])

  const buy = (pid: ProjectId, scenario: Scenario, side: Side, shares: number) => {
    if (shares <= 0) return
    const prj = projects.find((p) => p.id === pid)!
    const m = prj.markets[scenario]
    const { cost, qUp2, qDown2 } = tradeCost(m, side, shares)
    if (activeAccount.balance < cost) {
      alert('残高不足')
      return
    }
    const next = projects.map((p) => (p.id !== pid ? p : ({ ...p, markets: { ...p.markets, [scenario]: { ...m, qUp: qUp2, qDown: qDown2 } } })))
    persistProjects(next)
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
    const next = projects.map((p) => (p.id !== pid ? p : ({ ...p, markets: { ...p.markets, [scenario]: { ...m, qUp: qUp2, qDown: qDown2 } } })))
    persistProjects(next)
    setAccounts((as) => as.map((a) => (a.id !== activeAccount.id ? a : ({
      ...a,
      balance: a.balance + refund,
      holdings: { ...a.holdings, [pid]: { ...a.holdings[pid], [scenario]: { ...a.holdings[pid][scenario], [side]: have - shares } } },
    }))))
  }

  // ===== Base（If Funded / If Not Funded）
  const mintBasePair = (pid: ProjectId, amount: number) => {
    if (amount <= 0) return
    if (activeAccount.balance < amount) return alert('残高不足')
    setAccounts(as => as.map(a => a.id !== activeAccount.id ? a : ({
      ...a,
      balance: a.balance - amount,
      base: { ...a.base, [pid]: { funded: a.base[pid].funded + amount, not_funded: a.base[pid].not_funded + amount } }
    })))
  }

  const mergeBasePair = (pid: ProjectId, amount?: number) => {
    const b = activeAccount.base[pid]
    const can = Math.min(b.funded, b.not_funded)
    const amt = amount == null ? can : Math.min(amount, can)
    if (amt <= 0) return
    setAccounts(as => as.map(a => a.id !== activeAccount.id ? a : ({
      ...a,
      balance: a.balance + amt,
      base: { ...a.base, [pid]: { funded: a.base[pid].funded - amt, not_funded: a.base[pid].not_funded - amt } }
    })))
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

  const BaseSection: React.FC<{ project: Project | null }> = ({ project }) => {
    if (!project) return <div className="text-xs text-gray-500">プロジェクトを選択してください。</div>
    const b = activeAccount.base[project.id]
    const [amt, setAmt] = useState<number>(10)
    return (
      <div className="space-y-2">
        <div className="text-xs font-medium">ベース保有（If Funded / If Not Funded）</div>
        <div className="text-xs text-gray-600">このペアは常に If Funded + If Not Funded = 1 USDC（どちらか一方が最終的に1、もう一方が0）を満たします。</div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="border rounded p-2">
            <div className="text-xs text-gray-500">If Funded</div>
            <div className="font-medium">{b.funded.toFixed(2)}</div>
          </div>
          <div className="border rounded p-2">
            <div className="text-xs text-gray-500">If Not Funded</div>
            <div className="font-medium">{b.not_funded.toFixed(2)}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input type="number" className="w-28" value={amt} onChange={(e) => setAmt(Math.max(0, Number(e.target.value)))} />
          <span className="text-xs text-gray-500">USDC</span>
          <Button variant="outline" onClick={() => mintBasePair(project.id, amt)} disabled={activeAccount.balance < amt || amt <= 0}>ペアをミント</Button>
          <Button variant="outline" onClick={() => mergeBasePair(project.id)} disabled={Math.min(b.funded, b.not_funded) <= 0}>ペアをマージ</Button>
        </div>
      </div>
    )
  }

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
      const next = projects.map((p) => (p.id !== pid ? p : ({ ...p, markets: { ...p.markets, [scenario]: { ...m, qUp: qUp2, qDown: qDown2 } } })))
      persistProjects(next)
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
      const next = projects.map((p) => (p.id !== pid ? p : ({ ...p, markets: { ...p.markets, [scenario]: { ...m, qUp: qUp2, qDown: qDown2 } } })))
      persistProjects(next)
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

    const ps = projects.map((p) => ({ ...p, markets: { funded: { ...p.markets.funded }, not_funded: { ...p.markets.not_funded } } }))
    // winner: Not funded=0
    const win = ps.find((p) => p.id === winner)!
    const mNF = win.markets.not_funded
    const p0 = clamp01((0 - win.rangeMin) / (win.rangeMax - win.rangeMin))
    const qU0 = qUpForTargetPrice(mNF.qDown, mNF.b, p0)
    win.markets.not_funded = { ...mNF, qUp: qU0 }
    // losers: Funded=0
    ps.forEach((p) => {
      if (p.id === winner) return
      const mF = p.markets.funded
      const p0f = clamp01((0 - p.rangeMin) / (p.rangeMax - p.rangeMin))
      const qU0f = qUpForTargetPrice(mF.qDown, mF.b, p0f)
      p.markets.funded = { ...mF, qUp: qU0f }
    })
    persistProjects(ps)
    // ロック
    setFrozenNot((fn) => ({ ...fn, [winner]: true }))
    setFrozenFundedZero((ff) => {
      const next = { ...ff } as Record<ProjectId, boolean>
        ; (Object.keys(ff) as ProjectId[]).forEach((pid) => { if (pid !== winner) next[pid] = true })
      return next
    })
    // フェーズ & マーカー
    const t = nowTs()
    setPhase('decided')
    setPhaseMarkers((m) => [...m, { t, label: 'Decision' }])
    // 解決フォーム用
    const vals: Record<ProjectId, { funded?: number; not_funded?: number }> = { ascoe: {}, civichat: {}, handbook: {}, yadokari: {} }
    setResolution({ winner, values: vals })
    // 履歴
    setImpactHistory((h) => [...h, { t, ...snapshotImpactAbs(ps) } as any])
    setPerProjectHistory((h) => [...h, snapshotPerProject(ps)])
    if (selectedProject) setResolutionForm((f) => f)
  }

  // ===== ランダム取引シミュレーション =====
  const simulateRandomTrades = (count = 30) => {
    // 深いコピー（必要な範囲のみ）
    const ps: Project[] = projects.map((p) => ({
      ...p,
      markets: {
        funded: { ...p.markets.funded },
        not_funded: { ...p.markets.not_funded },
      },
    }))
    const as: Account[] = accounts.map((a) => ({
      ...a,
      holdings: {
        ascoe: { funded: { ...a.holdings.ascoe.funded }, not_funded: { ...a.holdings.ascoe.not_funded } },
        civichat: { funded: { ...a.holdings.civichat.funded }, not_funded: { ...a.holdings.civichat.not_funded } },
        handbook: { funded: { ...a.holdings.handbook.funded }, not_funded: { ...a.holdings.handbook.not_funded } },
        yadokari: { funded: { ...a.holdings.yadokari.funded }, not_funded: { ...a.holdings.yadokari.not_funded } },
      },
      base: {
        ascoe: { ...a.base.ascoe },
        civichat: { ...a.base.civichat },
        handbook: { ...a.base.handbook },
        yadokari: { ...a.base.yadokari },
      },
    }))

    const pids: ProjectId[] = ['ascoe', 'civichat', 'handbook', 'yadokari']
    const rand = (n: number) => Math.floor(Math.random() * n)
    const randEl = <T,>(arr: T[]): T => arr[rand(arr.length)]

    for (let i = 0; i < count; i++) {
      const trader = randEl(as.filter((a) => !a.isAdmin))
      if (!trader) break
      const pid = randEl(pids)
      const scenario: Scenario = Math.random() < 0.5 ? 'funded' : 'not_funded'
      const side: Side = Math.random() < 0.5 ? 'UP' : 'DOWN'
      const action: 'buy' | 'sell' = Math.random() < 0.7 ? 'buy' : 'sell'
      let shares = 1 + rand(50)

      const prj = ps.find((p) => p.id === pid)!
      const m = prj.markets[scenario]

      if (action === 'buy') {
        // コスト計算しつつ、残高に収まるように調整
        let { cost } = tradeCost(m, side, shares)
        if (trader.balance < cost) {
          // ざっくりスケールダウン（1回）
          const scale = trader.balance / Math.max(cost, 1e-9)
          shares = Math.max(1, Math.floor(shares * scale))
        }
        const { cost: cost2, qUp2, qDown2 } = tradeCost(m, side, shares)
        if (trader.balance < cost2 || shares <= 0) continue
        // 反映
        prj.markets[scenario] = { ...m, qUp: qUp2, qDown: qDown2 }
        trader.balance -= cost2
        trader.holdings[pid][scenario][side] += shares
      } else {
        const have = trader.holdings[pid][scenario][side]
        if (have <= 0) continue
        shares = Math.min(shares, have)
        const { qUp2, qDown2, pre, post } = tradeCost(m, side, -shares)
        const refund = pre - post
        prj.markets[scenario] = { ...m, qUp: qUp2, qDown: qDown2 }
        trader.balance += refund
        trader.holdings[pid][scenario][side] -= shares
      }
    }

    setProjects(ps)
    setAccounts(as)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ps))
      window.dispatchEvent(new CustomEvent('cfm:projects-updated', { detail: { marketId, projects: ps } }))
    } catch {}
  }

  // ===== すべての取引を初期化 =====
  const resetAllTrades = () => {
    if (!window.confirm('すべての取引を初期化します。よろしいですか？')) return
    const resetProjects = initialProjects.map((p) => ({
      ...p,
      markets: {
        funded: { qUp: 0, qDown: 0, b: DEFAULT_B },
        not_funded: { qUp: 0, qDown: 0, b: DEFAULT_B },
      },
    }))
    setProjects(resetProjects)
    const STARTING_BALANCE = 1000
    setAccounts((as) => as.map((a) => ({
      ...a,
      balance: STARTING_BALANCE,
      holdings: emptyHoldings(),
      base: emptyBase(),
    })))
    setFrozenNot({ ascoe: false, civichat: false, handbook: false, yadokari: false })
    setFrozenFundedZero({ ascoe: false, civichat: false, handbook: false, yadokari: false })
    setPhase('open')
    setPhaseMarkers([{ t: nowTs(), label: 'Open' }])
    setResolution(null)
    setImpactHistory([{ t: nowTs(), ascoe: 0, civichat: 0, handbook: 0, yadokari: 0 }])
    setPerProjectHistory([snapshotPerProject(resetProjects)])
    try {
      // マーケット状態/チャート/アカウント永続データの両方をクリア
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem(HISTORY_IMPACT_KEY)
      localStorage.removeItem(HISTORY_PER_KEY)
      localStorage.removeItem(PHASE_MARKERS_KEY)
      localStorage.removeItem('cfm:accounts:v1')
      // アクティブアカウントは維持しても良いが、初期化の意味合いに合わせて admin に戻す
      localStorage.setItem('cfm:activeAccountId:v1', 'admin')
    } catch {}
  }

  const adminResolve = () => {
    if (!activeAccount.isAdmin || !resolution) return
    const { winner, values } = resolution
    const filled: Record<ProjectId, { funded?: number; not_funded?: number }> = { ascoe: {}, civichat: {}, handbook: {}, yadokari: {} }
      ; (Object.keys(values) as ProjectId[]).forEach((pid) => {
        filled[pid] = { ...values[pid] }
        if (pid === winner) { if (filled[pid].funded == null) filled[pid].funded = 5000 } else { if (filled[pid].not_funded == null) filled[pid].not_funded = 5000 }
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
      const newHold = JSON.parse(JSON.stringify(a.holdings)) as Account['holdings']
      const newBase = JSON.parse(JSON.stringify(a.base)) as BaseHoldings
        ; (Object.keys(newHold) as ProjectId[]).forEach((pid) => {
          const prj = projects.find((p) => p.id === pid)!
          const min = prj.rangeMin, max = prj.rangeMax
          const vFundedAbs = pid === winner ? (values[pid].funded ?? 5000) : undefined
          const vNotAbs = pid !== winner ? (values[pid].not_funded ?? 5000) : undefined
            ; (['funded', 'not_funded'] as Scenario[]).forEach((sc) => {
              const outcomeAbs = sc === 'funded' ? vFundedAbs : vNotAbs
              if (outcomeAbs == null) return
              const v = clamp01((outcomeAbs - min) / (max - min))
                ; (['UP', 'DOWN'] as Side[]).forEach((sd) => {
                  const q = newHold[pid][sc][sd]
                  if (q > 0) {
                    const payout = (sd === 'UP' ? v : 1 - v) * q
                    bal += payout
                    newHold[pid][sc][sd] = 0
                  }
                })
            })
          // Base payout
          if (pid === winner) {
            if (newBase[pid].funded > 0) { bal += newBase[pid].funded; newBase[pid].funded = 0 }
            newBase[pid].not_funded = 0
          } else {
            if (newBase[pid].not_funded > 0) { bal += newBase[pid].not_funded; newBase[pid].not_funded = 0 }
            newBase[pid].funded = 0
          }
        })
      return { ...a, balance: bal, holdings: newHold, base: newBase }
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

  // 管理者: 直近スナップショット（最新）で即時確定するため、選択UIは持たない

  const isFundedFrozen = selectedProject ? frozenFundedZero[selectedProject] : false
  const isNotFrozen = selectedProject ? frozenNot[selectedProject] : false

  const activeProject = selectedProject ? projects.find(p => p.id === selectedProject) ?? null : null

  return (
    <div className="min-h-dvh w-full bg-white">
      <div className="p-6 md:p-8">
        <div className="mx-auto max-w-7xl grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-3 space-y-8">
            <header className="space-y-2">
              <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold">{markets.find((x) => x.id === marketId)?.title ?? 'マーケット'}</h1>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  {markets.find((x) => x.id === marketId)?.overview ?? ''}
                </p>
                {/* 使い方はアプリヘッダーに常時表示 */}
              </div>
            </header>

            {activeAccount.isAdmin && (
              <Card className="shadow ring-2 ring-amber-300 border-amber-300 bg-amber-50">
                <CardContent className="p-3 space-y-3">
                  <div className="text-[11px] text-amber-900 bg-amber-100 border border-amber-300 rounded px-2 py-1 inline-flex items-center gap-1">
                    <span>🔒</span>
                    <span>管理者専用</span>
                  </div>
                  {phase === 'open' && (
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                      <div className="text-sm font-medium">クリックで予測インパクトが最大なものに助成を確定します。decisionフェーズとして強制執行。</div>
                      <div className="flex flex-col items-stretch md:items-end gap-2">
                        <Button variant="primary" onClick={() => adminFixAtIndex(-1)}>今すぐ市場の予測を執行する</Button>
                        <Button variant="secondary" onClick={() => simulateRandomTrades(40)}>ランダムな取引を実行</Button>
                        <Button variant="destructive" onClick={resetAllTrades}>すべての取引を初期化</Button>
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
                        <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={() => {
                          const t = nowTs()
                          setPhase('resolved')
                          setPhaseMarkers((m) => [...m, { t, label: 'Resolution' }])
                          if (resolution) setResolution({ winner: resolution.winner, values: resolutionForm })
                        }}>解決にする（数値を適用）</Button>
                        <Button variant="outline" className="border-amber-300 text-amber-900" onClick={redeemAll}>全員 Redeem</Button>
                      </div>
                    </div>
                  )}
                  {phase === 'resolved' && (
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-green-700">解決済みです。Redeem を実行できます。</div>
                      <Button variant="outline" className="border-amber-300 text-amber-900" onClick={redeemAll}>全員 Redeem</Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {selectedProject == null ? (
              <>
                <Card className="shadow">
                  <CardContent className="p-4">
                    {(() => {
                      const latest = impactChartData.length ? (impactChartData[impactChartData.length - 1] as any) : null
                      const items = [
                        { key: 'ascoe', label: 'アスコエ', color: colors['アスコエ'] },
                        { key: 'civichat', label: 'Civichat', color: colors['Civichat'] },
                        { key: 'handbook', label: 'お悩みハンドブック', color: colors['お悩みハンドブック'] },
                        { key: 'yadokari', label: 'みつもりヤドカリくん', color: colors['みつもりヤドカリくん'] },
                      ]
                      return (
                        <div className="mb-2 flex flex-wrap gap-4 text-xs">
                          {items.map(({ key, label, color }) => (
                            <div key={key} className="flex items-center gap-1">
                              <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
                              <span>
                                {label}
                                {latest && (
                                  <span className="text-gray-500">（{Math.round(latest[key] as number).toLocaleString()}）</span>
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      )
                    })()}
                    <div className="h-[320px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={impactChartData} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(t) => new Date(Number(t)).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} />
                          <YAxis tick={{ fontSize: 11 }} label={{ value: '予測インパクト', angle: -90, position: 'insideLeft' }} />
                          <Tooltip formatter={(v: any) => (typeof v === 'number' ? Math.round(v).toLocaleString() : v)} labelFormatter={(t: any) => new Date(Number(t)).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} />
                          {phaseMarkers.map((m, i) => (
                            <ReferenceLine key={i} x={m.t} stroke="#666" strokeDasharray="4 2">
                              <Label position="insideTop" value={m.label} />
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

                {/* 個別カード：各プロジェクトの Funded / Not Funded を全体ビューでも表示 */}
                <div className="space-y-3 pt-4">
                  <h2 className="text-sm font-medium text-gray-700">各プロジェクトの推移</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(projects as Project[]).map((p) => {
                      const priceF = prices[p.id].funded
                      const priceN = prices[p.id].not_funded
                      const fundedFrozen = frozenFundedZero[p.id]
                      const notFrozen = frozenNot[p.id]
                      const fmtMaybe = (v: number, frozen: boolean) => (frozen ? '-' : v.toFixed(2))
                      const data = perProjectSeries.map((s) => ({ t: s.t, Funded: s.funded[p.id], NotFunded: s.notFunded[p.id] }))
                      const fuP = priceUp(p.markets.funded.qUp, p.markets.funded.qDown, p.markets.funded.b)
                      const nfP = priceUp(p.markets.not_funded.qUp, p.markets.not_funded.qDown, p.markets.not_funded.b)
                      const fundedAbs = impliedValue(fuP, p.rangeMin, p.rangeMax)
                      const notAbs = impliedValue(nfP, p.rangeMin, p.rangeMax)
                      const impactAbs = (fuP - nfP) * (p.rangeMax - p.rangeMin)
                      return (
                        <Card key={p.id} className="shadow">
                          <CardContent className="p-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="font-medium">{p.name}</div>
                              <div className="text-xs rounded-full px-2 py-1 border">{frozenNot[p.id] ? 'FUNDED' : (frozenFundedZero[p.id] ? 'NOT FUNDED' : 'OPEN')}</div>
                            </div>
                            {/* プレビュー（カード一覧）では上部の説明ラベルは非表示 */}
                            <div className="h-[220px]">
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={data} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                                  <CartesianGrid strokeDasharray="3 3" />
                                  <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(t) => new Date(Number(t)).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} />
                                  <YAxis tick={{ fontSize: 11 }} label={{ value: '予想申請数', angle: -90, position: 'insideLeft' }} />
                                  <Tooltip formatter={(v: any) => (typeof v === 'number' ? Math.round(v).toLocaleString() : v)} labelFormatter={(t: any) => new Date(Number(t)).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} />
                                  {phaseMarkers.map((m, i) => (<ReferenceLine key={i} x={m.t} stroke="#92c5de" strokeDasharray="2 2" />))}
                                  <Line type="monotone" dataKey="Funded" name="投資された場合の申請数予想" stroke={colors.Funded} dot={false} strokeWidth={2} />
                                  <Line type="monotone" dataKey="NotFunded" name="投資されなかった場合（通常通り）の申請数予想" stroke={colors.NotFunded} dot={false} strokeWidth={2} />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-700">
                              <div>投資された場合の申請数予想</div>
                              <div className="text-right">{fundedFrozen ? '-' : Math.round(fundedAbs).toLocaleString()}</div>
                              <div>投資されなかった場合（通常通り）の申請数予想</div>
                              <div className="text-right">{notFrozen ? '-' : Math.round(notAbs).toLocaleString()}</div>
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
              </>
            ) : (
              <div className="space-y-4">
                <nav aria-label="Breadcrumb" className="text-xs text-gray-600">
                  <button className="underline hover:text-gray-900" onClick={() => setSelectedProject(null)}>全体</button>
                  <span className="mx-1">/</span>
                  <span className="text-gray-900">{projects.find(p => p.id === selectedProject)?.name}</span>
                </nav>
                <h2 className="text-lg font-medium">{projects.find(p => p.id === selectedProject)?.name}</h2>
                <Card className="shadow">
                  <CardContent className="p-4">
                    <div className="mb-2 flex flex-wrap gap-4 text-xs text-gray-700">
                      {(() => {
                        const sel = projects.find(p => p.id === selectedProject!)!
                        const fuP = priceUp(sel.markets.funded.qUp, sel.markets.funded.qDown, sel.markets.funded.b)
                        const nfP = priceUp(sel.markets.not_funded.qUp, sel.markets.not_funded.qDown, sel.markets.not_funded.b)
                        const fundedAbs = impliedValue(fuP, sel.rangeMin, sel.rangeMax)
                        const notAbs = impliedValue(nfP, sel.rangeMin, sel.rangeMax)
                        return (
                          <>
                            <div className="flex items-center gap-1">
                              <span className="inline-block w-2 h-2 rounded-full" style={{ background: colors.Funded }} />
                              <span>
                                投資された場合の申請数予想
                                <span className="text-gray-500">（{isFundedFrozen ? '-' : Math.round(fundedAbs).toLocaleString()}）</span>
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="inline-block w-2 h-2 rounded-full" style={{ background: colors.NotFunded }} />
                              <span>
                                投資されなかった場合（通常通り）の申請数予想
                                <span className="text-gray-500">（{isNotFrozen ? '-' : Math.round(notAbs).toLocaleString()}）</span>
                              </span>
                            </div>
                          </>
                        )
                      })()}
                    </div>
                    <div className="h-[280px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={perProjectSeries.map((s) => ({ t: s.t, Funded: s.funded[selectedProject!], NotFunded: s.notFunded[selectedProject!] }))} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(t) => new Date(Number(t)).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} />
                          <YAxis tick={{ fontSize: 11 }} label={{ value: '予想申請数', angle: -90, position: 'insideLeft' }} />
                          <Tooltip formatter={(v: any) => (typeof v === 'number' ? Math.round(v).toLocaleString() : v)} labelFormatter={(t: any) => new Date(Number(t)).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} />
                          {phaseMarkers.map((m, i) => (<ReferenceLine key={i} x={m.t} stroke="#92c5de" strokeDasharray="2 2" />))}
                          <Line type="monotone" dataKey="Funded" name="投資された場合の申請数予想" stroke={colors.Funded} dot={false} strokeWidth={2} />
                          <Line type="monotone" dataKey="NotFunded" name="投資されなかった場合（通常通り）の申請数予想" stroke={colors.NotFunded} dot={false} strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
                {/* 詳細ビューでは以下の一覧表示は出さない */}
              </div>
            )}

          </div>

          <div className="space-y-6">
            <Card className="shadow">
              <CardContent className="p-5 md:p-6 space-y-4">
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
                      <option value="funded" disabled={isFundedFrozen}>投資された場合</option>
                      <option value="not_funded" disabled={isNotFrozen}>投資されなかった場合（通常通り）</option>
                    </select>
                  </div>
                  {activeProject && (
                    <div className="space-y-3">
                      {(() => {
                        const isFunded = tradeScenario === 'funded'
                        const abs = Math.round(getCurrentAbs(activeProject, isFunded ? 'funded' : 'not_funded')).toLocaleString()
                        const label = isFunded ? '市場予想: 1億円を投資された場合' : '市場予想: 投資されなかった場合'
                        return (
                          <div className="border-t pt-2">
                            <div className="text-xs text-gray-600">{label}</div>
                            <div className="text-base font-medium">{abs} 件</div>
                          </div>
                        )
                      })()}
                    </div>
                  )}
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                    <Button className="w-full sm:w-auto" variant={tradeSide === 'UP' ? 'default' : 'outline'} disabled={!activeProject} onClick={() => setTradeSide('UP')}>
                      <span aria-hidden className="mr-1">↑</span>UP
                    </Button>
                    <Button className="w-full sm:w-auto" variant={tradeSide === 'DOWN' ? 'default' : 'outline'} disabled={!activeProject} onClick={() => setTradeSide('DOWN')}>
                      <span aria-hidden className="mr-1">↓</span>DOWN
                    </Button>
                  </div>
                  <TradingByAmount
                    project={activeProject}
                    scenario={tradeScenario}
                    side={tradeSide}
                    balance={activeAccount.balance}
                    disabled={(tradeScenario === 'funded' && isFundedFrozen) || (tradeScenario === 'not_funded' && isNotFrozen) || !activeProject}
                    onExecute={(deltaShares, amountPaid) => {
                      if (!activeProject) return
                      buy(activeProject.id, tradeScenario, tradeSide, deltaShares)
                    }}
                  />
                  {/* BaseSection は現在のUI要件では非表示 */}
                </div>
              </CardContent>
            </Card>
            <UserPositionsAllCard items={projects.map(p => ({ id: p.id, name: p.name }))} holdings={activeAccount.holdings} />

          </div>

        </div>
      </div>
      {/* 使い方モーダルはAppヘッダー配下で管理 */}
    </div>
  )
}

type TradingByAmountProps = {
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
    let lo = 0
    let hi = 1
    const maxIter = 60
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

  const ctaLabel = (() => {
    if (scenario === 'funded') {
      return side === 'UP'
        ? '「投資された場合、市場予想より上がる↑」を購入'
        : '「投資された場合、市場予想より下がる↓」購入'
    } else {
      return side === 'UP'
        ? '「通常通りの場合、市場予想より上がる↑」購入'
        : '「通常通りの場合、市場予想より下がる↓」購入'
    }
  })()

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="text-xs text-gray-600">金額</div>
        <div className="flex flex-col items-start gap-2">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Input type="number" className="w-full sm:w-40" value={amount} onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))} disabled={disabled} />
            <span className="text-xs text-gray-500">USDC</span>
          </div>
          <div className="flex flex-row flex-wrap gap-1.5">
            <Button variant="outline" disabled={disabled} onClick={() => setAmount((v) => Math.max(0, v - 1))}>-1</Button>
            <Button variant="outline" disabled={disabled} onClick={() => setAmount((v) => v + 1)}>+1</Button>
            <Button variant="outline" disabled={disabled} onClick={() => setAmount((v) => v + 10)}>+10</Button>
            <Button variant="outline" disabled={disabled} onClick={() => setAmount(balance)}>Max</Button>
          </div>
        </div>
      </div>

      <Button className="w-full h-10" disabled={disabled || amount <= 0 || delta <= 0} onClick={() => onExecute(delta, exactCost)}>{ctaLabel}</Button>

      <div className="space-y-3">
        <div className="border-t pt-2 text-sm font-medium">シナリオ別損益予想</div>
        <div className="space-y-2">
          <div className="text-xs text-gray-600">{scenario === 'funded' ? '投資された場合' : '投資されなかった場合（通常通り）'}のあなたの予想</div>
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
