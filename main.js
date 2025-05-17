/* =========================================================
 * main.js v16  🚀  (2025-04-28)
 *  ─ 変更点 ─
 *    ・renderShippingList の body.innerHTML を修正し、
 *      詳細にお客様情報…（中略）
 * =======================================================*/
console.log("🚀 main.js v16 loaded");

const db   = firebase.firestore();
const auth = firebase.auth();

// ── 追加: 一度開いたルームを記憶するセット ──
const openedRooms = new Set();


let currentRoom          = "general";
let unsubscribeMsg       = null;
let unsubscribeRooms     = null;
let unsubscribeActive    = null;
let unsubscribeCompleted = null;

/* ★ 追加: 展開対象の注文 ID を保持 */
let expandedOrderId      = null;
/* ★ 追加: タブ状態 */
let showCompleted        = false;

/* ────────────────────────────────────
 * DOM 要素（グローバルスコープで定義）
 * ────────────────────────────────────*/
const overlay            = document.getElementById("room-modal");
const newRoomInputElem   = document.getElementById("new-room-input");
const btnAddRoom         = document.getElementById("add-room-btn");
const btnCancelRoom      = document.getElementById("cancel-room-btn");
const btnCreateRoom      = document.getElementById("create-room-btn");
const roomSearchInput    = document.getElementById("room-search");

const shippingBtn        = document.getElementById("shipping-mgmt-btn");
const shippingPanel      = document.getElementById("shipping-panel");
const closeShippingBtn   = document.getElementById("close-shipping-btn");

const tabActive          = document.getElementById("tab-active");
const tabCompleted       = document.getElementById("tab-completed");
const activeListDiv      = document.getElementById("active-list");
const completedListDiv   = document.getElementById("completed-list");

/* ────────────────────────────────────
 * 1) 認証状態監視
 * ────────────────────────────────────*/
auth.onAuthStateChanged(handleAuthState);

function handleAuthState(user) {
  if (!user) {
    location.href = "login.html";
    return;
  }

  setupLogoutButton();
  setupShippingPanel(user); // 発送管理の初期化を呼ぶ
  setupRoomsAndChat(user);
  setupProfilePopover();
}

// ログアウト処理
function setupLogoutButton() {
  document.getElementById("logout").addEventListener("click", () => {
    auth.signOut();
  });
}

// ルームとチャットの初期化処理をまとめる
function setupRoomsAndChat(user) {
  initRoomList(user);
  roomSearchInput.addEventListener("input", () => renderRoomList(user));
  selectRoom(currentRoom, user);
  initChatInput(user);
  loadRoomMessages(user);
  setupLoadMoreMessages(user);
}

// メッセージの追加読み込み処理を分離
function setupLoadMoreMessages(user) {
  const loadMoreBtn = document.getElementById("load-more-btn");
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener("click", () => {
      console.log("→ load-more-btn clicked");
      loadMoreMessages(user);
    });
  }
}

// プロフィールポップオーバーの初期化を分離
function setupProfilePopover() {
  const profileContainer = document.querySelector('.profile-container');
  const profilePopover   = document.querySelector('.profile-popover');

  profileContainer.addEventListener('click', () => {
    profilePopover.classList.toggle('active');
  });

  document.addEventListener('click', (e) => {
    if (!profileContainer.contains(e.target)) {
      profilePopover.classList.remove('active');
    }
  });
}

/* ───────── ルーム作成モーダル ───────── */
// 変数宣言（小文字で統一）
// ルーム作成モーダル 変数宣言（全部小文字・正しいスペルに統一！）


// モーダルの表示/非表示
function showModal() {
  overlay.classList.remove("hidden");
  newRoomInputElem.value = "";
  newRoomInputElem.focus();
}
function hideModal() {
  overlay.classList.add("hidden");
}

// イベントリスナー
if (btnAddRoom) btnAddRoom.addEventListener("click", showModal);
if (btnCancelRoom) btnCancelRoom.addEventListener("click", hideModal);

/* ───────── タブ切替 ───────── */
function switchTab(completed, user) {
  showCompleted = completed;
  tabActive.classList.toggle("active", !completed);
  tabCompleted.classList.toggle("active", completed);
  activeListDiv.classList.toggle("hidden", completed);
  completedListDiv.classList.toggle("hidden", !completed);
}

