# Repository Guidelines

## Project Structure & Module Organization
- ルート直下に `index.ts`（React/TypeScript、LMSRベースCFMプロトタイプ）。
- テスト・ビルド設定・依存定義は未同梱。既存の React/Next.js/Vite プロジェクトへ組み込んで利用してください。
- 例: Next.js の場合は `app/page.tsx` へ移設（JSXを含むため拡張子は `.tsx` を推奨）。Vite は `src/App.tsx` へ配置。

## Build, Test, and Development Commands
- Next.js/Vite に組み込んだ前提の例（`pnpm`想定）:
  - `pnpm dev`: 開発サーバー起動。
  - `pnpm build`: 本番ビルド。
  - `pnpm lint`: ESLint による静的解析。
  - `pnpm format`: Prettier による整形。

## Coding Style & Naming Conventions
- 言語: TypeScript + React Hooks。インデント2スペース。
- 命名: 型/インターフェースはPascalCase（例: `ProjectId`）、変数・関数はcamelCase（例: `applyTarget`）。
- フォーマット: Prettier、リンタ: ESLint（`react-hooks` ルール推奨）。
- ファイル: JSXを含む場合は拡張子`.tsx`。

## Testing Guidelines
- 推奨: Vitest/Jest + React Testing Library。
- 命名: コンポーネント/ユーティリティに対応した `*.test.ts(x)`。
- 実行例: `pnpm test --watch`。カバレッジ目安: 主要ロジック（LMSR計算・トレード/解決処理）を優先的に網羅。

## Commit & Pull Request Guidelines
- コミット: Conventional Commits（例: `feat: add admin resolution flow`）。
- PR: 目的・変更点の要約、スクリーンショット（UI変更時）、再現手順、関連Issueのリンクを記載。
- レビュー観点: 状態管理の整合性、価格/原価計算（LMSR）の正当性、UI操作の可観測性（履歴・グラフ）。

## Architecture Overview
- 中核: LMSR計算（`lmsrCost`/`priceUp`/`tradeCost`）、シナリオ別市場（`funded`/`not_funded`）。
- 状態: `projects`/`accounts`/`phase` と履歴タイムライン、管理者操作（確定/解決/清算）。
- 可視化: Recharts によるインパクト・個別チャート、UIは shadcn/ui 互換コンポーネントを想定（`@/components/ui/*`）。

## Security & Configuration Tips
- 機密値・鍵は不要。数値計算はクライアント内で完結。
- 別環境へ組み込む際は `@` パスエイリアスを各ツールに合わせて設定してください（Vite/TSconfig/Next.js）。
