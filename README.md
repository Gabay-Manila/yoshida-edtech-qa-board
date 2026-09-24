# しつもんひろば（Yoshida EdTech Q&A掲示板）

## ファイル構成
```
qa-board/
├── index.html          学習者用：投稿フォーム＋掲示板一覧
├── admin.html          吉田さん専用：承認・公開画面
└── api/
    ├── generate-draft.js   AI下書き生成＋Firestore保存＋Gmail通知
    └── admin-check.js      管理画面パスワード認証
```

## セットアップ手順

### 1. Firebaseプロジェクトを作成
1. https://console.firebase.google.com で新規プロジェクト作成
2. 「Firestore Database」を有効化（本番モードでOK）
3. プロジェクト設定 → 「マイアプリ」からWebアプリを追加し、`firebaseConfig`を取得
4. `index.html` と `admin.html` 内の `firebaseConfig` を実際の値に置き換える

### 2. Firestoreのセキュリティルール（例）
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /questions/{id} {
      allow read: if true;
      allow create: if request.resource.data.status == "pending";
      allow update: if false; // 更新はサーバー(Admin SDK)経由のみ許可
    }
  }
}
```
※ 管理画面(admin.html)からの `update` は、本番では直接Firestoreを叩かず
　 `/api/`経由のサーバーレス関数に差し替えることを推奨します（現状は簡易実装）。

### 3. Vercelの環境変数を設定
Vercelダッシュボード → Settings → Environment Variables に以下を追加：

| 変数名 | 内容 |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebaseのサービスアカウント秘密鍵（JSON文字列そのまま） |
| `GEMINI_API_KEY` | Gemini APIキー（AI下書き生成用、Google AI Studioで取得） |
| `GMAIL_USER` | 通知を送信するGmailアドレス |
| `GMAIL_APP_PASSWORD` | Gmailの「アプリパスワード」（通常のパスワードではない） |
| `ADMIN_PASSWORD` | 管理画面ログイン用パスワード |

Firebaseサービスアカウントの取得：プロジェクト設定 → サービスアカウント → 「新しい秘密鍵の生成」

Gmailアプリパスワードの取得：Googleアカウント → セキュリティ → 2段階認証を有効化 → アプリパスワード発行

### 4. 依存パッケージ
Vercelにデプロイする際、api/フォルダと同階層に以下の`package.json`を用意してください：
```json
{
  "dependencies": {
    "firebase-admin": "^12.0.0",
    "nodemailer": "^6.9.0"
  }
}
```

### 5. デプロイ
いつも通りGitHubにpush → Vercelが自動デプロイ。

## 今後の拡張候補（今回は見送り）
- 学習者への回答済み通知（まずは未読バッジのみで運用し、必要になれば追加）
- Web Push通知
- バグ報告と使い方質問のステータス分離
# yoshida-edtech-qa-board