// 発送管理パネルのボタンもnullチェック
function setupShippingPanel(user) {
  if (shippingBtn) {
    shippingBtn.addEventListener("click", () => {
      shippingPanel.classList.toggle("open");
    });
  }
  if (closeShippingBtn) {
    closeShippingBtn.addEventListener("click", () => {
      shippingPanel.classList.remove("open");
    });
  }

  // タブクリックイベント
  tabActive.addEventListener("click", () => switchTab(false, user));
  tabCompleted.addEventListener("click", () => switchTab(true, user));

  // 進行中ステータス購読
  if (unsubscribeActive) unsubscribeActive();
  unsubscribeActive = db.collection("orders")
    .where("status", "in", ["processing", "waiting_pickup"])
    .orderBy("createdAt", "asc")
    .onSnapshot(snap => {
      renderShippingList(snap, user, activeListDiv);
    });

  // 本日完了ステータス購読
  if (unsubscribeCompleted) unsubscribeCompleted();
  unsubscribeCompleted = db.collection("orders")
    .where("status", "==", "completed")
    .orderBy("createdAt", "asc")
    .onSnapshot(snap => {
      renderShippingList(snap, user, completedListDiv);
    });

  // 初期は進行中タブ
  switchTab(false, user);
}




/* ステータス表記ユーティリティ */
const STATUS = {
  processing:      "処理中",
  completed:       "発送完了",
  waiting_pickup:  "ヤマト集荷待ち"
};
function statusLabel(s) { return STATUS[s] ?? s; }

/* ────────────────────────────────────
 * 注文一覧描画
 *   → container（activeListDiv or completedListDiv）を指定
 * ────────────────────────────────────*/
function renderShippingList(snap, user, container) {
  if (snap.empty) {
    container.innerHTML = "<p>注文が見つかりません。</p>";
    return;
  }
  container.innerHTML = "";

  snap.docs.forEach(docSnap => {
    const o = docSnap.data();

    /* details 要素 */
    const details = document.createElement("details");
    details.className = "shipping-card";

    /* 展開判定 */
    if (o.orderId == expandedOrderId) details.setAttribute("open", "");

    /* summary */
    const summary = document.createElement("summary");
    summary.innerHTML = `
      注文 #${o.orderId} — ${o.customer.first_name} ${o.customer.last_name} — 合計 ¥${o.total}
      <span class="status-badge ${o.status}">
        ${statusLabel(o.status)}
      </span>
    `;
    details.appendChild(summary);

    /* body */
    const body = document.createElement("div");
    body.className = "card-body";

    let itemsHtml = "<ul>";
    (o.items || []).forEach(item => {
      itemsHtml += `<li>${item.name} × ${item.quantity} (¥${item.total})</li>`;
    });
    itemsHtml += "</ul>";

    body.innerHTML = `
      <p>注文日: ${o.createdAt?.toDate().toLocaleString() || "不明"}</p>
      <p>お名前: ${o.customer.first_name || "不明"} ${o.customer.last_name || ""}</p>
      <p>電話番号: ${o.customer.phone || "（未入力）"}</p>
      <p>郵便番号: ${o.customer.postcode || "（未入力）"}</p>
      <p>住所: ${[
        o.customer.state,
        o.customer.city,
        o.customer.address_1,
        o.customer.address_2
      ].filter(Boolean).join(" ") || "不明"}</p>
      <p>購入商品:</p>
      ${itemsHtml}
      <p>配送料: ¥${o.shippingCost || 0}</p>
      <p>合計金額: ¥${o.total}</p>
      <div class="actions">
        <button class="complete"
                data-id="${o.orderId}"
                data-status="completed">発送完了</button>
        <button class="hold"
                data-id="${o.orderId}"
                data-status="waiting_pickup">ヤマト集荷待ち</button>
      </div>
    `;
    details.appendChild(body);
    container.appendChild(details);

    /* toggle イベント */
    details.addEventListener("toggle", () => {
      if (details.open) {
        expandedOrderId = o.orderId;
        document.querySelectorAll(".shipping-card[open]").forEach(el => {
          if (el !== details) el.removeAttribute("open");
        });
      } else if (expandedOrderId == o.orderId) {
        expandedOrderId = null;
      }
    });

    /* ボタンイベント */
    body.querySelectorAll("button").forEach(btn => {
      btn.onclick = () => handleStatusChange(btn, user);
    });
  });
}

/* ────────────────────────────────────
 * ステータス変更処理
 * ────────────────────────────────────*/
