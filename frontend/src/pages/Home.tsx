import { Card, CardContent } from '@/components/ui/card'
import { markets } from '@/lib/markets'

// 予測インパクト簡易計算（MarketPage と揃える）
const impliedValue = (p: number, min: number, max: number) => min + p * (max - min)
const priceUp = (qUp: number, qDown: number, b: number) => {
  const eU = Math.exp(qUp / b)
  const eD = Math.exp(qDown / b)
  return eU / (eU + eD)
}

// プレビュー用の簡易プロジェクト定義（MarketPage 初期値と同一）
const DEFAULT_B = 180
const previewProjects = [
  { id: 'ascoe', name: 'アスコエ', rangeMin: 0, rangeMax: 10000, markets: { funded: { qUp: 0, qDown: 0, b: DEFAULT_B }, not_funded: { qUp: 0, qDown: 0, b: DEFAULT_B } } },
  { id: 'civichat', name: 'Civichat', rangeMin: 0, rangeMax: 10000, markets: { funded: { qUp: 0, qDown: 0, b: DEFAULT_B }, not_funded: { qUp: 0, qDown: 0, b: DEFAULT_B } } },
  { id: 'handbook', name: 'お悩みハンドブック', rangeMin: 0, rangeMax: 10000, markets: { funded: { qUp: 0, qDown: 0, b: DEFAULT_B }, not_funded: { qUp: 0, qDown: 0, b: DEFAULT_B } } },
  { id: 'yadokari', name: 'みつもりヤドカリくん', rangeMin: 0, rangeMax: 10000, markets: { funded: { qUp: 0, qDown: 0, b: DEFAULT_B }, not_funded: { qUp: 0, qDown: 0, b: DEFAULT_B } } },
]

const calcImpactAbs = (p: any) => {
  const fu = priceUp(p.markets.funded.qUp, p.markets.funded.qDown, p.markets.funded.b)
  const nf = priceUp(p.markets.not_funded.qUp, p.markets.not_funded.qDown, p.markets.not_funded.b)
  return (fu - nf) * (p.rangeMax - p.rangeMin)
}

export default function Home() {
  return (
    <div className="min-h-dvh w-full bg-white">
      <div className="p-6 md:p-8">
        <div className="mx-auto max-w-7xl space-y-4">
          <h1 className="text-xl font-semibold">マーケット一覧</h1>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(420px,1fr))] gap-8">
          {markets.map((m) => (
            <Card
              key={m.id}
              className="shadow cursor-pointer hover:shadow-md transition"
              onClick={() => (window.location.hash = `#market/${m.id}`)}
              role="button"
              tabIndex={0}
            >
              <CardContent className="p-6 space-y-3">
                {/* 市場詳細と同一のタイトルを表示 */}
                <div className="text-xl font-medium leading-snug">{m.title}</div>
                <div className="text-sm text-gray-600">{m.overview}</div>

                {/* プロジェクトごとの予測インパクト（簡易プレビュー） */}
                <div className="mt-3 divide-y">
                  {previewProjects.map((p) => {
                    const impact = calcImpactAbs(p)
                    return (
                      <div key={p.id} className="py-3 flex items-center justify-between">
                        <div className="text-base font-medium">{p.name}</div>
                        <div className="text-base text-gray-700">{impact.toFixed(0)}</div>
                      </div>
                    )
                  })}
                </div>
                {/* 明示的な「詳細を開く」ボタンは廃止し、カード全体で遷移 */}
              </CardContent>
            </Card>
          ))}
          </div>
        </div>
      </div>
    </div>
  )
}
