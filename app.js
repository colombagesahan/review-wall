import { auth, db, storage } from './firebase-config.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, addDoc, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const params = new URLSearchParams(window.location.search);
const formUid = params.get('f');
const wallUid = params.get('w');
let currentRating = 5;
let uploadQueue = []; // Stores files to upload

// --- INIT ---
onAuthStateChanged(auth, async (user) => {
    // 1. PUBLIC FORM VIEW
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
    
    // 2. PUBLIC WALL VIEW
    if (wallUid) { 
        showView('view-wall'); 
        // Load settings for logo
        const snap = await getDoc(doc(db, "users", wallUid));
        if(snap.exists() && snap.data().logoUrl) {
            document.getElementById('wall-logo').src = snap.data().logoUrl;
            document.getElementById('wall-logo').style.display = 'inline-block';
        }
        loadReviews(wallUid, 'wall-list');
        return; 
    }

    // 3. ADMIN DASHBOARD
    if (user) {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists() && snap.data().plan === 'lifetime') {
            showView('view-dash');
            // Init Dashboard Data
            loadReviews(user.uid, 'reviews-list');
            document.getElementById('set-bizname').value = snap.data().bizName || "";
            document.getElementById('set-logo').value = snap.data().logoUrl || "";
            document.getElementById('set-msg').value = snap.data().welcomeMsg || "How was your experience?";
            
            // Generate Links
            const root = window.location.origin + window.location.pathname;
            document.getElementById('link-form').value = `${root}?f=${user.uid}`;
            document.getElementById('embed-code').value = `<iframe src="${root}?w=${user.uid}" width="100%" height="600" frameborder="0"></iframe>`;
        } else {
            showView('view-lock');
        }
    } else {
        showView('view-auth');
    }
});

// --- NAVIGATION & UI ---
window.toggleSidebar = () => document.getElementById('sidebar').classList.toggle('open');

window.switchTab = (tab) => {
    document.querySelectorAll('[id^="tab-"]').forEach(el => el.classList.add('hidden'));
    document.getElementById('tab-' + tab).classList.remove('hidden');
    // Mobile: close sidebar on click
    document.getElementById('sidebar').classList.remove('open');
};

window.copyInput = (id) => {
    const el = document.getElementById(id);
    el.select();
    navigator.clipboard.writeText(el.value);
    alert("Copied!");
};

window.shareSocial = (platform) => {
    const url = document.getElementById('link-form').value;
    const text = "Please leave us a review!";
    let link = "";
    if(platform === 'wa') link = `https://wa.me/?text=${encodeURIComponent(text + " " + url)}`;
    if(platform === 'fb') link = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
    window.open(link, '_blank');
};

window.copyLink = (type) => {
    const url = `${window.location.origin}${window.location.pathname}?${type === 'form' ? 'f' : 'w'}=${auth.currentUser.uid}`;
    if(type === 'wall') window.open(url, '_blank');
    else { navigator.clipboard.writeText(url); alert("Form Link Copied!"); }
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
    alert("Settings Saved!");
};

// --- REVIEW LOGIC ---
window.setStar = (n) => {
    currentRating = n;
    const stars = document.getElementById('stars').children;
    for(let i=0; i<5; i++) stars[i].style.color = i < n ? '#f59e0b' : '#ddd';
};

window.handleFileSelect = () => {
    const fileInput = document.getElementById('rev-file');
    if(fileInput.files.length > 0) {
        if(uploadQueue.length >= 3) return alert("Max 3 photos");
        uploadQueue.push(fileInput.files[0]);
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
    const msg = document.getElementById('rev-text').value; // Fixed ID
    const btn = document.getElementById('sub-btn');

    if(!name || !msg) return alert("Please fill name and review.");
    btn.innerText = "Uploading..."; btn.disabled = true;

    // Upload Photos
    let imageUrls = [];
    for(const file of uploadQueue) {
        const sRef = ref(storage, `reviews/${Date.now()}_${file.name}`);
        await uploadBytes(sRef, file);
        const url = await getDownloadURL(sRef);
        imageUrls.push(url);
    }

    await addDoc(collection(db, "reviews"), {
        ownerId: formUid, name, msg, rating: currentRating,
        photos: imageUrls, date: Date.now()
    });

    document.getElementById('view-form').innerHTML = `<div class='card-box'><h2>Thank You!</h2><p>Review Submitted.</p></div>`;
};

async function loadReviews(uid, divId) {
    // FIX FOR INDEX ERROR:
    // If console says "Requires Index", CLICK THE LINK IN CONSOLE. 
    // This query needs: ownerId ASC, date DESC
    try {
        const q = query(collection(db, "reviews"), where("ownerId", "==", uid), orderBy("date", "desc"));
        const snap = await getDocs(q);
        
        let reviews = [];
        let totalStars = 0;
        
        snap.forEach(d => {
            const r = d.data();
            reviews.push(r);
            totalStars += r.rating;
        });

        if(divId === 'reviews-list') {
            document.getElementById('stat-count').innerText = reviews.length;
            document.getElementById('stat-avg').innerText = reviews.length ? (totalStars/reviews.length).toFixed(1) : "0.0";
        }

        const div = document.getElementById(divId);
        div.innerHTML = reviews.length ? '' : '<p style="text-align:center; color:#999;">No reviews yet.</p>';
        
        reviews.forEach(r => {
            let stars = "★".repeat(r.rating);
            let imgHtml = "";
            if(r.photos && r.photos.length > 0) {
                imgHtml = `<div class="review-imgs">`;
                r.photos.forEach(src => imgHtml += `<a href="${src}" target="_blank"><img src="${src}"></a>`);
                imgHtml += `</div>`;
            }

            div.innerHTML += `
                <div class="review-card">
                    <div class="stars">${stars}</div>
                    <p style="color:#334155; line-height:1.5;">"${r.msg}"</p>
                    ${imgHtml}
                    <div style="margin-top:15px; font-weight:bold; font-size:0.9rem;">- ${r.name}</div>
                </div>
            `;
        });
    } catch(e) {
        console.error("Firebase Error:", e);
        if(e.code === 'failed-precondition') {
            document.getElementById(divId).innerHTML = `<p style="color:red;"><b>Admin Setup Required:</b> Please check Console for Index Link.</p>`;
        }
    }
}

function showView(id) {
    document.querySelectorAll('[id^="view-"]').forEach(el => el.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}
