CFM フロントエンド概要ドキュメント

このドキュメントは、本リポジトリのコードベース（特に `frontend/` 配下）で実現している CFM（予測市場/影響評価 UI）の機能・仕様をまとめたものです。実装はフロントエンドのみで、ローカル状態で単一ユーザーの操作を想定しています。

概要 / コンセプト
- 複数プロジェクトに対し、投資有無（Funded / Not Funded）での結果（例: 申請数）の予想を可視化・更新する。
- LMSR（Logarithmic Market Scoring Rule）に基づいて、価格と保有量、残高が一貫する売買・精算ロジックを提供する。
- 管理者フロー（Impact 最大での確定、解決、精算）をチャートと状態に反映する。

技術スタック
- Vite 4 + React 18 + TypeScript
- Tailwind CSS（簡易 UI コンポーネント）
- Recharts（ラインチャート）
- Node.js 16 でビルド・起動可能（より新しい環境でも可）

主要ディレクトリ / ファイル
- `frontend/src/App.tsx`: 主要な UI/ロジックが集約されたエントリ（正とする実装）。
- `frontend/src/components/ui/`: 最小実装の UI コンポーネント（`button`, `card`, `input`）。
- `frontend/vite.config.ts`, `frontend/tsconfig*.json`: ビルド設定。

用語
- Project: 予測対象（例: アスコエ、Civichat 等）。
- Scenario: `funded`（投資あり）/ `not_funded`（投資なし）。
- Side: `UP` / `DOWN`（二値結果）。
- Phase: `open` → `decided` → `resolved`（開放 → 決定 → 解決）。
- LMSR: ログスコア市場。コスト関数 `C(q)=b·log(exp(q_up/b)+exp(q_down/b))` により価格と損益が決まる。

できること（機能一覧）
- 予想の調整（直感 UI）
  - 選択したプロジェクトに対し、絶対値の予想（申請数）を Funded / Not Funded それぞれで増減または直接入力し「反映」。
  - 反映時、目的の価格に到達するための必要量を自動で売買（LMSR準拠）。残高（`balance`）と保有量（`holdings`）が更新される。
  - 凍結された面（後述）は操作不可。
- チャート
  - 上部: 全体（未選択時）では各プロジェクトの `Forecasted Impact = P(Funded UP) − P(Not UP)` を時系列で表示。
  - プロジェクト選択時: そのプロジェクトの Funded vs Not Funded を時系列表示。
  - フェーズの切替（Decision / Resolution）は縦線（ReferenceLine）とチャート内ラベル（Label）で明示。
  - 全体表示と個別表示の切替（「全体を見る」ボタン）。
- 個別カード（ホーム下部）
  - 各プロジェクトの小型チャート（Funded / Not）と要約情報（Funded/Notの予想、Forecasted Impact、価格）を表示。
  - 凍結された面は値・価格を「-」で表示。
  - 「このプロジェクトを見る」で個別チャートへ遷移。
- 保有シェア
  - ログイン中アカウントの保有量（Funded/Not × UP/DOWN）、各価格、推定価値合計、残高を表示。
  - Base（If Funded / If Not Funded）ペアのミント/マージ（B設計）に対応。ミントで 1 USDC → If Funded 1 + If Not Funded 1。マージでペアを 1 USDC に戻す。
- 管理者フロー
  - Impact 最大で確定（指定時点 or 最新から最大 Impact のプロジェクトを Winner として決定）。
    - Winner: Not Funded = 0 に固定。Others: Funded = 0 に固定。
    - フェーズを `decided` に遷移し、縦線（Decision）を追加。該当面は凍結され以後操作不可。
  - 解決（数値指定）
    - 各プロジェクトの Funded / Not Funded の最終値（絶対値）を入力し「解決にする（数値を適用）」で `resolved` へ。
    - フェーズ縦線（Resolution）を追加。
  - 精算（Redeem）
    - 保有シェアを結果に基づき自動精算（UP: v、DOWN: 1−v で払出、`v` は 0〜1 に正規化した結果）し、保有量を 0 に。

凍結と表示ルール
- `decided` 以降、Winner 側の Not Funded と、非 Winner 側の Funded が凍結される。
- 凍結された面は:
  - 予想の調整不可
  - カード/個別チャート下の値・価格が `-` 表示

データモデル（抜粋）
- 型
  - `Project` … `markets: Record<Scenario, { qUp, qDown, b }>`
  - `Account` … `balance`, `holdings: Record<ProjectId, Record<Scenario, Record<Side, number>>>`, `base: Record<ProjectId, { funded: number; not_funded: number }>`
  - `Phase` … `open | decided | resolved`
