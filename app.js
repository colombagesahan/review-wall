import { auth, db, storage } from './firebase-config.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, addDoc, orderBy, getCountFromServer } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// --- CONFIG YOUR ADMIN EMAIL HERE ---
const ADMIN_EMAIL = "colombagesahan@gmail.com"; 

const params = new URLSearchParams(window.location.search);
const formUid = params.get('f');
const wallUid = params.get('w');
let currentRating = 5;
let uploadQueue = [];

// --- INIT ---
onAuthStateChanged(auth, async (user) => {
    // 1. PUBLIC VIEWS (No Login)
    if (formUid) { 
        showView('view-form');
        const snap = await getDoc(doc(db, "users", formUid));
        if (snap.exists()) {
            const d = snap.data();
            document.getElementById('form-biz-name').innerText = d.bizName || "Leave a Review";
            document.getElementById('form-msg').innerText = d.welcomeMsg || "How was your experience?";
            if(d.logoUrl) {
                document.getElementById('form-logo').src = d.logoUrl;
                document.getElementById('form-logo').style.display = 'block';
            }
        }
        return; 
    }
    
    if (wallUid) { 
        showView('view-wall'); 
        const snap = await getDoc(doc(db, "users", wallUid));
        if(snap.exists() && snap.data().logoUrl) {
            document.getElementById('wall-logo').src = snap.data().logoUrl;
            document.getElementById('wall-logo').style.display = 'inline-block';
        }
        loadReviews(wallUid, 'wall-list');
        return; 
    }

    // 2. LOGGED IN LOGIC
    if (user) {
        // --- CHECK IF SUPER ADMIN ---
        if (user.email === ADMIN_EMAIL) {
            showView('view-admin');
            loadAdminStats();
            return;
        }

        // --- NORMAL USER ---
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists() && snap.data().plan === 'lifetime') {
            showView('view-dash');
            
            // Generate Links
            const root = window.location.origin + window.location.pathname;
            document.getElementById('link-form').value = `${root}?f=${user.uid}`;
            document.getElementById('embed-code').value = `<iframe src="${root}?w=${user.uid}" width="100%" height="600" frameborder="0"></iframe>`;

            // Load Data
            document.getElementById('set-bizname').value = snap.data().bizName || "";
            document.getElementById('set-logo').value = snap.data().logoUrl || "";
            document.getElementById('set-msg').value = snap.data().welcomeMsg || "How was your experience?";
            loadReviews(user.uid, 'reviews-list');
        } else {
            showView('view-lock');
        }
    } else {
        showView('view-auth');
    }
});

// --- ADMIN STATS LOGIC ---
async function loadAdminStats() {
    // Count Users
    const collUser = collection(db, "users");
    const snapshotUser = await getCountFromServer(collUser);
    document.getElementById('admin-users').innerText = snapshotUser.data().count;

    // Count Reviews
    const collRev = collection(db, "reviews");
    const snapshotRev = await getCountFromServer(collRev);
    document.getElementById('admin-reviews').innerText = snapshotRev.data().count;

    // Count Licenses Used
    const q = query(collection(db, "licenses"), where("status", "==", "used"));
    const snapshotLic = await getCountFromServer(q);
    document.getElementById('admin-licenses').innerText = snapshotLic.data().count;
}

// --- NAVIGATION & UI ---
window.toggleSidebar = () => document.getElementById('sidebar').classList.toggle('open');
window.switchTab = (tab) => {
    document.querySelectorAll('[id^="tab-"]').forEach(el => el.classList.add('hidden'));
    document.getElementById('tab-' + tab).classList.remove('hidden');
    document.getElementById('sidebar').classList.remove('open');
};
window.copyInput = (id) => {
    const el = document.getElementById(id);
    el.select();
    el.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(el.value);
    alert("Copied!");
};
window.copyLink = (type) => {
    const root = window.location.origin + window.location.pathname;
    const url = `${root}?${type === 'form' ? 'f' : 'w'}=${auth.currentUser.uid}`;
    if(type === 'wall') window.open(url, '_blank');
    else { navigator.clipboard.writeText(url); alert("Link Copied!"); }
};

// --- AUTH & LICENSE ---
window.handleAuth = async () => {
    const e = document.getElementById('email').value;
    const p = document.getElementById('pass').value;
    try {
        await signInWithEmailAndPassword(auth, e, p);
    } catch {
        try {
            const c = await createUserWithEmailAndPassword(auth, e, p);
            await setDoc(doc(db, "users", c.user.uid), { email: e, plan: 'free' });
            location.reload();
        } catch(err) { alert(err.message); }
    }
};
window.redeemCode = async () => {
    const code = document.getElementById('license-code').value.trim().toUpperCase();
    const q = query(collection(db, "licenses"), where("code", "==", code));
    const snap = await getDocs(q);
    if(!snap.empty && snap.docs[0].data().status === 'active') {
        await updateDoc(doc(db, "licenses", snap.docs[0].id), { status: 'used' });
        await updateDoc(doc(db, "users", auth.currentUser.uid), { plan: 'lifetime' });
        location.reload();
    } else { alert("Invalid Code"); }
};
window.logout = () => signOut(auth).then(()=>location.reload());
window.saveSettings = async () => {
    await updateDoc(doc(db, "users", auth.currentUser.uid), {
        bizName: document.getElementById('set-bizname').value,
        logoUrl: document.getElementById('set-logo').value,
        welcomeMsg: document.getElementById('set-msg').value
    });
    alert("Saved!");
};

