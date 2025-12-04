import { auth, db } from './firebase-config.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, addDoc, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const params = new URLSearchParams(window.location.search);
const formUid = params.get('f');
const wallUid = params.get('w');
let currentRating = 5;

// --- INIT ---
onAuthStateChanged(auth, async (user) => {
    // 1. PUBLIC VIEW (Form)
    if (formUid) { 
        showView('view-form');
        // Load Business Name
        const snap = await getDoc(doc(db, "users", formUid));
        if (snap.exists()) {
            const d = snap.data();
            document.getElementById('form-biz-name').innerText = d.bizName || "Leave a Review";
            document.getElementById('form-msg').innerText = d.welcomeMsg || "How was your experience with us?";
        }
        return; 
    }
    // 2. PUBLIC VIEW (Wall)
    if (wallUid) { 
        showView('view-wall'); 
        loadReviews(wallUid, 'wall-list', true);
        return; 
    }

    // 3. DASHBOARD
    if (user) {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists() && snap.data().plan === 'lifetime') {
            showView('view-dash');
            loadReviews(user.uid, 'reviews-list', false);
            // Load Settings into Inputs
            document.getElementById('set-bizname').value = snap.data().bizName || "";
            document.getElementById('set-msg').value = snap.data().welcomeMsg || "How was your experience with us?";
        } else {
            showView('view-lock');
        }
    } else {
        showView('view-auth');
    }
});

// --- DASHBOARD ACTIONS ---
window.switchTab = (tab) => {
    document.getElementById('tab-reviews').classList.add('hidden');
    document.getElementById('tab-settings').classList.add('hidden');
    document.getElementById('tab-' + tab).classList.remove('hidden');
};

window.saveSettings = async () => {
    const name = document.getElementById('set-bizname').value;
    const msg = document.getElementById('set-msg').value;
    
    await updateDoc(doc(db, "users", auth.currentUser.uid), {
        bizName: name,
        welcomeMsg: msg
    });
    alert("Settings Saved!");
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
            await setDoc(doc(db, "users", c.user.uid), { 
                email: e, plan: 'free', bizName: "My Business" 
            });
            location.reload();
        } catch(err) { alert(err.message); }
    }
};

window.redeemCode = async () => {
    const code = document.getElementById('license-code').value.trim().toUpperCase();
    if(!code) return alert("Enter Code");

    const q = query(collection(db, "licenses"), where("code", "==", code));
    const snap = await getDocs(q);

    if(!snap.empty && snap.docs[0].data().status === 'active') {
        await updateDoc(doc(db, "licenses", snap.docs[0].id), { status: 'used' });
        await updateDoc(doc(db, "users", auth.currentUser.uid), { plan: 'lifetime' });
        location.reload();
    } else {
        alert("Invalid Code");
    }
};

window.logout = () => signOut(auth).then(()=>location.reload());

window.copyLink = (type) => {
    const url = `${window.location.origin}${window.location.pathname}?${type === 'form' ? 'f' : 'w'}=${auth.currentUser.uid}`;
    navigator.clipboard.writeText(url);
    alert("Copied!");
};

// --- REVIEW LOGIC ---
window.setStar = (n) => {
    currentRating = n;
    const stars = document.getElementById('stars').children;
    for(let i=0; i<5; i++) stars[i].style.color = i < n ? '#f59e0b' : '#e2e8f0';
};

window.submitReview = async () => {
    const name = document.getElementById('rev-name').value;
    const msg = document.getElementById('rev-msg').value;
    if(!name || !msg) return alert("Please details");

    await addDoc(collection(db, "reviews"), {
        ownerId: formUid, name, msg, rating: currentRating, date: Date.now()
    });
    document.getElementById('view-form').innerHTML = `<div class='card-box'><h2>Thank You!</h2><p>Review Sent.</p></div>`;
};

async function loadReviews(uid, divId, useCache) {
    // 1. Fetch from DB
    const q = query(collection(db, "reviews"), where("ownerId", "==", uid), orderBy("date", "desc"));
    const snap = await getDocs(q);
    
    let reviews = [];
    let totalStars = 0;
    
    snap.forEach(d => {
        const r = d.data();
        reviews.push(r);
        totalStars += r.rating;
    });

    // 2. Update Stats (Only in Dashboard)
    if(divId === 'reviews-list') {
        document.getElementById('stat-count').innerText = reviews.length;
        document.getElementById('stat-avg').innerText = reviews.length ? (totalStars / reviews.length).toFixed(1) : "0.0";
    }

    // 3. Render
    const div = document.getElementById(divId);
    div.innerHTML = reviews.length ? '' : '<p>No reviews yet.</p>';
    
    reviews.forEach(r => {
        let stars = "★".repeat(r.rating);
        div.innerHTML += `
            <div class="review-card">
                <div class="stars">${stars}</div>
                <p style="color:#334155; line-height:1.6;">"${r.msg}"</p>
                <div style="margin-top:15px; font-weight:bold; font-size:0.9rem;">- ${r.name}</div>
            </div>
        `;
    });
}

function showView(id) {
    document.querySelectorAll('[id^="view-"]').forEach(el => el.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}
