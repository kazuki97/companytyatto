// setAdmin.js

const admin = require('firebase-admin');

// ダウンロード済みのサービスアカウント鍵ファイル名を指定
const serviceAccount = require('./company-chat-app-firebase-adminsdk-fbsvc-5e858554dc.json');

// Admin SDK 初期化
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// 管理者権限を付与したいユーザーのメールアドレス
const userEmail = 'kazuki@icloud.com';

async function setAdminClaim() {
  try {
    // メールアドレスから UID を取得
    const userRecord = await admin.auth().getUserByEmail(userEmail);
    // custom claim を設定
    await admin.auth().setCustomUserClaims(userRecord.uid, { admin: true });
    console.log(`${userEmail} に admin 権限を付与しました。`);
  } catch (err) {
    console.error('エラー:', err);
  }
}

setAdminClaim();