async function handleStatusChange(btn, user) {
  const orderId      = btn.dataset.id;
  const status       = btn.dataset.status;
  const originalText = btn.textContent;

  expandedOrderId = Number(orderId);
  btn.disabled    = true;
  btn.textContent = "更新中…";

  try {
    await updateOrderStatus(orderId, status, user);
    btn.textContent = "完了!";
    setTimeout(() => btn.textContent = originalText, 1000);
  } catch(err) {
    console.error(err);
    alert("ステータス更新に失敗しました:\n" + err.message);
    btn.textContent = originalText;
  } finally {
    btn.disabled = false;
  }
}

/* ────────────────────────────────────
 * Firestore 更新 & チャット通知（日時付き）
 * ────────────────────────────────────*/
async function updateOrderStatus(orderId, status, user) {
  const orderRef = db.collection("orders").doc(orderId.toString());

  // 更新データを組み立て
  const updates = { status };
  if (status === "completed") {
    // 発送完了時に完了日時を保存
    updates.completedAt = firebase.firestore.FieldValue.serverTimestamp();
  }

  // Firestore 更新
  await orderRef.update(updates);

  // チャット通知に日時を含める
  const now = new Date();
  const formatted = now.toLocaleString('ja-JP', {
    year:   'numeric',
    month:  '2-digit',
    day:    '2-digit',
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });const label = statusLabel(status);
  const text  = `📦 注文 #${orderId} のステータスを「${label}」に更新しました。（${formatted}）`;

  await db.collection("rooms")
          .doc(currentRoom)
          .collection("messages")
          .add({
            uid:         user.uid,
            displayName: user.displayName || user.email,
            text,
            timestamp:   firebase.firestore.FieldValue.serverTimestamp(),
            readBy:      []
          });
}

/* ────────────────────────────────────
 * チャット／ルーム関連ロジック
 * ────────────────────────────────────*/
