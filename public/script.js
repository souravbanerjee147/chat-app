console.log("Current logged-in user ID is:", user_id); // Assumes user_id is defined
const socket = io();
let selectedUserId = null;
let currentChatId = null;
let currentToUserId = null;


// ===== DOM Elements =====
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const chatMessages = document.getElementById('chatMessages');
const contactList = document.getElementById('contactsList');
const sendButton = document.getElementById('sendButton');

const settingsPopup = document.getElementById('settingsPopup');
const mainSettings = document.getElementById('mainSettings');
const profileSection = document.getElementById('profileSection');
const privacySection = document.getElementById('privacySection');

const plusIconSidebar = document.getElementById('plusIconSidebar');
const newChatPopup = document.getElementById('chatRequestPopup');
const sendRequestBtn = document.getElementById('sendRequestBtn');
const cancelRequestBtn = document.getElementById('cancelRequestBtn');
const targetUsernameInput = document.getElementById('targetUsername');
const statusMessage = document.getElementById("requestStatusMessage");

const requestPopup = document.getElementById('requestPopup');
const requestList = document.getElementById('requestList');
const requestDot = document.getElementById('requestDot');
const chatRequestsBtn = document.getElementById('chatRequestsBtn');

const overlay = document.getElementById('overlay');
const allPopups = [settingsPopup, newChatPopup, logoutPopup, requestPopup];

let contacts = [];

// ===== Send Message =====
chatForm.addEventListener("submit", e => {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (!text || currentChatId === null) return;

    socket.emit('send_message', {
        toUserId: selectedUserId,
        chatId: currentChatId,
        text: text
    });

    appendMessage('you', text);
    messageInput.value = "";
});

// Add message to UI
function addMessageToUI(text, sender) {
    const msgDiv = document.createElement('div');
    msgDiv.style.display = 'flex';
    msgDiv.style.justifyContent = sender === 'you' ? 'flex-end' : 'flex-start';

    msgDiv.innerHTML = `
    <div style="
      max-width: 60%;
      background: ${sender === 'you' ? '#00ffc8' : '#e0e0e0'};
      color: #121212;
      padding: 8px 12px;
      border-radius: 15px;
      margin: 4px 0;
      word-wrap: break-word;
      display: inline-block;
    ">${text}</div>
  `;

    chatMessages.appendChild(msgDiv);
}



// Scroll chat to bottom
function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Send message
function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !currentChatId || !currentToUserId) return;

    socket.emit('send_message', {
        chatId: currentChatId,
        toUserId: currentToUserId,
        text: text
    });

    messageInput.value = '';
}

// Send message on button click
// sendButton.addEventListener('click', sendMessage);

// Send message on Enter key
messageInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        e.preventDefault();
        sendMessage();
    }
});

// ===== Incoming Real-time Messages =====
socket.on('receive_message', ({ chatId, text, sender }) => {
    if (chatId === currentChatId) {
        addMessageToUI(text, sender);
        scrollToBottom();
    }
});



// ===== Open Chat =====
async function openChat(contact) {
    currentChatId = contact.chatId;
    currentToUserId = contact.id;

    // SHOW the chat input
    chatForm.style.display = 'flex';

    // chat header (name + avatar)
    document.getElementById('chatName').textContent = contact.fullname || contact.username;
    document.getElementById('chatAvatar').src = contact.avatar || `https://i.pravatar.cc/50?u=${contact.username}`;

    // CLEAR previous messages
    chatMessages.innerHTML = '';

    try {
        const res = await fetch(`/chat/messages/${contact.chatId}`);
        const messages = await res.json();

        messages.forEach(msg => {
            console.log("MSG:", msg);
            const sender = msg.sender === 'you' ? 'you' : 'them';
            addMessageToUI(msg.text, sender);
        });



        scrollToBottom();
    } catch (err) {
        console.error('Error loading messages:', err);
    }
}


function addMessageToUI(text, sender) {
  const msg = document.createElement('div');
  msg.classList.add('message');

  if (sender === 'you') {
    msg.style.textAlign = 'right';
    msg.style.background = '#00ffc8';
  } else {
    msg.style.textAlign = 'left';
    msg.style.background = '#e0e0e0';
  }

  msg.textContent = text;
  msg.style.color = '#000000';
  msg.style.padding = '8px 12px';
  msg.style.borderRadius = '10px';
  msg.style.margin = '4px';
  msg.style.maxWidth = '70%';
  msg.style.display = 'inline-block';

  chatMessages.appendChild(msg);
}




// ===== Load Contacts =====
async function loadContacts() {
    try {
        const res = await fetch('/chat/contacts');
        const contacts = await res.json();
        contactList.innerHTML = '';

        contacts.forEach(contact => {
            const li = document.createElement('li');
            li.classList.add('contact');
            li.innerHTML = `
                <img src="${contact.avatar}" class="avatar" />
                <div class="contact-info">
                    <div class="top-row">
                        <span class="name">${contact.fullname}</span>
                        <span class="time">${contact.lastMessageTime ? new Date(contact.lastMessageTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                    </div>
                    <div class="last-message">${contact.lastMessage}</div>
                </div>
            `;
            li.addEventListener('click', () => openChat(contact));
            contactList.appendChild(li);
        });
    } catch (err) {
        console.error('Error loading contacts:', err);
    }
}

// ===== Popups and Settings =====
function openPopup(popup) {
    popup.classList.remove('hidden');
    overlay.classList.remove('hidden');
    popup.classList.add('show');
    bringToFront(popup);
}

