import { auth, db, storage } from './firebase-config.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, addDoc, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const params = new URLSearchParams(window.location.search);
const formUid = params.get('f');
const wallUid = params.get('w');
let currentRating = 5;

// --- INITIALIZATION ---
onAuthStateChanged(auth, async (user) => {
    // 1. PUBLIC VIEWS (No Login Required)
    if (formUid) { 
        showView('view-form'); 
        // Load Owner Name for form
        getDoc(doc(db, "users", formUid)).then(s => {
            if(s.exists()) document.getElementById('form-owner').innerText = s.data().name || "Us";
        });
        return; 
    }
    if (wallUid) { 
        showView('view-wall'); 
        loadReviews(wallUid, 'wall-list', true); // TRUE = Use Cache
        return; 
    }

    // 2. ADMIN VIEWS (Login Required)
    if (user) {
        const snap = await getDoc(doc(db, "users", user.uid));
        // CHECK LICENSE
        if (snap.exists() && snap.data().plan === 'lifetime') {
            showView('view-dash');
            loadReviews(user.uid, 'admin-list', false); // FALSE = No Cache (Live Data)
        } else {
            showView('view-lock');
        }
    } else {
        showView('view-auth');
    }
});

// --- ADMIN FUNCTIONS ---
window.handleAuth = async () => {
    const e = document.getElementById('email').value;
    const p = document.getElementById('pass').value;
    if(!e || !p) return alert("Enter details");
    
    try {
        await signInWithEmailAndPassword(auth, e, p);
    } catch {
        // Auto Register
        try {
            const c = await createUserWithEmailAndPassword(auth, e, p);
            await setDoc(doc(db, "users", c.user.uid), { 
                email: e, name: e.split('@')[0], plan: 'free', createdAt: Date.now() 
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
        await updateDoc(doc(db, "licenses", snap.docs[0].id), { status: 'used', usedBy: auth.currentUser.uid });
        await updateDoc(doc(db, "users", auth.currentUser.uid), { plan: 'lifetime' });
        alert("Account Unlocked!");
        location.reload();
    } else {
        alert("Invalid or Used Code");
    }
};

window.copyLink = (type) => {
    const url = `${window.location.origin}${window.location.pathname}?${type === 'form' ? 'f' : 'w'}=${auth.currentUser.uid}`;
    navigator.clipboard.writeText(url);
    alert("Copied to clipboard!");
};

window.logout = () => signOut(auth).then(()=>location.reload());

// --- PUBLIC FUNCTIONS ---
window.setStar = (n) => {
    currentRating = n;
    const stars = document.getElementById('stars').children;
    for(let i=0; i<5; i++) stars[i].style.color = i < n ? '#f59e0b' : '#e2e8f0';
};

window.submitReview = async () => {
    const name = document.getElementById('rev-name').value;
    const msg = document.getElementById('rev-msg').value;
    const file = document.getElementById('rev-img').files[0];
    const btn = document.getElementById('sub-btn');

    if(!name || !msg) return alert("Please fill details");
    btn.innerText = "Sending..."; btn.disabled = true;

    let imgUrl = null;
    if(file) {
        if(file.size > 1048576) { // 1MB Limit Client Side Check
            btn.innerText = "Submit"; btn.disabled = false;
            return alert("Image too large (Max 1MB)");
        }
        const sRef = ref(storage, `reviews/${Date.now()}_${file.name}`);
        await uploadBytes(sRef, file);
        imgUrl = await getDownloadURL(sRef);
    }

    await addDoc(collection(db, "reviews"), {
        ownerId: formUid, name, msg, rating: currentRating, photo: imgUrl, date: Date.now()
    });

    document.getElementById('view-form').innerHTML = `<div class='card'><h2>Thank You!</h2><p>Review sent.</p></div>`;
};

// --- CORE LOGIC (With Cost Saving) ---
async function loadReviews(uid, divId, useCache) {
    let reviews = [];
    const cacheKey = `rev_${uid}`;
    
    // 1. Try Cache first (Saves Reads)
    if(useCache) {
        const cached = localStorage.getItem(cacheKey);
        const time = localStorage.getItem(cacheKey + '_t');
        if(cached && time && (Date.now() - time < 3600000)) { // 1 Hour Cache
            console.log("Using Cache (Free)");
            reviews = JSON.parse(cached);
            renderReviews(reviews, divId);
            return;
        }
    }

    // 2. Fetch from Firebase
    console.log("Fetching from DB (Cost)");
    const q = query(collection(db, "reviews"), where("ownerId", "==", uid), orderBy("date", "desc"));
    const snap = await getDocs(q);
    
    snap.forEach(d => reviews.push(d.data()));
    
    // 3. Save to Cache
    if(useCache) {
        localStorage.setItem(cacheKey, JSON.stringify(reviews));
        localStorage.setItem(cacheKey + '_t', Date.now());
    }

    renderReviews(reviews, divId);
}

function renderReviews(list, divId) {
    const div = document.getElementById(divId);
    div.innerHTML = list.length ? '' : '<p>No reviews yet.</p>';
    
    list.forEach(r => {
        let stars = "★".repeat(r.rating);
        div.innerHTML += `
            <div class="review-card">
                <div class="stars">${stars}</div>
                <p style="color:#334155; line-height:1.5;">"${r.msg}"</p>
                <div class="user-info">
                    ${r.photo ? `<img src="${r.photo}" class="user-img">` : '<div class="user-img" style="background:#ddd"></div>'}
                    <span>${r.name}</span>
                </div>
            </div>
        `;
    });
}

function showView(id) {
    document.querySelectorAll('[id^="view-"]').forEach(el => el.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}
