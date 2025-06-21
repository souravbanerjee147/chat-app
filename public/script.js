console.log("Current logged-in user ID is:", user_id); // Assumes user_id is defined



// ===== DOM Element for chat section =====
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const chatMessages = document.getElementById('chatMessages');
const contactList = document.getElementById('contactsList');
// ===== DOM Element for settings popup panel =====
const settingsPopup = document.getElementById('settingsPopup');
const mainSettings = document.getElementById('mainSettings');
const profileSection = document.getElementById('profileSection');
const privacySection = document.getElementById('privacySection');

// ===== DOM Element for send request popup panel =====
const plusIconSidebar = document.getElementById('plusIconSidebar');
const newChatPopup = document.getElementById('chatRequestPopup');//solved
const sendRequestBtn = document.getElementById('sendRequestBtn'); //solved
const cancelRequestBtn = document.getElementById('cancelRequestBtn');
const targetUsernameInput = document.getElementById('targetUsername'); //solved
const statusMessage = document.getElementById("requestStatusMessage");

// ===== DOM Element for request popup panel =====
const requestPopup = document.getElementById('requestPopup');
const requestList = document.getElementById('requestList');
const requestDot = document.getElementById('requestDot');
const chatRequestsBtn = document.getElementById('chatRequestsBtn');

// ===== DOM Elements =====
const overlay = document.getElementById('overlay');
const allPopups = [settingsPopup, newChatPopup, logoutPopup, requestPopup];

// ===== Chat State =====
let contacts = [];
let currentChatId = null;

// ===== Send Message =====
chatForm.addEventListener("submit", e => {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (!text || currentChatId === null) return;

    fetch(`/chat/send/${currentChatId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                const msgDiv = document.createElement("div");
                msgDiv.classList.add("chat-message");
                msgDiv.style.textAlign = "right";
                msgDiv.style.margin = "10px 0";
                msgDiv.innerHTML = `<span style="background:#00ffc8; padding:8px 12px; border-radius:15px; color:#121212; display:inline-block;">${text}</span>`;
                chatMessages.appendChild(msgDiv);

                chatMessages.scrollTop = chatMessages.scrollHeight;
                messageInput.value = "";
            } else {
                alert(data.message || "Failed to send message.");
            }
        });
});

// ===== Open Chat =====
async function openChat(contactId) {
    try {
        const response = await fetch(`/chat/messages/${contactId}`);
        if (!response.ok) throw new Error('Failed to load messages');

        const messages = await response.json();
        chatMessages.innerHTML = '';

        messages.forEach(msg => {
            const msgDiv = document.createElement('div');
            msgDiv.className = `message ${msg.sender}`;
            msgDiv.textContent = msg.text;
            chatMessages.appendChild(msgDiv);
        });

    } catch (err) {
        console.error('Failed to load messages:', err);
    }
}

// ===== Settings Handling =====
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

// ===== Logout Handling =====
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
    if (cancelBtn) cancelBtn.addEventListener('click', closeLogoutPopup);
});

// ===== SEND CHAT REQUEST FUNCTIONALITY =====

// Open popup when plus icon is clicked
plusIconSidebar.addEventListener('click', () => {
    if (newChatPopup) {
        newChatPopup.classList.add('show');  // show class triggers CSS animation
    }
});

// Cancel/hide popup (FINAL SOLUTION)
cancelRequestBtn.addEventListener('click', () => {
    if (newChatPopup) {
        newChatPopup.classList.remove('show');
    }
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
        if (data.success) {
            statusMessage.style.color = "green";
            statusMessage.textContent = data.message;
            targetUsernameInput.value = '';
        } else {
            statusMessage.style.color = "red";
            statusMessage.textContent = data.message;
        }
    } catch (err) {
        console.error('Error sending request:', err);
        statusMessage.style.color = "red";
        statusMessage.textContent = "Something went wrong.";
    }
});

// ===== INCOMING REQUEST POPUP FUNCTIONALITY =====


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

        // const panel = document.getElementById('requestPopup');
        requestPopup.innerHTML = ''; // Clear existing

        if (data.success && data.requests.length > 0) {
            data.requests.forEach(req => {
                // const avatarUrl = request.avatar
                //   ? `/uploads/avatars/${request.avatar}`
                //   : '/default-avatar.png';

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
                    </div>  `;
                requestPopup.appendChild(div);
                console.log("Appending request with id:", req.id);
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
        const requestId = e.target.dataset.id;
        handleRequestResponse(requestId, 'accept');
    }

    if (e.target.classList.contains('reject-btn')) {
        const requestId = e.target.dataset.id;
        handleRequestResponse(requestId, 'reject');
    }
});