async function createRoom(user) {
  const name = newRoomInputElem.value.trim();
  if (!name) return newRoomInputElem.focus();
  const id = name.replace(/\s+/g, "-").toLowerCase();
  await db.collection("rooms").doc(id)
          .set({
            title:     name,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
  hideModal();
  currentRoom = id;
  document.getElementById("room-name").textContent = id;
  renderRoomList(user);
  selectRoom(id, user);
}

function initRoomList(user) {
  if (unsubscribeRooms) unsubscribeRooms();
  unsubscribeRooms = db.collection("rooms")
    .orderBy("updatedAt", "desc")
    .onSnapshot(async (snap) => {
      if (!snap.empty) {
        const firstRoomId = snap.docs[0].id;
        if (!snap.docs.some(doc => doc.id === currentRoom)) {
          currentRoom = firstRoomId;
        }
        await renderRoomList(user);
        await selectRoom(currentRoom, user);
      } else {
        currentRoom = null;
        document.getElementById("room-name").textContent = "ルームなし";
        document.getElementById("conv-list").innerHTML = "";
      }
    });
}

let isRendering = false;

async function renderRoomList(user) {
  if (isRendering) return; 
  isRendering = true;

  const ul = document.getElementById("conv-list");
  const keyword = roomSearchInput.value.trim().toLowerCase();

  const roomsSnap = await db.collection("rooms")
                            .orderBy("updatedAt", "desc").get();

  ul.innerHTML = ""; 

  for (const roomDoc of roomsSnap.docs) {
    const roomId = roomDoc.id;
    const data = roomDoc.data();

    const lastMsgSnap = await db.collection("rooms").doc(roomId)
      .collection("messages")
      .orderBy("timestamp", "desc")
      .limit(1)
      .get();

    const preview = lastMsgSnap.empty
      ? ""
      : lastMsgSnap.docs[0].data().text.slice(0, 50);

    const li = document.createElement("li");
    li.classList.toggle("active", roomId === currentRoom);
    li.onclick = () => selectRoom(roomId, user);

    const av = document.createElement("div");
    av.className = "conv-avatar";
    av.textContent = roomId.charAt(0).toUpperCase();
    li.appendChild(av);

    const info = document.createElement("div");
    info.className = "conv-info";
    info.textContent = `${data.title || roomId} ${preview}`;
    li.appendChild(info);

    ul.appendChild(li);
  }

  isRendering = false; 
}

async function selectRoom(roomId, user) {
  openedRooms.add(roomId);

  currentRoom = roomId;
  document.getElementById("room-name").textContent = roomId;
  document.querySelectorAll("#conv-list li").forEach(li =>
    li.classList.toggle("active", li.onclick.toString().includes(roomId))
  );

  const unreadSnap = await db.collection("rooms").doc(roomId)
  .collection("messages")
  .where("unreadBy", "array-contains", user.uid)
  .get();

if (!unreadSnap.empty) {
  const batch = db.batch();
  unreadSnap.docs.forEach(docSnap => {
    batch.update(docSnap.ref, {
      unreadBy: firebase.firestore.FieldValue.arrayRemove(user.uid),
      readBy: firebase.firestore.FieldValue.arrayUnion(user.uid)
    });
  });
  await batch.commit();
}
await renderRoomList(user);
await loadRoomMessages(user);
}


// ────────────────────────────────────
// 初回起動時にこれだけを呼び出せばOK
// ────────────────────────────────────
function initChatInput(user) {
  const input       = document.getElementById("message-input");
  const sendBtn     = document.getElementById("send-btn");
  let replyToMsgId  = null;    // 返信対象のメッセージIDを保持

  // ── (1) 送信処理 ────────────────────
  sendBtn.onclick = async () => {
    const text = input.value.trim();
    if (!text) return;
  
    await db.collection("rooms").doc(currentRoom)
      .set({ updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
  
    // 未読ユーザー一覧を取得（送信者自身を除外）
    const usersSnap = await db.collection("users").get();
    const allUserIds = usersSnap.docs.map(doc => doc.id);
    const unreadBy = allUserIds.filter(uid => uid !== user.uid);  // ← 自分以外の全ユーザーを設定
  
    const payload = {
      uid: user.uid,
      displayName: user.displayName || user.email,
      text,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      readBy: [],
      unreadBy  // ←修正後
    };
  
    await db.collection("rooms").doc(currentRoom)
  .collection("messages")
  .add(payload);

// ブラウザ通知を送信（追加）
sendBrowserNotification(payload.text, payload.displayName);

input.value = "";
replyToMsgId = null;
input.placeholder = "メッセージを入力…";
document.querySelector('.reply-preview').classList.add('hidden');

  };
  

  // ── (2) 返信モード切替／キャンセル ────────
  window.enterReplyMode = (msgId, originalText) => {
    // 入力欄上プレビュー要素
    const topPreview = document.querySelector('.reply-preview');
    const spanOrig   = topPreview.querySelector('.original');

    if (replyToMsgId === msgId) {
      // 同じ ID を再度押すとキャンセル
      replyToMsgId      = null;
      topPreview.classList.add('hidden');
      input.placeholder = "メッセージを入力…";
    } else {
      // 新規に返信モードへ
      replyToMsgId      = msgId;
      spanOrig.textContent = originalText.slice(0, 30) + "…";
      topPreview.classList.remove('hidden');
      input.placeholder = `↪️ 返信: ${originalText.slice(0, 30)}…`;
    }
    input.focus();
  };

  // ── (3) 入力欄上プレビューの「×」キャンセルボタン ──
  document.querySelector('.reply-preview .cancel-btn')
          .onclick = () => {
    replyToMsgId       = null;
    input.placeholder  = "メッセージを入力…";
    document.querySelector('.reply-preview').classList.add('hidden');
  };

  // ── (4) コピー完了トースト表示 ─────────
  window.showCopyToast = () => {
    const toast = document.createElement("div");
    toast.textContent = "コピーしました";
    Object.assign(toast.style, {
      position:     'fixed',
      bottom:       '80px',
      left:         '50%',
      transform:    'translateX(-50%)',
      background:   'rgba(0,0,0,0.8)',
      color:        '#fff',
      padding:      '6px 12px',
      borderRadius: '4px',
      fontSize:     '12px',
      opacity:      '0',
      transition:   'opacity 0.2s ease',
      zIndex:       '1000'
    });
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.style.opacity = "1");
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => document.body.removeChild(toast), 300);
    }, 1500);
  };
}


// ────────────────────────────────────
// メッセージ検索バー開閉＆絞り込み
// ────────────────────────────────────
const toggleBtn   = document.getElementById("toggle-search-btn");
const searchBar   = document.querySelector(".message-search-bar");
const searchInput = document.getElementById("message-search");

