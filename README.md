CFM プロジェクト整備メモ

概要
- フロントエンドを `frontend/` ディレクトリに集約し、Vite + React + TypeScript + Tailwind で起動できます。
- 依存: Node.js 16 でも動作するよう、Vite 4 + React 18 構成に固定しています。
- ルート直下の `index.ts` とレガシー移植用ファイルは廃止しました。正とする実装は `frontend/src/App.tsx` です。

起動方法
1. `cd frontend`
2. `npm install`
3. `npm run dev`
4. ローカルURL（例: `http://127.0.0.1:5173/`）へアクセス

ビルド
- `cd frontend && npm run build` → `frontend/dist/` に出力

ディレクトリ
- `frontend/src/components/ui/` … Button/Card/Input/Select の最小UIコンポーネント
- `frontend/src/App.tsx` … 本実装のエントリ（正とするソース）

今後の移植ガイド
- 既存の React/Next.js/Vite プロジェクトへ組み込む場合は、`frontend/src/App.tsx` のロジックをベースに分割移植してください:
  - ロジック層（型定義、LMSR計算、履歴管理）を `src/lib/` へ
  - 表示層（チャート/表/操作パネル）を `src/features/*` へ
  - UI は `src/components/ui/*` を使用。チャートは `recharts` を利用

補足
- Node のバージョンが 16 のため、新しめの Vite 7/React 19 ではなく Vite 4/React 18 に調整しています。Node を 20+ に上げる場合は依存のアップデートで対応可能です。