- 主な関数
  - `lmsrCost(qUp, qDown, b)`
  - `priceUp(qUp, qDown, b)`
  - `tradeCost(market, side, delta)` → `{ cost, qUp2, qDown2, pre, post }`
  - `qUpForTargetPrice(qDown, b, p)`
- 価格と売買
  - Buy: `delta > 0` を `UP` または `DOWN` に適用し、`cost = post - pre` を支払い、保有量を増やす。
  - Sell: `delta < 0` を適用し、`refund = pre - post` を受け取り、保有量を減らす（LMSR厳守）。
- 予想反映（直感 UI）
  - 目標の絶対値から `pTarget` を算出し、現行価格との差に応じて `UP` もしくは `DOWN` を買い増しする必要量を計算→自動売買。

Base（B設計）
- 「If Funded / If Not Funded」のペアを 1:1 でミント/マージ。
- 清算時は Winner が Funded なら If Funded=1, If Not Funded=0（逆も同様）。
- これにより「Not Funded を持っているから損」という混乱を回避し、損益は各条件下の UP/DOWN 予測の当否で決まることを明示。

操作フロー
- 一般ユーザー
  1) ホーム（全体チャート）で各カードを眺める → 気になるプロジェクトの「このプロジェクトを見る」。
  2) 右パネル「予想の調整」で Funded / Not Funded の絶対値を増減→「反映」。
  3) 保有シェアカードで、保有量・推定価値・残高を確認。
- 管理者
  1) 「Impact 最大で確定」で Winner 決定 → フェーズ `decided`、決定縦線。
  2) 「解決・精算」でプロジェクトの最終値を入力 → 「解決にする（数値を適用）」で `resolved`、解決縦線。
  3) 「全員 Redeem」で精算。

チャート仕様
- ライブラリ: Recharts
- 時刻: `t`（UNIX ms）。`XAxis` は `type="number"` + `domain=['dataMin','dataMax']` + `tickFormatter`。
- フェーズ縦線: `ReferenceLine x={t}` + `Label position="insideTop"`。
- 履歴記録: 5 秒毎にスナップショット（全体 Impact / 各プロジェクト Funded/Not）。

制約 / 注意点
- フロントエンドのみ。状態はリロードで消える（永続化なし）。
- マルチユーザー / サーバ同期は未実装。
- 金額や数量は単位のない抽象値。UIの利便のため連続量として扱う。
- デフォルトパラメータ: `b = 180`、ベースライン例として 5000（絶対値）。

開発 / ビルド / 起動
- 依存: Node.js 16 以上
- コマンド
  - 開発起動: `cd frontend && npm install && npm run dev`
  - ビルド: `cd frontend && npm run build`
- 主要パス
  - エントリ: `frontend/src/App.tsx`
  - UI: `frontend/src/components/ui/`

カスタマイズのポイント
- プロジェクトリスト/範囲: `initialProjects`（`App.tsx`）
- 市場パラメータ `b`: `DEFAULT_B`
- ヒストリ刻み: `setInterval(..., 5000)`
- 表示スタイル: Tailwind クラス（カード可読性、凡例、色）

今後の拡張例
- サーバ連携（認証、注文・残高・保有の永続化）
- 入力検証と操作ログ（監査・ロールバック）
- 表示最適化（モバイル、縮尺、ダウンサンプリング）
- 価格差や出来高などの追加指標、注釈（イベント）
- 管理者 UI の権限管理

本ドキュメントはコードの現状機能を網羅的に記述したものです。要件変更や機能追加に応じて更新してください。


設計ノート: 取引仕様の整合性（Buy/Sell）
- 本コードベースでは、Buy/Sell の双方を LMSR のコスト関数差分で対称に扱う。
  - Buy: delta>0 をサイド（UP or DOWN）に適用し、cost=post−pre を支払う。q は該当サイドのみ増加。
  - Sell: delta<0 を同サイドに適用し、refund=pre−post を受け取る。q は該当サイドのみ減少。
- これは「Sell を反対サイドの Buy で表現する」実装（tradeCost(m, sideOpp, shares) で q を更新）と等価であり、資金保存と無裁定性を保つ。
- 旧版（v6 付近）で一時的に使っていた簡易売却（現在価格×数量、q不変）は不整合と裁定余地を生むため、廃止済み。
- 実装上は delta の符号で同一関数（tradeCost）を使い分ける方式を採用し、シンプルさと可読性を優先している。