// 検索バーの表示/非表示
toggleBtn.onclick = () => {
  searchBar.classList.toggle("open");
};

// 入力に合わせて絞り込む
searchInput.addEventListener("input", () => {
  const kw = searchInput.value.trim().toLowerCase();
  document.querySelectorAll("#chat li").forEach(li => {
    const txt = li.querySelector(".bubble-text").textContent.toLowerCase();
    li.style.display = txt.includes(kw) ? "" : "none";
  });
});


let lastVisibleMessage = null;

// メッセージを最初に20件だけ読み込む関数
function loadRoomMessages(user) {
  const chatUl = document.getElementById("chat");
  chatUl.innerHTML = "";

  if (unsubscribeMsg) unsubscribeMsg();

  const initialQuery = db.collection("rooms")
    .doc(currentRoom)
    .collection("messages")
    .orderBy("timestamp", "desc")
    .limit(20);

  unsubscribeMsg = initialQuery.onSnapshot(snapshot => {
    if (snapshot.empty) return;

    lastVisibleMessage = snapshot.docs[snapshot.docs.length - 1];

    snapshot.docs.reverse().forEach((docSnap, i, arr) => {
      renderMessage(docSnap, i, arr, user);
    });

    chatUl.scrollTop = chatUl.scrollHeight;

    const loadMoreContainer = document.getElementById('load-more-container');
    if (snapshot.size === 20) {
      loadMoreContainer.classList.add('visible');
    } else {
      loadMoreContainer.classList.remove('visible');
    }
  });
}


// 「さらに読み込む」ボタンを押した時に古いメッセージを読み込む関数
let isLoadingMore = false; // 新規追加

async function loadMoreMessages(user) {
  if (isLoadingMore) return; // 二重読み込み防止
  isLoadingMore = true;

  try {
    if (!lastVisibleMessage) return;

    const moreQuery = db.collection("rooms")
      .doc(currentRoom)
      .collection("messages")
      .orderBy("timestamp", "desc")
      .startAfter(lastVisibleMessage)
      .limit(20);

    const snapshot = await moreQuery.get();

    if (snapshot.empty) {
      alert("これ以上のメッセージはありません。");
      document.getElementById('load-more-container').classList.remove('visible');
      return;
    }

    lastVisibleMessage = snapshot.docs[snapshot.docs.length - 1];

    snapshot.docs.reverse().forEach((docSnap, i, arr) => {
      renderMessage(docSnap, i, arr, user, true);
    });

    if (snapshot.size < 20) {
      document.getElementById('load-more-container').classList.remove('visible');
    }

  } catch (error) {
    console.error("メッセージの追加読み込みエラー: ", error);
    alert("メッセージの読み込み中にエラーが発生しました。");
  } finally {
    isLoadingMore = false; // 読み込みフラグを解除
  }
}





