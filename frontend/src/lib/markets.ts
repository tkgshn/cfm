export type MarketMeta = {
  id: string
  name: string
  // 市場詳細ページの見出しと同一にするタイトル
  title: string
  // ホームに表示する市場の概要（市場詳細の説明と一致）
  overview: string
  description?: string
}

// 複数市場のメタデータ。必要に応じて API 連携に差し替え可能。
export const markets: MarketMeta[] = [
  {
    id: 'default',
    name: 'CFM デモ市場',
    title: 'それぞれの社会保障制度の診断プロジェクトに1億円を投資した場合の各プロジェクトの申請数を予測する',
    overview: '各プロジェクトに「1億円を追加投資した場合（Funded）」と「投資しない場合（Not funded）」の、それぞれにおける「資金配分から1カ月後の月間申請件数」を予測します',
    description: '4案件（アスコエ/Civichat/お悩みハンドブック/ヤドカリ）を含むデモ用市場',
  },
]