// --- FILE & REVIEW LOGIC ---
window.setStar = (n) => {
    currentRating = n;
    const stars = document.getElementById('stars').children;
    for(let i=0; i<5; i++) stars[i].style.color = i < n ? '#f59e0b' : '#ddd';
};

window.handleFileSelect = () => {
    const fileInput = document.getElementById('rev-file');
    const errorBox = document.getElementById('file-error');
    if(fileInput.files.length > 0) {
        const file = fileInput.files[0];
        if(file.size > 1048576) {
            errorBox.style.display = 'block'; fileInput.value = ""; return;
        } else { errorBox.style.display = 'none'; }

        if(uploadQueue.length >= 3) return alert("Max 3 photos");
        uploadQueue.push(file);
        renderPhotoPreviews();
    }
};

function renderPhotoPreviews() {
    const container = document.getElementById('photo-previews');
    container.innerHTML = '';
    uploadQueue.forEach((file, index) => {
        const div = document.createElement('div');
        div.className = 'photo-thumb';
        div.innerHTML = `<img src="${URL.createObjectURL(file)}"><div class="remove-photo" onclick="window.removePhoto(${index})">×</div>`;
        container.appendChild(div);
    });
}
window.removePhoto = (index) => {
    uploadQueue.splice(index, 1);
    renderPhotoPreviews();
};

window.submitReview = async () => {
    const name = document.getElementById('rev-name').value;
    const contact = document.getElementById('rev-contact').value;
    const country = document.getElementById('rev-country').value;
    const msg = document.getElementById('rev-text').value; 
    const btn = document.getElementById('sub-btn');

    if(!name || !contact || !country || !msg) return alert("All fields are required!");
    btn.innerText = "Uploading..."; btn.disabled = true;

    try {
        let imageUrls = [];
        for(const file of uploadQueue) {
            const sRef = ref(storage, `reviews/${Date.now()}_${file.name}`);
            await uploadBytes(sRef, file);
            const url = await getDownloadURL(sRef);
            imageUrls.push(url);
        }

        await addDoc(collection(db, "reviews"), {
            ownerId: formUid, name, contact, country, msg, rating: currentRating, photos: imageUrls, date: Date.now()
        });
        document.getElementById('view-form').innerHTML = `<div class='card-box'><h2>Thank You!</h2><p>Review Submitted Successfully.</p></div>`;
    } catch (e) {
        console.error(e); alert("Error: " + e.message); btn.innerText = "Submit Review"; btn.disabled = false;
    }
};

async function loadReviews(uid, divId) {
    try {
        const q = query(collection(db, "reviews"), where("ownerId", "==", uid), orderBy("date", "desc"));
        const snap = await getDocs(q);
        let reviews = []; let totalStars = 0;
        
        snap.forEach(d => {
            const r = d.data(); reviews.push(r); totalStars += r.rating;
        });

        if(divId === 'reviews-list') {
            document.getElementById('stat-count').innerText = reviews.length;
            document.getElementById('stat-avg').innerText = reviews.length ? (totalStars/reviews.length).toFixed(1) : "0.0";
        }

        const div = document.getElementById(divId);
        div.innerHTML = reviews.length ? '' : '<p style="text-align:center; color:#999; margin-top:20px;">No reviews yet.</p>';
        
        reviews.forEach(r => {
            let stars = "★".repeat(r.rating);
            let imgHtml = "";
            if(r.photos && r.photos.length > 0) {
                imgHtml = `<div class="review-imgs">`;
                r.photos.forEach(src => imgHtml += `<a href="${src}" target="_blank"><img src="${src}"></a>`);
                imgHtml += `</div>`;
            }
            let contactInfo = "";
            if(divId === 'reviews-list') {
                contactInfo = `<div class="admin-badge"><i class="fa-solid fa-envelope"></i> ${r.contact} (${r.country})</div>`;
            }
            div.innerHTML += `
                <div class="review-card">
                    <div class="stars">${stars}</div>
                    <p style="color:#334155; line-height:1.5;">"${r.msg}"</p>
                    ${imgHtml}
                    <div style="margin-top:15px; font-weight:bold; font-size:0.9rem;">- ${r.name}</div>
                    ${contactInfo}
                </div>
            `;
        });
    } catch(e) { console.error(e); }
}

function showView(id) {
    document.querySelectorAll('[id^="view-"]').forEach(el => el.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}