//メッセージ描画を共通化した関数
function renderMessage(docSnap, i, arr, user, prepend = false) {
  const chatUl = document.getElementById("chat");
  const d = docSnap.data();
  const msgRef = docSnap.ref;

  // ▼ ここから日付区切り線の追加処理 ▼
  const messageDate = d.timestamp.toDate().toLocaleDateString('ja-JP');
  const prevMessageDate = i > 0 ? arr[i - 1].data().timestamp.toDate().toLocaleDateString('ja-JP') : null;

  if (messageDate !== prevMessageDate) {
    const dateDivider = document.createElement('div');
    dateDivider.className = 'date-divider';
    dateDivider.textContent = messageDate;

    const dividerLi = document.createElement('li');
    dividerLi.appendChild(dateDivider);

    if (prepend) chatUl.prepend(dividerLi);
    else chatUl.appendChild(dividerLi);
  }
  // ▲ 日付区切り線の追加処理ここまで ▲


  if (d.unreadBy?.includes(user.uid)) {
    msgRef.update({
      unreadBy: firebase.firestore.FieldValue.arrayRemove(user.uid),
      readBy: firebase.firestore.FieldValue.arrayUnion(user.uid)
    });
  }

  const li = document.createElement("li");
  li.id = `msg-${docSnap.id}`;
  li.className = "msg " + (d.uid === user.uid ? "mine" : "other");
  const prev = i > 0 ? arr[i-1].data() : null;
  if (!prev || prev.uid !== d.uid) li.classList.add("separate");

  if (d.uid !== user.uid) {
    const ava = document.createElement("div");
    ava.className   = "avatar";
    ava.textContent = (d.displayName || "?")[0].toUpperCase();
    li.appendChild(ava);
  }

  const bub = document.createElement("div");
  bub.className = "bubble";
  if (d.replyTo) bub.classList.add("reply");

  if (d.replyTo) {
    const previewDiv = document.createElement("div");
    previewDiv.className = "reply-preview";

    db.collection("rooms").doc(currentRoom)
      .collection("messages").doc(d.replyTo).get()
      .then(snap => {
        if (!snap.exists) return;

        const data         = snap.data();
        const originalText = data.text || "";
        const displayName  = data.displayName || "";
        const excerpt = originalText.length > 50
          ? originalText.slice(0, 50) + "…"
          : originalText;

        const avatarDiv = document.createElement("div");
        avatarDiv.className   = "avatar";
        avatarDiv.textContent = displayName.charAt(0).toUpperCase();
        previewDiv.appendChild(avatarDiv);

        const nameSpan = document.createElement("span");
        nameSpan.className   = "username";
        nameSpan.textContent = displayName;
        previewDiv.appendChild(nameSpan);

        const textSpan = document.createElement("span");
        textSpan.className   = "preview-text";
        textSpan.textContent = excerpt;
        previewDiv.appendChild(textSpan);
      });

    previewDiv.onclick = () => {
      const target = document.getElementById(`msg-${d.replyTo}`);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    bub.appendChild(previewDiv);
  }

  // メッセージテキスト
  const textNode = document.createElement("span");
  textNode.className = "bubble-text";
  textNode.textContent = d.text;
  bub.appendChild(textNode);

  // 編集済みラベルを表示
  if (d.editedAt) {
    const editedLabel = document.createElement("span");
    editedLabel.className = "edited-label";
    editedLabel.textContent = "（編集済み）";
    bub.appendChild(editedLabel);
  }

  // タイムスタンプ
  const ts = document.createElement("span");
  ts.className = "timestamp";
  ts.textContent = d.timestamp
    ? new Date(d.timestamp.toDate()).toLocaleString('ja-JP', {
        year:   'numeric',
        month:  '2-digit',
        day:    '2-digit',
        hour:   '2-digit',
        minute: '2-digit'
      })
    : "";
  bub.appendChild(ts);

  // 既読人数ラベル（自分のメッセージのみ）
const otherReaders = (d.readBy || []).filter(id => id !== user.uid);
if (d.uid === user.uid && otherReaders.length > 0) {
  const readCount = otherReaders.length;
  
  const rd = document.createElement("span");
  rd.className = "read-count";
  rd.textContent = `既読 ${readCount}`;
  
  bub.appendChild(rd);
}


  // 3点メニューの生成
  const menuBtn = document.createElement("button");
  menuBtn.className   = "msg-menu-btn history";
  menuBtn.setAttribute("aria-label", "メニュー");
  menuBtn.textContent = "⋯";
  bub.appendChild(menuBtn);

  const menu = document.createElement("ul");
  menu.className = "msg-menu";
  menu.innerHTML = `
    <li class="menu-item history">履歴を見る</li>
    <li class="menu-item reply">返信</li>
    <li class="menu-item copy">コピー</li>
    <li class="menu-item edit">編集</li>
    <li class="menu-item delete">削除</li>
  `;
  bub.appendChild(menu);

  menuBtn.addEventListener("click", event => {
    event.stopPropagation();
    menu.classList.toggle("open");
  });

  document.addEventListener("click", event => {
    if (!event.target.closest(".bubble")) {
      document.querySelectorAll(".msg-menu.open").forEach(openMenu => {
        openMenu.classList.remove("open");
      });
    }
  });

  menu.querySelector(".menu-item.history").addEventListener("click", event => {
    event.stopPropagation();
    openHistoryModal(
      document.getElementById('room-name').textContent,
      docSnap.id
    );
    menu.classList.remove("open");
  });

  menu.querySelector(".menu-item.reply").addEventListener("click", event => {
    event.stopPropagation();
    enterReplyMode(docSnap.id, d.text);
    menu.classList.remove("open");
  });

  menu.querySelector(".menu-item.copy").addEventListener("click", event => {
    event.stopPropagation();
    navigator.clipboard.writeText(d.text);
    showCopyToast();
    menu.classList.remove("open");
  });

  menu.querySelector(".menu-item.edit").addEventListener("click", event => {
    event.stopPropagation();
    const newText = prompt('メッセージを編集してください', d.text);
    if (newText != null && newText !== d.text) {
      saveEditHistoryAndUpdateMessage(docSnap.id, d.text, newText);
    }
    menu.classList.remove("open");
  });

  menu.querySelector(".menu-item.delete").addEventListener("click", event => {
    event.stopPropagation();
    if (confirm('このメッセージを削除しますか？')) {
      msgRef.collection('history').add({
        type:         'delete',
        originalText: d.text,
        timestamp:    firebase.firestore.FieldValue.serverTimestamp(),
        userId:       user.uid
      });
      msgRef.delete();
    }
    menu.classList.remove("open");
  });

  li.appendChild(bub);

  if (prepend) chatUl.prepend(li);
  else chatUl.appendChild(li);

  chatUl.scrollTop = chatUl.scrollHeight;
}




/* ───────── リサイズバー ───────── */
const resizer = document.getElementById("conv-resizer");
const appElem = document.querySelector(".app");

resizer.addEventListener("mousedown", () => {
  document.body.style.userSelect = "none";
  document.body.style.cursor     = "col-resize";
  window.addEventListener("mousemove", doDrag);
  window.addEventListener("mouseup",   stopDrag);
});
function doDrag(e) {
  const rect = appElem.getBoundingClientRect();
  let newW = e.clientX - rect.left;
  newW = Math.min(360, Math.max(200, newW));
  document.documentElement.style.setProperty("--conv-width", newW + "px");
}
function stopDrag() {
  document.body.style.userSelect = "";
  document.body.style.cursor     = "";
  window.removeEventListener("mousemove", doDrag);
  window.removeEventListener("mouseup",   stopDrag);
}

// モーダルを閉じるボタン
document.getElementById('close-history-btn').onclick = () => {
  document.getElementById('history-modal').classList.add('hidden');
  document.getElementById('history-list').innerHTML = '';
};

/**
 * 履歴モーダルを開き、Firestoreから履歴を取得して表示
 * @param {string} roomId    - ルームID
 * @param {string} messageId - メッセージID
 */
async function openHistoryModal(roomId, messageId) {
  const modal = document.getElementById('history-modal');
  const list  = document.getElementById('history-list');
  modal.classList.remove('hidden');

  // Firestore から履歴を取得
  const snaps = await db
    .collection('rooms').doc(roomId)
    .collection('messages').doc(messageId)
    .collection('history')
    .orderBy('timestamp', 'desc')
    .get();

  snaps.forEach(docSnap => {
    const d = docSnap.data();
    const li = document.createElement('li');
    li.textContent = `[${d.type}] ${d.originalText}` +
      (d.newText ? ` → ${d.newText}` : '') +
      ` (${new Date(d.timestamp.toDate()).toLocaleString('ja-JP')})`;
    list.appendChild(li);
  });
}

const chatUl = document.getElementById("chat");

chatUl.addEventListener('scroll', () => {
  const loadMoreContainer = document.getElementById('load-more-container');

  if (chatUl.scrollTop === 0 && lastVisibleMessage) {
    loadMoreContainer.classList.add('visible');
  } else {
    loadMoreContainer.classList.remove('visible');
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const navChats = document.getElementById('nav-chats');
  const navRooms = document.getElementById('nav-rooms');
  const navShipping = document.getElementById('nav-shipping');
  
  const shippingPanel = document.getElementById('shipping-panel');
  const chatWindow = document.querySelector('.chat-window');
  const conversations = document.querySelector('.conversations');
  const closeShippingBtn = document.getElementById('close-shipping-btn');

  navChats.addEventListener('click', () => {
    showChats();
    setActiveNav(navChats);
  });

  navRooms.addEventListener('click', () => {
    showRooms();
    setActiveNav(navRooms);
  });

  navShipping.onclick = () => {
    const isOpen = shippingPanel.classList.contains('open');
    
    if (isOpen) {
      closeShippingPanel();
      setActiveNav(navChats);  // 閉じた時はトークをアクティブに戻す
      console.log('発送管理パネルを閉じました');
    } else {
      openShippingPanel();
      setActiveNav(navShipping);
      console.log('発送管理パネルを開きました');
    }
  };
  

  

  closeShippingBtn.addEventListener('click', () => {
    closeShippingPanel();
    setActiveNav(navChats);
    console.log('発送管理パネルが閉じられました');
  });

  function setActiveNav(activeButton) {
    document.querySelectorAll('.bottom-nav button').forEach(btn => {
      btn.classList.toggle('active', btn === activeButton);
    });
  }

  function showChats() {
    chatWindow.style.display = 'flex';
    conversations.style.display = 'none';
    closeShippingPanel();
  }

  function showRooms() {
    chatWindow.style.display = 'none';
    conversations.style.display = 'flex';
    closeShippingPanel();
  }

  function openShippingPanel() {
    shippingPanel.classList.add('open');
  }

  function closeShippingPanel() {
    shippingPanel.classList.remove('open');
  }

  function openSettings() {
    window.location.href = 'settings.html';
  }

  // 初期画面はトーク
  showChats();
});



// ブラウザ通知許可をリクエスト
function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().then(permission => {
      if (permission !== "granted") {
        alert("通知を許可しないと新着メッセージ通知を受け取れません。");
      }
    });
  }
}



