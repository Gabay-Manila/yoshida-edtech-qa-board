// /api/generate-draft.js
// Vercel Serverless Function
// 質問投稿 → タグ別テンプレートでAI下書き生成 → Firestore保存 → Gmail通知

const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

// ── Firebase Admin初期化（環境変数にサービスアカウントJSONを設定） ──
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
    ),
  });
}
const db = admin.firestore();

// ── タグ別プロンプト（Geminiで作成したテンプレートをそのまま埋め込み） ──
const TAG_PROMPTS = {
  web: `あなたは日本語学習中（N4〜N3程度）のフィリピン人学習者をサポートする優しいアドバイザーです。
「Web基礎」タグの質問に対して、以下の構成とルールで回答の下書きを作成してください。
【構成】1.お礼と状況の受け止め 2.確認してほしいこと 3.解決ステップ(番号リスト・やさしい日本語) 4.次の連絡案内
【ルール】能動態で短く。ITの言葉はそのまま使いつつ平易に補足。最後に「吉田（運営）が確認して返信しています」という温かいトーンを添える。`,

  app: `あなたは学習アプリのサポート担当です。「アプリ開発」タグ（機能質問・不具合報告）への下書きを作成してください。
【構成】1.お礼 2.確認状況(断定を避ける) 3.今すぐ試せる操作 4.追加情報の依頼
【ルール】専門用語(キャッシュ,API,DB等)は使わず、利用者の動作ベースで書く。`,

  error: `あなたはテクニカルサポート担当です。「エラー解決」タグへの回答下書きを作成してください。
【構成】1.エラーの意味(日常語で) 2.主な原因 3.解決手順(1〜3ステップ) 4.再質問の案内
【ルール】「端末の故障ではありません」など安心させる言葉を添える。N4〜N3レベルの短文。`,

  exam: `あなたは外国人介護職員向け試験の指導員です。「試験内容」タグへの解説を作成してください。
【構成】1.用語のコアな意味 2.介護現場での具体例 3.試験の要点(過去問本文は絶対に引用しない) 4.励ましの言葉
【ルール】制度用語は利用者の気持ち・介護者の動作に置き換えて説明する。試験問題の全文引用は厳禁。`,

  visa: `あなたは特定技能(SSW)やフィリピンからの就労手続きの案内サポーターです。「手続き系」タグへの下書きを作成してください。
【構成】1.書類・手続きの一般的な役割 2.一般的な流れ(「通常は〜」等、断定を避ける) 3.注意点 4.窓口確認の案内(必須)
【必須】次の趣旨の一文を必ず結びに含める：「ビザや手続きの条件はひとりひとり違います。詳しい状況は必ず受け入れ先・登録支援機関・MWOの担当窓口に直接確認してください。」`,
};

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const { id, tag, title, body, nickname } = req.body;
    if (!id || !tag || !title || !body) {
      return res.status(400).json({ error: "missing fields" });
    }

    const systemPrompt = TAG_PROMPTS[tag] || TAG_PROMPTS.web;

    // ── AI下書き生成（Gemini API） ──
    let draftText = "";
    try {
      const aiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: `質問タイトル：${title}\n質問本文：${body}\n\n上記の質問に対する回答下書きを作成してください。`,
                  },
                ],
              },
            ],
            generationConfig: { maxOutputTokens: 600 },
          }),
        }
      );
      const aiData = await aiRes.json();
      if (!aiRes.ok) {
        console.error("Gemini API error response:", JSON.stringify(aiData));
      }
      draftText =
        aiData?.candidates?.[0]?.content?.parts?.[0]?.text ||
        "（下書き生成に失敗しました。手動で回答を作成してください）";
    } catch (aiErr) {
      console.error("AI draft generation failed:", aiErr);
      draftText = "（下書き生成でエラーが発生しました。手動で回答を作成してください）";
    }

    // ── Firestoreに下書きを保存 ──
    await db.collection("questions").doc(id).update({
      draftText,
      status: "drafted",
    });

    // ── Gmail通知（Nodemailer + Gmailアプリパスワード） ──
    try {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD,
        },
      });

      const tagLabelMap = {
        web: "Web基礎", app: "アプリ開発", error: "エラー解決",
        exam: "試験内容", visa: "手続き系",
      };

      await transporter.sendMail({
        from: `"しつもんひろば" <${process.env.GMAIL_USER}>`,
        to: process.env.GMAIL_USER,
        subject: `【EdTechQA】${tagLabelMap[tag] || tag} - 新しい質問があります`,
        text:
          `ニックネーム：${nickname}\n` +
          `タイトル：${title}\n\n` +
          `本文：\n${body}\n\n` +
          `AI下書き：\n${draftText}\n\n` +
          `管理画面で確認・公開してください。`,
      });
    } catch (mailErr) {
      console.error("Gmail notification failed:", mailErr);
      // メール送信に失敗しても下書き保存は成功しているので処理は継続
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "internal error" });
  }
};
