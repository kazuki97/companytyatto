// admin.js

// 0. トースト表示ユーティリティをグローバルに定義
function showToast(message, duration = 3000) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  // レンダラに反映させてからアニメーション開始
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });
  // duration 経過後に消去アニメーション
  setTimeout(() => {
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => {
      toast.remove();
    }, { once: true });
  }, duration);
}

// 1. Firebase 初期化
const firebaseConfig = {
  apiKey: "AIzaSyAC_A8dMvfzc2I8SaKTSfklFDWHgqFZThQ",
  authDomain: "company-chat-app.firebaseapp.com",
  projectId: "company-chat-app",
  storageBucket: "company-chat-app.firebasestorage.app",
  messagingSenderId: "409983657200",
  appId: "1:409983657200:web:bf2f037efb6a292799ce35",
  measurementId: "G-KDL141H28M"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// 2. 認証＆UI 初期化（権限チェックなし）
auth.onAuthStateChanged(user => {
  if (!user) {
    location.href = 'login.html';
    return;
  }
  // 認証済みならそのまま管理画面初期化
  initAdminUI();
});

// 3. セクション切り替え
function initAdminUI() {
  const sections = document.querySelectorAll('.settings-section');
  const buttons  = document.querySelectorAll('button[data-section]');

  function showSection(id) {
    sections.forEach(sec =>
      sec.id === id
        ? sec.classList.remove('hidden')
        : sec.classList.add('hidden')
    );
  }

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      // 選択中タブの見た目を切り替え
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // 対応セクションを表示
      showSection(`section-${btn.dataset.section}`);

      // 初回データ読み込み
      if (btn.dataset.section === 'users') loadUsers();
      if (btn.dataset.section === 'rooms') loadRooms();
    });
  });

  // デフォルトで「ユーザー管理」を表示
  buttons[0].classList.add('active');
  showSection('section-users');
  loadUsers();

  // メッセージ検索 Enter キー
  document.getElementById('message-search-input')
    .addEventListener('keyup', e => {
      if (e.key === 'Enter') searchMessages(e.target.value);
    });

  // ルーム作成ボタン
  document.getElementById('create-room-btn')
  .addEventListener('click', async () => {
    const name = prompt('新しいルーム名を入力してください');
    if (!name) return;
    try {
      await createRoom(name);
      showToast(`ルーム「${name}」を作成しました`);
    } catch (e) {
      showToast('ルーム作成に失敗しました: ' + e.message);
    }
  });
}


// 4. ユーザー管理
async function loadUsers() {
  const snap = await db.collection('users').get();
  const container = document.getElementById('users-table');
  container.innerHTML = `
    <table class="settings-table">
      <thead>
        <tr><th>UID</th><th>表示名</th><th>役割</th><th>操作</th></tr>
      </thead>
      <tbody>
        ${snap.docs.map(doc => {
          const d = doc.data();
          return `
          <tr>
            <td>${doc.id}</td>
            <td>${d.displayName || '-'}</td>
            <td>${d.role || 'user'}</td>
            <td>
              <button class="btn-sm set-admin" data-uid="${doc.id}">Adminに切替</button>
              <button class="btn-sm delete-user" data-uid="${doc.id}">削除</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
  // Admin に切替ボタンにバインド
container.querySelectorAll('.set-admin').forEach(btn => {
  btn.addEventListener('click', async () => {
    const uid = btn.dataset.uid;
    try {
      await db.collection('users').doc(uid).update({ role: 'admin' });
      showToast('ユーザーを管理者に切り替えました');
      loadUsers();
    } catch (e) {
      showToast('管理者切替に失敗しました: ' + e.message);
    }
  });
});

  // ユーザー削除ボタンにバインド
container.querySelectorAll('.delete-user').forEach(btn => {
  btn.addEventListener('click', async () => {
    const uid = btn.dataset.uid;
    if (!confirm('本当にユーザーを削除しますか？')) return;
    try {
      await db.collection('users').doc(uid).delete();
      showToast('ユーザーを削除しました');
      loadUsers();
    } catch (e) {
      showToast('ユーザー削除に失敗しました: ' + e.message);
    }
  });
});
}

// 5. ルーム管理
async function loadRooms() {
  const snap = await db.collection('rooms').orderBy('createdAt','desc').get();
  const container = document.getElementById('rooms-table');
  container.innerHTML = `
    <table class="settings-table">
      <thead>
        <tr><th>Room ID</th><th>名前</th><th>作成日</th><th>操作</th></tr>
      </thead>
      <tbody>
        ${snap.docs.map(doc => {
          const d = doc.data();
          const date = d.createdAt?.toDate().toLocaleString() || '-';
          return `
          <tr>
            <td>${doc.id}</td>
            <td>${d.name}</td>
            <td>${date}</td>
            <td>
              <button class="btn-sm delete-room" data-id="${doc.id}">削除</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
  // 各ルームの削除ボタン
container.querySelectorAll('.delete-room').forEach(btn => {
  btn.addEventListener('click', async () => {
    const id = btn.dataset.id;
    if (!confirm('本当にルームを削除しますか？')) return;
    try {
      await db.collection('rooms').doc(id).delete();
      showToast('ルームを削除しました');
      loadRooms();
    } catch (e) {
      showToast('ルーム削除に失敗しました: ' + e.message);
    }
  });
});

}
async function createRoom(name) {
  await db.collection('rooms')
    .add({ name, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  loadRooms();
}

// 6. メッセージ管理
async function searchMessages(keyword) {
  const loading = document.getElementById('message-loading');
  const list    = document.getElementById('messages-list');
  // 初期化
  list.innerHTML = '';
  loading.classList.remove('hidden');

  try {
    const snap = await db.collectionGroup('messages')
      .where('text', '>=', keyword)
      .where('text', '<=', keyword + '\uf8ff')
      .orderBy('text')
      .limit(100)
      .get();

    if (snap.empty) {
      // 検索結果が 0 件のときにトーストを表示
      showToast('該当するメッセージがありません。');
      list.innerHTML = `<div class="no-results">該当するメッセージがありません。</div>`;
    } else {
      list.innerHTML = snap.docs.map(doc => {
        const d      = doc.data();
        const roomId = doc.ref.parent.parent.id;
        return `
        <div class="message-item settings-card">
          <div class="msg-header">
            <span class="msg-room">[${roomId}]</span>
            <button class="btn-xs delete-msg" data-room="${roomId}" data-id="${doc.id}">
              <i class="icon-delete"></i> 削除
            </button>
          </div>
          <div class="msg-body">
            <strong>${d.displayName || d.uid}:</strong> ${d.text}
          </div>
        </div>`;
      }).join('');
    }

    // 削除ボタンのバインド
    list.querySelectorAll('.delete-msg').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('本当にこのメッセージを削除しますか？')) return;
        const room = btn.dataset.room;
        const id   = btn.dataset.id;
        try {
          await db.collection('rooms')
            .doc(room)
            .collection('messages')
            .doc(id)
            .delete();
          // 成功通知と再検索
          showToast('メッセージを削除しました');
          searchMessages(keyword);
        } catch (e) {
          // エラー通知
          showToast('削除に失敗しました: ' + e.message);
        }
      });
    });

  } catch (err) {
    console.error(err);
    // 検索エラー時にトーストを表示
    showToast('検索中にエラーが発生しました');
    list.innerHTML = `<div class="error">検索中にエラーが発生しました。</div>`;
  } finally {
    loading.classList.add('hidden');
  }  
}