// ブラウザ通知を送る関数
function sendBrowserNotification(message, senderName) {
  // 通知許可の確認
  if (Notification.permission !== "granted") {
    console.log("通知が許可されていません。");
    return;
  }

  // 通知オプション設定
  const options = {
    body: `${senderName}: ${message}`,
    icon: '/path/to/icon.png',  // 任意のアイコンパス（設定推奨）
    tag: 'new-message'  // 通知をグループ化するタグ
  };

  // 通知を作成して表示
  const notification = new Notification("新着メッセージ", options);

  // 通知をクリックした時の動作（チャット画面へフォーカス）
  notification.onclick = () => {
    window.focus();
  };
}

// ログイン直後に通知許可リクエストを呼び出す
document.addEventListener('DOMContentLoaded', requestNotificationPermission);

// ▼固定ヘッダー更新処理を追加▼

const fixedDateHeader = document.getElementById('fixed-date-header');

chatUl.addEventListener('scroll', () => {
  const messages = chatUl.querySelectorAll('li .bubble');
  let currentDate = "";

  for (let message of messages) {
    const rect = message.getBoundingClientRect();
    if (rect.top <= chatUl.getBoundingClientRect().top + 40) {
      const timestamp = message.querySelector('.timestamp');
      if (timestamp) {
        currentDate = new Date(timestamp.textContent.replace(/(\d+)\/(\d+)\/(\d+) (\d+):(\d+)/, "$1-$2-$3T$4:$5")).toLocaleDateString('ja-JP');

      }
    } else {
      break;
    }
  }

  fixedDateHeader.textContent = currentDate;
});

