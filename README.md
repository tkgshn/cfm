CFM プロジェクト整備メモ

概要
- フロントエンドを `frontend/` ディレクトリに分割し、Vite + React + TypeScript + Tailwind で起動できるよう整備しました。
- 依存: Node.js 16 でも動作するよう、Vite 4 + React 18 構成に固定しています。
- 元のフロント実装（`index.ts`）はフォーマット崩れが多かったため、そのままではビルド不能です。ソースは `frontend/src/legacy/original-index.ts` に保存しました。

起動方法
1. `cd frontend`
2. `npm install`
3. `npm run dev`
4. ローカルURL（例: `http://127.0.0.1:5173/`）へアクセス

ビルド
- `cd frontend && npm run build` → `frontend/dist/` に出力

ディレクトリ
- `frontend/src/components/ui/` … Button/Card/Input/Select の最小UIコンポーネント
- `frontend/src/legacy/original-index.ts` … 旧フロント（移植元/参考用）

今後の移植ガイド
- 旧 `index.ts` は JSX タグに余分なスペース（例: `< div`）が含まれ、単純置換では演算子（`< cost`）も破損するため、下記方針で段階移植してください:
  - ロジック層（型定義、LMSR計算、履歴管理）を先に `src/lib/` に分割
  - 表示層（チャート/表/操作パネル）を `src/features/*` に小分け
  - UI は `src/components/ui/*` を使用、チャートは `recharts` をそのまま利用
  - 選択コンポーネントは `Select` のラッパ（簡易実装）を使用可能。高度な動きが必要なら headless UI などに差替え

補足
- Node のバージョンが 16 のため、新しめの Vite 7/React 19 ではなく Vite 4/React 18 に調整しています。Node を 20+ に上げる場合は依存のアップデートで対応可能です。

