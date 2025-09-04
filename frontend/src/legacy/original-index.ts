import React, { useMemo, useRef, useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";

// =====================================================
// CFM 風プロトタイプ (v6)
// - Fix: 保有シェアの更新（Sell を単純化: 現在価格×数量で精算し q は変更しない）
// - Fix: フェーズ縦線（time(ms) 軸に ReferenceLine を描画）
// - Copy: 文言を "Forecasted Impact (= P(Funded UP) − P(Not UP))" に修正
// - Add: 全体 Impact の下に個別カードチャート（Funded vs Not Funded）を並べて表示
// - Keep: Admin 決定→ winner Not=0 / others Funded=0、解決→結果入力→Redeem
// =====================================================

type Scenario = "funded" | "not_funded";
type Side = "UP" | "DOWN";
type ProjectId = "ascoe" | "civichat" | "handbook" | "yadokari";

type Phase = "open" | "decided" | "resolved";

interface MarketState { qUp: number; qDown: number; b: number; }
interface Project {
    id: ProjectId; name: string; rangeMin: number; rangeMax: number; markets: Record<Scenario, MarketState>;
}

interface Account {
    id: string; name: string; balance: number; isAdmin: boolean;
    holdings: Record<ProjectId, Record<Scenario, Record<Side, number>>>;
}

// ---- LMSR（二項）
const lmsrCost = (qUp: number, qDown: number, b: number) => b * Math.log(Math.exp(qUp / b) + Math.exp(qDown / b));
const priceUp = (qUp: number, qDown: number, b: number) => {
    const eU = Math.exp(qUp / b), eD = Math.exp(qDown / b); return eU / (eU + eD);
};
const tradeCost = (m: MarketState, side: Side, delta: number) => {
    const pre = lmsrCost(m.qUp, m.qDown, m.b);
    const qUp2 = m.qUp + (side === "UP" ? delta : 0);
    const qDown2 = m.qDown + (side === "DOWN" ? delta : 0);
    const post = lmsrCost(qUp2, qDown2, m.b);
    const cost = post - pre; const pUp = priceUp(qUp2, qDown2, m.b);
    return { cost, qUp2, qDown2, pUp };
};
// 逆関数: 目標 priceUp=p の qUp' を解く
const qUpForTargetPrice = (qDown: number, b: number, p: number) => qDown - b * Math.log(1 / p - 1);

const DEFAULT_B = 180;
const initialProjects: Project[] = [
    { id: "ascoe", name: "アスコエ", rangeMin: 0, rangeMax: 10000, markets: { funded: { qUp: 0, qDown: 0, b: DEFAULT_B }, not_funded: { qUp: 0, qDown: 0, b: DEFAULT_B } } },
    { id: "civichat", name: "Civichat", rangeMin: 0, rangeMax: 10000, markets: { funded: { qUp: 0, qDown: 0, b: DEFAULT_B }, not_funded: { qUp: 0, qDown: 0, b: DEFAULT_B } } },
    { id: "handbook", name: "お悩みハンドブック", rangeMin: 0, rangeMax: 10000, markets: { funded: { qUp: 0, qDown: 0, b: DEFAULT_B }, not_funded: { qUp: 0, qDown: 0, b: DEFAULT_B } } },
    { id: "yadokari", name: "みつもりヤドカリくん", rangeMin: 0, rangeMax: 10000, markets: { funded: { qUp: 0, qDown: 0, b: DEFAULT_B }, not_funded: { qUp: 0, qDown: 0, b: DEFAULT_B } } },
];

const impliedValue = (p: number, min: number, max: number) => min + p * (max - min);
const clamp01 = (x: number) => Math.max(0.0001, Math.min(0.9999, x));
const nowTs = () => Date.now();

function emptyHoldings(): Account["holdings"] {
    return {
        ascoe: { funded: { UP: 0, DOWN: 0 }, not_funded: { UP: 0, DOWN: 0 } },
        civichat: { funded: { UP: 0, DOWN: 0 }, not_funded: { UP: 0, DOWN: 0 } },
        handbook: { funded: { UP: 0, DOWN: 0 }, not_funded: { UP: 0, DOWN: 0 } },
        yadokari: { funded: { UP: 0, DOWN: 0 }, not_funded: { UP: 0, DOWN: 0 } },
    };
}

const initialAccounts: Account[] = [
    { id: "admin", name: "Admin", balance: 1000, isAdmin: true, holdings: emptyHoldings() },
    { id: "user1", name: "User 1", balance: 1000, isAdmin: false, holdings: emptyHoldings() },
    { id: "user2", name: "User 2", balance: 1000, isAdmin: false, holdings: emptyHoldings() },
    { id: "user3", name: "User 3", balance: 1000, isAdmin: false, holdings: emptyHoldings() },
    { id: "user4", name: "User 4", balance: 1000, isAdmin: false, holdings: emptyHoldings() },
];

export default function App() {
    const [projects, setProjects] = useState<Project[]>(initialProjects);
    const [accounts, setAccounts] = useState<Account[]>(initialAccounts);
    const [activeAccountId, setActiveAccountId] = useState<string>("admin");
    const activeAccount = useMemo(() => accounts.find(a => a.id === activeAccountId)!, [accounts, activeAccountId]);

    const [selectedProject, setSelectedProject] = useState<ProjectId | null>(null);
    const [deltaFunded, setDeltaFunded] = useState<number>(0);
    const [deltaNot, setDeltaNot] = useState<number>(0);

    // フェーズ
    const [phase, setPhase] = useState<Phase>("open");
    const [phaseMarkers, setPhaseMarkers] = useState<{ t: number; label: string }[]>([{ t: nowTs(), label: "Open" }]);

    // ロック
    const [frozenNot, setFrozenNot] = useState<Record<ProjectId, boolean>>({ ascoe: false, civichat: false, handbook: false, yadokari: false });
    const [frozenFundedZero, setFrozenFundedZero] = useState<Record<ProjectId, boolean>>({ ascoe: false, civichat: false, handbook: false, yadokari: false });

    // 解決
    const [resolution, setResolution] = useState<null | { winner: ProjectId; values: Record<ProjectId, { funded?: number; not_funded?: number }> }>(null);

    // ===== 時系列（Impact と 各プロジェクトの Funded/Not）
    type ImpactPoint = { t: number } & Record<ProjectId, number>;
    const [impactHistory, setImpactHistory] = useState<ImpactPoint[]>(() => [{ t: nowTs(), ...impactSnapshotAbs(initialProjects) }]);
    type PerProjectPoint = { t: number; funded: Record<ProjectId, number>; notFunded: Record<ProjectId, number> };
    const [perProjectHistory, setPerProjectHistory] = useState<PerProjectPoint[]>(() => [snapshotPerProject(initialProjects)]);
    const [detailHistory, setDetailHistory] = useState<{ t: number; funded: number; not: number; }[]>([]);
    const tickerRef = useRef<number | null>(null);

    function impactSnapshotNorm(ps: Project[]) {
        const res: Record<ProjectId, number> = { ascoe: 0, civichat: 0, handbook: 0, yadokari: 0 };
        ps.forEach(prj => {
            const fu = priceUp(prj.markets.funded.qUp, prj.markets.funded.qDown, prj.markets.funded.b);
            const nf = priceUp(prj.markets.not_funded.qUp, prj.markets.not_funded.qDown, prj.markets.not_funded.b);
            res[prj.id] = fu - nf;
        });
        return res;
    }
    function impactSnapshotAbs(ps: Project[]) {
        const n = impactSnapshotNorm(ps);
        return { ascoe: n.ascoe * 10000, civichat: n.civichat * 10000, handbook: n.handbook * 10000, yadokari: n.yadokari * 10000 } as Record<ProjectId, number>;
    }
    function snapshotPerProject(ps: Project[]): PerProjectPoint {
        const funded: Record<ProjectId, number> = { ascoe: 0, civichat: 0, handbook: 0, yadokari: 0 };
        const notFunded: Record<ProjectId, number> = { ascoe: 0, civichat: 0, handbook: 0, yadokari: 0 };
        ps.forEach(prj => {
            const fuP = priceUp(prj.markets.funded.qUp, prj.markets.funded.qDown, prj.markets.funded.b);
            const nfP = priceUp(prj.markets.not_funded.qUp, prj.markets.not_funded.qDown, prj.markets.not_funded.b);
            funded[prj.id] = impliedValue(fuP, prj.rangeMin, prj.rangeMax);
            notFunded[prj.id] = impliedValue(nfP, prj.rangeMin, prj.rangeMax);
        });
        return { t: nowTs(), funded, notFunded };
    }
    function detailSnapshot(pid: ProjectId) {
        const prj = projects.find(p => p.id === pid)!;
        const fuP = priceUp(prj.markets.funded.qUp, prj.markets.funded.qDown, prj.markets.funded.b);
        const nfP = priceUp(prj.markets.not_funded.qUp, prj.markets.not_funded.qDown, prj.markets.not_funded.b);
        return { t: nowTs(), funded: impliedValue(fuP, prj.rangeMin, prj.rangeMax), not: impliedValue(nfP, prj.rangeMin, prj.rangeMax) };
    }

    // 5秒ごとに履歴を刻む
    useEffect(() => {
        if (tickerRef.current) window.clearInterval(tickerRef.current);
        tickerRef.current = window.setInterval(() => {
            setImpactHistory(h => [...h, { t: nowTs(), ...impactSnapshotAbs(projects) }]);
            setPerProjectHistory(h => [...h, snapshotPerProject(projects)]);
            if (selectedProject) setDetailHistory(h => [...h, detailSnapshot(selectedProject)]);
        }, 5000);
        return () => { if (tickerRef.current) window.clearInterval(tickerRef.current); };
    }, [projects, selectedProject]);

    // 選択
    const onSelectProject = (pid: ProjectId) => { setSelectedProject(pid); setDeltaFunded(0); setDeltaNot(0); setDetailHistory([detailSnapshot(pid)]); };

    // 予想反映
    const applyTarget = (pid: ProjectId, scenario: Scenario, targetAbs: number) => {
        setProjects(prev => {
            const ps = prev.map(p => ({ ...p, markets: { funded: { ...p.markets.funded }, not_funded: { ...p.markets.not_funded } } }));
            const prj = ps.find(p => p.id === pid)!; const m = prj.markets[scenario];
            const pTarget = clamp01((targetAbs - prj.rangeMin) / (prj.rangeMax - prj.rangeMin));
            const qUtarget = qUpForTargetPrice(m.qDown, m.b, pTarget);
            prj.markets[scenario] = { ...m, qUp: qUtarget };
            setImpactHistory(h => [...h, { t: nowTs(), ...impactSnapshotAbs(ps) }]);
            setPerProjectHistory(h => [...h, snapshotPerProject(ps)]);
            if (selectedProject === pid) setDetailHistory(h => [...h, detailSnapshot(pid)]);
            return ps;
        });
    };

    // ===== 取引（Buy/Sell）
    const [tradeShares, setTradeShares] = useState<number>(10);
    const buy = (pid: ProjectId, scenario: Scenario, side: Side, shares: number) => {
        if (shares <= 0) return;
        const prj = projects.find(p => p.id === pid)!; const m = prj.markets[scenario];
        const { cost, qUp2, qDown2 } = tradeCost(m, side, shares);
        if (activeAccount.balance < cost) return alert("残高不足");
        // 市場＆アカウント更新
        setProjects(ps => ps.map(p => p.id !== pid ? p : ({ ...p, markets: { ...p.markets, [scenario]: { ...m, qUp: qUp2, qDown: qDown2 } } })));
        setAccounts(accs => accs.map(a => a.id !== activeAccount.id ? a : ({
            ...a, balance: a.balance - cost,
            holdings: { ...a.holdings, [pid]: { ...a.holdings[pid], [scenario]: { ...a.holdings[pid][scenario], [side]: a.holdings[pid][scenario][side] + shares } } }
        })));
        // 履歴
        setImpactHistory(h => [...h, { t: nowTs(), ...impactSnapshotAbs(projects) }]);
        setPerProjectHistory(h => [...h, snapshotPerProject(projects)]);
    };

    // Sell を単純化: 現在価格 × shares を払い戻し。q は変更しない（UI簡略モデル）
    const sell = (pid: ProjectId, scenario: Scenario, side: Side, shares: number) => {
        if (shares <= 0) return;
        const have = activeAccount.holdings[pid][scenario][side]; if (have < shares) return alert("保有シェアが不足");
        const prj = projects.find(p => p.id === pid)!; const m = prj.markets[scenario];
        const pUp = priceUp(m.qUp, m.qDown, m.b); const price = side === 'UP' ? pUp : (1 - pUp);
        const payout = price * shares;
        setAccounts(accs => accs.map(a => a.id !== activeAccount.id ? a : ({
            ...a, balance: a.balance + payout,
            holdings: { ...a.holdings, [pid]: { ...a.holdings[pid], [scenario]: { ...a.holdings[pid][scenario], [side]: have - shares } } }
        })));
    };

    // Admin: 最大 Impact で確定（縦線 & phase）
    const adminFixAtIndex = (idx: number) => {
        if (!activeAccount.isAdmin) return;
        // 影響値スナップショット
        let snap: Record<ProjectId, number> | null = null;
        if (idx < 0) snap = impactSnapshotAbs(projects); else { const it = impactHistory[idx]; if (!it) return; snap = { ascoe: it.ascoe, civichat: it.civichat, handbook: it.handbook, yadokari: it.yadokari } as any; }
        const [winner] = (Object.entries(snap!) as [ProjectId, number][]).reduce((a, b) => a[1] >= b[1] ? a : b);

        setProjects(prev => {
            const ps = prev.map(p => ({ ...p, markets: { funded: { ...p.markets.funded }, not_funded: { ...p.markets.not_funded } } }));
            // winner: Not funded=0
            const win = ps.find(p => p.id === winner)!; const mNF = win.markets.not_funded;
            const p0 = clamp01((0 - win.rangeMin) / (win.rangeMax - win.rangeMin)); const qU0 = qUpForTargetPrice(mNF.qDown, mNF.b, p0);
            win.markets.not_funded = { ...mNF, qUp: qU0 };
            // losers: Funded=0
            ps.forEach(p => { if (p.id === winner) return; const mF = p.markets.funded; const p0f = clamp01((0 - p.rangeMin) / (p.rangeMax - p.rangeMin)); const qU0f = qUpForTargetPrice(mF.qDown, mF.b, p0f); p.markets.funded = { ...mF, qUp: qU0f }; });
            // ロック
            setFrozenNot(fn => ({ ...fn, [winner]: true }));
            setFrozenFundedZero(ff => { const next = { ...ff } as Record<ProjectId, boolean>; (Object.keys(ff) as ProjectId[]).forEach(pid => { if (pid !== winner) next[pid] = true; }); return next; });
            // フェーズ & マーカー
            const t = nowTs(); setPhase("decided"); setPhaseMarkers(m => [...m, { t, label: "Decision" }]);
            // 解決フォーム用
            const vals: Record<ProjectId, { funded?: number; not_funded?: number }> = { ascoe: {}, civichat: {}, handbook: {}, yadokari: {} };
            setResolution({ winner, values: vals });
            // 履歴
            setImpactHistory(h => [...h, { t, ...impactSnapshotAbs(ps) }]); setPerProjectHistory(h => [...h, snapshotPerProject(ps)]);
            if (selectedProject) setDetailHistory(h => [...h, detailSnapshot(selectedProject)]);
            return ps;
        });
    };

    // Admin: 解決
    const adminResolve = () => {
        if (!activeAccount.isAdmin || !resolution) return; const { winner, values } = resolution;
        const filled: Record<ProjectId, { funded?: number; not_funded?: number }> = { ascoe: {}, civichat: {}, handbook: {}, yadokari: {} };
        (Object.keys(values) as ProjectId[]).forEach(pid => { filled[pid] = { ...values[pid] }; if (pid === winner) { if (filled[pid].funded == null) filled[pid].funded = 5000; } else { if (filled[pid].not_funded == null) filled[pid].not_funded = 5000; } });
        const t = nowTs(); setPhase("resolved"); setPhaseMarkers(m => [...m, { t, label: "Resolution" }]); setResolution({ winner, values: filled });
    };

    // Redeem（全て）
    const redeemAll = () => {
        if (phase !== "resolved" || !resolution) return; const { winner, values } = resolution;
        setAccounts(prev => prev.map(a => {
            let bal = a.balance; const newHold = JSON.parse(JSON.stringify(a.holdings)) as Account["holdings"];
            (Object.keys(newHold) as ProjectId[]).forEach(pid => {
                const prj = projects.find(p => p.id === pid)!; const min = prj.rangeMin, max = prj.rangeMax;
                const vFundedAbs = (pid === winner) ? (values[pid].funded ?? 5000) : undefined; const vNotAbs = (pid !== winner) ? (values[pid].not_funded ?? 5000) : undefined;
                (['funded', 'not_funded'] as Scenario[]).forEach(sc => {
                    const outcomeAbs = sc === 'funded' ? vFundedAbs : vNotAbs; if (outcomeAbs == null) return;
                    const v = clamp01((outcomeAbs - min) / (max - min));
                    (['UP', 'DOWN'] as Side[]).forEach(sd => { const q = newHold[pid][sc][sd]; if (q > 0) { const payout = (sd === 'UP' ? v : (1 - v)) * q; bal += payout; newHold[pid][sc][sd] = 0; } });
                });
            });
            return { ...a, balance: bal, holdings: newHold };
        }));
    };

    // ===== テーブル =====
    const tableRows = useMemo(() => projects.map(p => {
        const fuP = priceUp(p.markets.funded.qUp, p.markets.funded.qDown, p.markets.funded.b);
        const nfP = priceUp(p.markets.not_funded.qUp, p.markets.not_funded.qDown, p.markets.not_funded.b);
        return { id: p.id, name: p.name, fundedAbs: impliedValue(fuP, p.rangeMin, p.rangeMax), notAbs: impliedValue(nfP, p.rangeMin, p.rangeMax), impactAbs: (fuP - nfP) * (p.rangeMax - p.rangeMin) };
    }), [projects]);

    const prices = useMemo(() => {
        const map: Record<ProjectId, { funded: { up: number; down: number }, not_funded: { up: number; down: number } }> = {
            ascoe: { funded: { up: 0, down: 0 }, not_funded: { up: 0, down: 0 } },
            civichat: { funded: { up: 0, down: 0 }, not_funded: { up: 0, down: 0 } },
            handbook: { funded: { up: 0, down: 0 }, not_funded: { up: 0, down: 0 } },
            yadokari: { funded: { up: 0, down: 0 }, not_funded: { up: 0, down: 0 } },
        };
        projects.forEach(p => { const fu = priceUp(p.markets.funded.qUp, p.markets.funded.qDown, p.markets.funded.b); const nf = priceUp(p.markets.not_funded.qUp, p.markets.not_funded.qDown, p.markets.not_funded.b); map[p.id].funded = { up: fu, down: 1 - fu }; map[p.id].not_funded = { up: nf, down: 1 - nf }; });
        return map;
    }, [projects]);

    // ===== チャート用データ（ms 時刻） =====
    const impactChartData = useMemo(() => impactHistory.map(pt => ({ t: pt.t, ascoe: pt.ascoe, civichat: pt.civichat, handbook: pt.handbook, yadokari: pt.yadokari })), [impactHistory]);
    const detailChartData = useMemo(() => selectedProject ? detailHistory.map(pt => ({ t: pt.t, Funded: pt.funded, NotFunded: pt.not })) : [], [detailHistory, selectedProject]);
    const perProjectSeries = useMemo(() => perProjectHistory, [perProjectHistory]);

    const colors: Record<string, string> = { アスコエ: "#1f77b4", Civichat: "#2ca02c", お悩みハンドブック: "#ff7f0e", みつもりヤドカリくん: "#d62728", Funded: "#1f77b4", NotFunded: "#808080" };

    const active = selectedProject ? projects.find(p => p.id === selectedProject)! : null;
    const fundedCurrent = active ? impliedValue(priceUp(active.markets.funded.qUp, active.markets.funded.qDown, active.markets.funded.b), active.rangeMin, active.rangeMax) : 5000;
    const notCurrent = active ? impliedValue(priceUp(active.markets.not_funded.qUp, active.markets.not_funded.qDown, active.markets.not_funded.b), active.rangeMin, active.rangeMax) : 5000;

    const adminOptions = useMemo(() => impactHistory.map((h, i) => ({ idx: i, label: `${i}: ${new Date(h.t).toLocaleTimeString()}` })), [impactHistory]);
    const [adminIdx, setAdminIdx] = useState<number>(-1);

    const fmtMaybe = (val: number, hide: boolean) => hide ? "-" : val.toFixed(2);

    return (
        <div className= "min-h-dvh w-full bg-white p-6" >
        <div className="mx-auto max-w-7xl grid grid-cols-1 md:grid-cols-4 gap-6" >
            {/* 左：メイン */ }
            < div className = "md:col-span-3 space-y-6" >
                {/* Header: タイトル + アカウント切替 */ }
                < header className = "space-y-2" >
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between" >
                        <h1 className="text-2xl font-bold" > それぞれの社会保障制度の診断プロジェクトに1億円を投資した場合、各プロジェクトの申請数を予測する。</h1>
                            < div className = "flex items-center gap-2" >
                                <span className="text-sm text-gray-600" > アカウント </span>
                                    < Select value = { activeAccountId } onValueChange = { setActiveAccountId } >
                                        <SelectTrigger className="w-40" > <SelectValue /></SelectTrigger >
                                            <SelectContent>
                                            { accounts.map(a => (<SelectItem key= { a.id } value = { a.id } > { a.name }{ a.isAdmin ? " 管理者" : "" } </SelectItem>)) }
                                            </SelectContent>
                                            </Select>
                                            < span className = "text-sm text-gray-600 ml-2" > 残高: <b>{ activeAccount.balance.toFixed(2) } < /b> USDC</span >
                                                </div>
                                                </div>
                                                < p className = "text-sm text-gray-600" > 上段: 全体の < b > Forecasted Impact = P(Funded UP) − P(Not UP) < /b>。下段: 各プロジェクトの Funded vs Not Funded。</p >
                                                    </header>

    {/* Admin ツール（adminのみ） */ }
    {
        activeAccount.isAdmin && (
            <Card className="shadow" >
                <CardContent className="p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3" >
                    <div className="text-sm font-medium" > Admin: 指定時点の Impact 最大プロジェクトを確定（Winner→Not funded = 0 / Others→Funded = 0）</div>
                        < div className = "flex items-center gap-2" >
                            <Select value={ String(adminIdx) } onValueChange = {(v) => setAdminIdx(Number(v))
    }>
        <SelectTrigger className="w-48" > <SelectValue placeholder="時点を選択" /> </SelectTrigger>
            < SelectContent >
            <SelectItem value="-1" > 現在（最新）</SelectItem>
    { adminOptions.map(o => (<SelectItem key= { o.idx } value = { String(o.idx) }> { o.label } </SelectItem>))
}
</SelectContent>
    </Select>
    < Button onClick = {() => adminFixAtIndex(adminIdx)}> Impact最大で確定 </Button>
        </div>
        </CardContent>
        </Card>
          )}

{/* 全体: Forecasted Impact チャート */ }
<Card className="shadow" >
    <CardContent className="p-4" >
        <div className="h-[420px]" >
            <ResponsiveContainer width="100%" height = "100%" >
                <LineChart data={ impactChartData } margin = {{ left: 8, right: 16, top: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="t" type = "number" domain = { ["dataMin", "dataMax"]} tickFormatter = {(t)=> new Date(t).toLocaleTimeString()} />
                            < YAxis tick = {{ fontSize: 12 }} label = {{ value: "Forecasted Impact", angle: -90, position: "insideLeft" }} />
                                < Tooltip formatter = {(v: number) => v.toFixed(2)} labelFormatter = {(t)=> new Date(Number(t)).toLocaleTimeString()} />
                                    < Legend />
                                    { phaseMarkers.map((m, i) => (<ReferenceLine key= { i } x = { m.t } stroke = "#666" strokeDasharray = "4 2" label = {{ position: 'top', value: m.label }} />))}
<Line type="monotone" dataKey = "ascoe" name = "アスコエ" stroke = { colors["アスコエ"]} dot = { false} strokeWidth = { 2} />
    <Line type="monotone" dataKey = "civichat" name = "Civichat" stroke = { colors["Civichat"]} dot = { false} strokeWidth = { 2} />
        <Line type="monotone" dataKey = "handbook" name = "お悩みハンドブック" stroke = { colors["お悩みハンドブック"]} dot = { false} strokeWidth = { 2} />
            <Line type="monotone" dataKey = "yadokari" name = "みつもりヤドカリくん" stroke = { colors["みつもりヤドカリくん"]} dot = { false} strokeWidth = { 2} />
                </LineChart>
                </ResponsiveContainer>
                </div>
                </CardContent>
                </Card>

{/* 個別カード：各プロジェクトの Funded vs Not Funded */ }
<div className="grid grid-cols-1 md:grid-cols-2 gap-4" >
    {(projects as Project[]).map(p => {
        const data = perProjectSeries.map(s => ({ t: s.t, Funded: s.funded[p.id], NotFunded: s.notFunded[p.id] }));
        const status = frozenNot[p.id] ? 'FUNDED' : (frozenFundedZero[p.id] ? 'NOT FUNDED' : 'OPEN');
        const priceTag = prices[p.id].funded.up * 10000 - prices[p.id].not_funded.up * 10000; // 簡易: 差分の絶対換算の目安
        return (
            <Card key= { p.id } className = "shadow" >
                <CardContent className="p-4 space-y-2" >
                    <div className="flex items-center justify-between" >
                        <div className="font-medium" > { p.name } </div>
                            < div className = "text-xs rounded-full px-2 py-1 border" > { status } </div>
                                </div>
                                < div className = "text-xs text-gray-600" > Estimate Δ ~{ priceTag.toFixed(2) } </div>
                                    < div className = "h-[220px]" >
                                        <ResponsiveContainer width="100%" height = "100%" >
                                            <LineChart data={ data } margin = {{ left: 8, right: 16, top: 8, bottom: 8 }
    }>
    <CartesianGrid strokeDasharray="3 3" />
    <XAxis dataKey="t" type = "number" domain = { ["dataMin", "dataMax"]} tickFormatter = {(t)=> new Date(t).toLocaleTimeString()} />
    < YAxis tick = {{ fontSize: 11 }} label = {{ value: "予想申請数", angle: -90, position: "insideLeft" }} />
    < Tooltip formatter = {(v: number) => v.toFixed(2)} labelFormatter = {(t)=> new Date(Number(t)).toLocaleTimeString()} />
                          { phaseMarkers.map((m, i) => (<ReferenceLine key= { i } x = { m.t } stroke = "#92c5de" strokeDasharray = "2 2" />))}
<Line type="monotone" dataKey = "Funded" stroke = { colors.Funded } dot = { false} strokeWidth = { 2} />
    <Line type="monotone" dataKey = "NotFunded" stroke = { colors.NotFunded } dot = { false} strokeWidth = { 2} />
        </LineChart>
        </ResponsiveContainer>
        </div>
        < div className = "pt-2" >
            <Button className="w-full" onClick = {() => onSelectProject(p.id)}> Trade now </Button>
                </div>
                </CardContent>
                </Card>
              );
            })}
</div>

{/* 現在の状態（テーブル） */ }
<Card className="shadow" >
    <CardContent className="p-4" >
        <div className="mb-2 text-sm text-gray-600" > 凍結済みの面は "-" 表示。状態列は開放 / 確定 / 解決済みを表示。</div>
            < div className = "overflow-x-auto" >
                <table className="min-w-full text-sm" >
                    <thead>
                    <tr className="text-left text-gray-500" >
                        <th className="p-2" > プロジェクト </th>
                            < th className = "p-2" > 1億円投資の予想 </th>
                                < th className = "p-2" > 非投資の予想 </th>
                                    < th className = "p-2" > Forecasted Impact </th>
                                        < th className = "p-2" > 価格(Funded UP / DOWN) </th>
                                            < th className = "p-2" > 価格(Not UP / DOWN) </th>
                                                < th className = "p-2" > 状態 </th>
                                                    </tr>
                                                    </thead>
                                                    <tbody>
{
    tableRows.map(r => {
        const pid = r.id as ProjectId; const fundedFrozen = frozenFundedZero[pid]; const notFrozen = frozenNot[pid]; const priceF = prices[pid].funded; const priceN = prices[pid].not_funded;
        return (
            <tr key= { r.id } className = {`border-t cursor-pointer hover:bg-gray-50 ${selectedProject === r.id ? "bg-gray-50" : ""}`
    } onClick = {() => onSelectProject(r.id as ProjectId)}>
        <td className="p-2" > {