// 初回表示時にもヘッダーに日付を設定
setTimeout(() => {
  const firstMsgTimestamp = chatUl.querySelector('.timestamp');
  if (firstMsgTimestamp) {
    fixedDateHeader.textContent = new Date(firstMsgTimestamp.textContent).toLocaleDateString('ja-JP');
  }
}, 1000);

// 既読メンバーポップアップ表示処理
document.addEventListener('click', async (event) => {
  if (event.target.classList.contains('read-count')) {
    const messageId = event.target.closest('li').id.replace('msg-', '');

    // 現在のルームIDを取得
    const roomId = currentRoom;

    // FirestoreからメッセージのreadBy配列を取得
    const messageDoc = await db.collection('rooms').doc(roomId)
      .collection('messages').doc(messageId).get();

    if (!messageDoc.exists) return;

    const readByIds = messageDoc.data().readBy || [];

    // read-members-listをクリア
    const readMembersList = document.getElementById('read-members-list');
    readMembersList.innerHTML = '';

    // 各ユーザーの表示名と既読日時を取得
    for (let uid of readByIds) {
      const userSnap = await db.collection('users').doc(uid).get();
      const displayName = userSnap.exists
        ? userSnap.data().displayName || userSnap.data().email
        : "不明なユーザー";

      // 仮に現在日時を表示（実際は正確な日時取得が必要な場合は別途Firestoreに保存が必要）
      const readTime = "日時不明";

      const li = document.createElement('li');
      li.textContent = `${displayName} (${readTime})`;
      readMembersList.appendChild(li);
    }

    // ポップアップ表示
    document.getElementById('read-members-popup').classList.remove('hidden');
  }
});

// ポップアップを閉じる処理
document.getElementById('close-read-members-btn').addEventListener('click', () => {
  document.getElementById('read-members-popup').classList.add('hidden');
});