async function handleRequestResponse(requestId, action) {
    try {
        console.log('Sending requestId:', requestId);
        const res = await fetch('/chat/request/respond', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requestId, action })
        });

        const data = await res.json();
        if (data.success) {
            loadIncomingRequests();
            // updateRequestDot(); // refresh red dot
            loadContacts(); // refresh contacts list
        } else {
            alert(data.message || 'Error responding to request');
        }
    } catch (err) {
        console.error('Error handling request:', err);
    }
}

async function openChat(chatId) {
    console.log("Opening chat with ID:", chatId);
    currentChatId = chatId;

    // Show message form when chat is opened
    document.getElementById('chatForm').style.display = 'flex';

    try {
        const response = await fetch(`/chat/messages/${chatId}`);
        if (!response.ok) throw new Error('Failed to load messages');

        const messages = await response.json();
        console.log("Messages received:", messages);

        const chatMessages = document.getElementById('chatMessages');
        chatMessages.innerHTML = ''; // Clear previous messages

        if (messages.length === 0) {
            chatMessages.innerHTML = '<p style="text-align:center; color:#555; margin-top: 40px;">No messages yet</p>';
        } else {
            messages.forEach(msg => {
                const msgDiv = document.createElement('div');
                msgDiv.innerHTML = `
                    <div style="margin:5px 0; padding:8px 12px; border-radius:8px; background:${msg.sender === 'you' ? '#00ffc8' : '#e0e0e0'}; color:${msg.sender === 'you' ? '#121212' : '#121212'}; text-align:${msg.sender === 'you' ? 'right' : 'left'};">
                        ${msg.text}
                    </div>`;
                chatMessages.appendChild(msgDiv);
            });
        }

        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;

    } catch (err) {
        console.error('Failed to load messages:', err);
        alert("Could not open chat. Try again.");
    }
}


// ===== Load Contacts on Page Load =====
async function loadContacts() {
    try {
        const res = await fetch('/chat/contacts');
        const contacts = await res.json();
        const contactList = document.getElementById('contactsList');
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
            li.addEventListener('click', () => {
                openChat(contact.chatId);

                // ✅ Optional: update the chat header too
                document.getElementById('chatAvatar').src = contact.avatar;
                document.getElementById('chatName').textContent = contact.fullname;

                // ✅ Show the input form
                document.getElementById('chatForm').style.display = 'flex';

                // ✅ Clear and focus the message input
                document.getElementById('messageInput').value = '';
                document.getElementById('messageInput').focus();
            });
            contactList.appendChild(li);
        });
    } catch (err) {
        console.error('Error loading contacts:', err);
    }
}


// ===== NOTIFICATION DOT (RED DOT) =====

// async function updateRequestDot() {
//     try {
//         const res = await fetch('/chat/requests/unread');
//         const data = await res.json();
//         if (data.count > 0) {
//             requestDot.style.display = 'inline-block';
//         } else {
//             requestDot.style.display = 'none';
//         }
//     } catch (err) {
//         console.error('Error fetching request count:', err);
//     }
// }

// ===== Initialize on load =====
// updateRequestDot();


// ===== Overlay Click Handling =====
overlay.addEventListener('click', () => {
    allPopups.forEach(popup => {
        if (popup && !popup.classList.contains('hidden')) {
            popup.classList.remove('show');
            setTimeout(() => popup.classList.add('hidden'), 200);
        }
    });
    overlay.classList.add('hidden');
});

document.addEventListener('DOMContentLoaded', () => {
    loadContacts();
});