function bringToFront(element) {
    element.style.zIndex = 1001;
    overlay.style.zIndex = 1000;
}

function openSettingsPopup() {
    openPopup(settingsPopup);
    showMainSettings();
}

function showMainSettings() {
    mainSettings.classList.remove('hidden');
    profileSection.classList.add('hidden');
    privacySection.classList.add('hidden');
}

function showProfile() {
    mainSettings.classList.add('hidden');
    profileSection.classList.remove('hidden');
}

function showPrivacy() {
    mainSettings.classList.add('hidden');
    privacySection.classList.remove('hidden');
}

function goBackToSettings() {
    profileSection.classList.add('hidden');
    privacySection.classList.add('hidden');
    mainSettings.classList.remove('hidden');
}

function closePopup(event) {
    const popup = event.target.closest('.popup');
    if (popup) {
        popup.classList.remove('show');
        setTimeout(() => popup.classList.add('hidden'), 200);
        overlay.classList.add('hidden');
    }
}

document.querySelector('.mini-sidebar .bottom-icon').addEventListener('click', () => {
    openPopup(settingsPopup);
    showMainSettings();
});

// ===== Logout =====
function openLogoutPopup() {
    if (logoutPopup) {
        logoutPopup.classList.remove('hidden');
        logoutPopup.classList.add('show');
        overlay.classList.remove('hidden');
        bringToFront(logoutPopup);
    }
}

function closeLogoutPopup() {
    if (logoutPopup) {
        logoutPopup.classList.remove('show');
        overlay.classList.add('hidden');
        setTimeout(() => logoutPopup.classList.add('hidden'), 200);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const confirmBtn = document.getElementById('confirmLogoutBtn');
    const cancelBtn = document.getElementById('cancelLogoutBtn');
    const logoutTrigger = document.getElementById('logoutBtn');

    if (logoutTrigger) logoutTrigger.addEventListener('click', openLogoutPopup);
    if (confirmBtn) confirmBtn.addEventListener('click', () => {
        fetch('/logout', { method: 'POST' })
            .then(() => window.location.href = '/login')
            .catch(() => window.location.href = '/login');
    });
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeLogoutPopup)
    };
    if (sendButton) {
        sendButton.addEventListener('click', sendMessage);
    }
    loadContacts(); // Initialize contacts
});

// ===== Chat Request (Send) =====
plusIconSidebar.addEventListener('click', () => {
    newChatPopup?.classList.add('show');
});

cancelRequestBtn.addEventListener('click', () => {
    newChatPopup?.classList.remove('show');
});

sendRequestBtn.addEventListener('click', async () => {
    const username = targetUsernameInput.value.trim();
    if (!username) {
        statusMessage.textContent = "Please enter a username.";
        return;
    }

    try {
        const res = await fetch('/chat/request/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetUsername: username })
        });

        const data = await res.json();
        statusMessage.style.color = data.success ? "green" : "red";
        statusMessage.textContent = data.message;
        if (data.success) targetUsernameInput.value = '';
    } catch (err) {
        statusMessage.style.color = "red";
        statusMessage.textContent = "Something went wrong.";
    }
});

// ===== Chat Request (Incoming) =====
chatRequestsBtn.addEventListener('click', () => {
    requestPopup.classList.remove('hidden');
    requestPopup.classList.add('show');
    overlay.classList.remove('hidden');
    loadIncomingRequests();
});

async function loadIncomingRequests() {
    try {
        const res = await fetch('/chat/request/incoming');
        const data = await res.json();
        requestPopup.innerHTML = '';

        if (data.success && data.requests.length > 0) {
            data.requests.forEach(req => {
                const div = document.createElement('div');
                div.innerHTML = `
                    <img src="${req.profile_pic || './stufs/default-avatar.png'}" class="avatar">
                    <div class="request-info">
                        <div class="info-top">
                            <div class="request-username">${req.username}</div>
                            <div class="request-actions">
                                <button class="accept-btn" data-id="${req.id}">Accept</button>
                                <button class="reject-btn" data-id="${req.id}">Reject</button>
                            </div>
                        </div>
                        <div class="request-fullname">${req.fullname}</div>
                    </div>`;
                requestPopup.appendChild(div);
            });
        } else {
            requestPopup.textContent = 'No Request';
        }
    } catch (err) {
        console.error('Failed to load requests:', err);
    }
}

document.addEventListener('click', function (e) {
    if (e.target.classList.contains('accept-btn')) {
        handleRequestResponse(e.target.dataset.id, 'accept');
    }
    if (e.target.classList.contains('reject-btn')) {
        handleRequestResponse(e.target.dataset.id, 'reject');
    }
});

async function handleRequestResponse(requestId, action) {
    try {
        const res = await fetch('/chat/request/respond', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requestId, action })
        });

        const data = await res.json();
        if (data.success) {
            loadIncomingRequests();
            loadContacts(); // Refresh list
        } else {
            alert(data.message || 'Error responding to request');
        }
    } catch (err) {
        console.error('Error handling request:', err);
    }
}

// ===== Overlay Handling =====
overlay.addEventListener('click', () => {
    allPopups.forEach(popup => {
        if (popup && !popup.classList.contains('hidden')) {
            popup.classList.remove('show');
            setTimeout(() => popup.classList.add('hidden'), 200);
        }
    });
    overlay.classList.add('hidden');
});


// document.addEventListener('DOMContentLoaded', () => {
//     loadContacts();
// });
