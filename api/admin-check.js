// /api/admin-check.js
// 管理画面の簡易パスワード認証（環境変数 ADMIN_PASSWORD と照合するだけ）

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();
  const { password } = req.body;
  const ok = password && password === process.env.ADMIN_PASSWORD;
  res.status(200).json({ ok: !!ok });
};
