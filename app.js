import { auth, db, storage } from './firebase-config.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, addDoc, orderBy, getCountFromServer } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const ADMIN_EMAIL = "colombagesahan@gmail.com"; 
const params = new URLSearchParams(window.location.search);
const formUid = params.get('f');
const wallUid = params.get('w');
const fomoUid = params.get('popup'); // New Mode

let currentRating = 5;
let uploadQueue = [];
let mediaRecorder;
let videoChunks = [];
let videoBlob = null;
let isRecording = false;

// --- INIT ---
onAuthStateChanged(auth, async (user) => {
    // 1. PUBLIC FORM
    if (formUid) { 
        showView('view-form');
        const snap = await getDoc(doc(db, "users", formUid));
        if (snap.exists()) {
            const d = snap.data();
            document.getElementById('form-biz-name').innerText = d.bizName || "Leave a Review";
            document.getElementById('form-msg').innerText = d.welcomeMsg || "How was your experience?";
            // Store coupon code in window for later
            window.bizCoupon = d.couponCode || null;
            window.bizWebhook = d.webhookUrl || null;
        }
        return; 
    }
    
    // 2. WALL VIEW (Standard)
    if (wallUid) { 
        showView('view-wall'); 
        setupPublicView(wallUid);
        return; 
    }

    // 3. FOMO POPUP MODE (New)
    if (fomoUid) {
        // Transparent background
        document.body.style.background = 'transparent';
        const snap = await getDoc(doc(db, "users", fomoUid));
        if(snap.exists() && snap.data().design) applyDesign(snap.data().design);
        startFomoMode(fomoUid);
        return;
    }

    // 4. LOGGED IN DASHBOARD
    if (user) {
        if(user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
            document.getElementById('view-admin').classList.remove('hidden'); return;
        }
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
            showView('view-dash');
            loadUserData(user.uid, snap.data());
        } else {
            showView('view-lock');
        }
    } else {
        showView('view-auth');
    }
});

// --- HELPER FUNCTIONS ---
async function setupPublicView(uid) {
    const snap = await getDoc(doc(db, "users", uid));
    if(snap.exists()) {
        const d = snap.data();
        if(d.design) applyDesign(d.design);
        // SEO INJECTION
        injectSEO(d.bizName || "Reviews", 5, 100); // Dynamic values in real app
    }
    loadReviews(uid, 'wall-list', true);
}

function loadUserData(uid, data) {
    const root = window.location.origin + window.location.pathname;
    document.getElementById('link-form').value = `${root}?f=${uid}`;
    document.getElementById('embed-code').value = `<iframe src="${root}?w=${uid}" style="width:100%; min-width:100%; height:800px; border:none;" loading="lazy"></iframe>`;
    document.getElementById('fomo-code').value = `<script src="${root}/fomo.js?id=${uid}"></script>`; // Conceptual

    document.getElementById('set-bizname').value = data.bizName || "";
    document.getElementById('set-msg').value = data.welcomeMsg || "";
    document.getElementById('set-coupon').value = data.couponCode || "";
    document.getElementById('set-webhook').value = data.webhookUrl || "";
    
    loadReviews(uid, 'reviews-list', false);
    loadReviewersList(uid);
}

// --- CORE LOGIC: REVIEWS ---
window.submitReview = async () => {
    const name = document.getElementById('rev-name').value;
    const contact = document.getElementById('rev-contact').value;
    const msg = document.getElementById('rev-text').value; 
    const btn = document.getElementById('sub-btn');

    if(!name || !contact || !msg) return alert("Please fill all fields.");
    btn.innerText = "Processing..."; btn.disabled = true;

    try {
        let mediaUrls = [];
        
        // 1. Upload Photos
        for(const file of uploadQueue) {
            const sRef = ref(storage, `reviews/${Date.now()}_${file.name}`);
            await uploadBytes(sRef, file);
            mediaUrls.push({ type: 'img', url: await getDownloadURL(sRef) });
        }

        // 2. Upload Video (if exists)
        if(videoBlob) {
            const vRef = ref(storage, `videos/${Date.now()}.webm`);
            await uploadBytes(vRef, videoBlob);
            mediaUrls.push({ type: 'video', url: await getDownloadURL(vRef) });
        }

        // 3. AI Sentiment Analysis (Client Side)
        const aiTags = analyzeSentiment(msg);

        const reviewData = {
            ownerId: formUid, name, contact, msg, rating: currentRating, 
            media: mediaUrls, tags: aiTags, date: Date.now()
        };

        await addDoc(collection(db, "reviews"), reviewData);

        // 4. Webhook Trigger (Fire & Forget)
        if(window.bizWebhook) {
            fetch(window.bizWebhook, { method: 'POST', mode: 'no-cors', body: JSON.stringify(reviewData) });
        }

        // 5. Success UI (COUPON REVEAL)
        let html = `<div class='card-box' style='text-align:center;'>
            <h1 style='font-size:3rem;'>🎉</h1>
            <h2>Review Sent!</h2>`;
        
        if(window.bizCoupon) {
            html += `<div style="background:#f0fdf4; border:2px dashed #22c55e; padding:20px; margin-top:20px; border-radius:10px;">
                <p style="color:#15803d; font-weight:bold;">Here is your thank you gift:</p>
                <h1 style="color:#15803d; font-size:2.5rem; margin:10px 0;">${window.bizCoupon}</h1>
                <small>Use this code at checkout.</small>
            </div>`;
        }
        html += `</div>`;
        document.getElementById('view-form').innerHTML = html;

    } catch (e) {
        console.error(e); alert("Error: " + e.message); btn.disabled = false;
    }
};

// --- VIDEO RECORDER LOGIC ---
window.toggleRecord = async () => {
    const btn = document.getElementById('btn-record');
    const preview = document.getElementById('video-preview');
    
    if(!isRecording) {
        // Start
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            preview.srcObject = stream; preview.style.display = 'block'; preview.play();
            mediaRecorder = new MediaRecorder(stream);
            videoChunks = [];
            mediaRecorder.ondataavailable = e => videoChunks.push(e.data);
            mediaRecorder.start();
            isRecording = true;
            btn.innerText = "⬛ Stop Recording";
        } catch(e) { alert("Camera access denied."); }
    } else {
        // Stop
        mediaRecorder.stop();
        mediaRecorder.onstop = () => {
            videoBlob = new Blob(videoChunks, { type: 'video/webm' });
            preview.srcObject = null;
            preview.src = URL.createObjectURL(videoBlob);
            preview.controls = true;
            preview.play();
            isRecording = false;
            btn.innerText = "✅ Video Saved";
        };
    }
};

// --- AI SENTIMENT (Simple) ---
function analyzeSentiment(text) {
    const txt = text.toLowerCase();
    let tags = [];
    if(txt.includes('fast') || txt.includes('quick')) tags.push('Speed ⚡');
    if(txt.includes('support') || txt.includes('help')) tags.push('Support 🤝');
    if(txt.includes('love') || txt.includes('best') || txt.includes('great')) tags.push('Love ❤️');
    return tags;
}

// --- DATA & RENDERING ---
async function loadReviews(uid, divId, isPublic) {
    const q = query(collection(db, "reviews"), where("ownerId", "==", uid), orderBy("date", "desc"));
    const snap = await getDocs(q);
    const div = document.getElementById(divId);
    div.innerHTML = "";

    snap.forEach(d => {
        const r = d.data();
        const stars = "★".repeat(r.rating);
        let mediaHtml = "";
        
        // Handle Media (Images & Videos)
        if(r.media) {
            mediaHtml = `<div class="review-imgs">`;
            r.media.forEach(m => {
                if(m.type === 'video') mediaHtml += `<video src="${m.url}" controls style="width:100%; border-radius:8px; margin-top:5px;"></video>`;
                else mediaHtml += `<a href="${m.url}" target="_blank"><img src="${m.url}"></a>`;
            });
            mediaHtml += `</div>`;
        }

        // AI Tags
        let tagsHtml = r.tags ? r.tags.map(t => `<span class="tag">${t}</span>`).join('') : '';

        // Generate Card
        const card = document.createElement('div');
        card.className = "review-card";
        card.innerHTML = `
            <div style="display:flex; justify-content:space-between;">
                <div class="stars">${stars}</div>
                <div style="font-size:0.8rem; opacity:0.7;">${new Date(r.date).toLocaleDateString()}</div>
            </div>
            <div style="margin-bottom:10px;">${tagsHtml}</div>
            <p>"${r.msg}"</p>
            ${mediaHtml}
            <div style="margin-top:15px; font-weight:bold; display:flex; align-items:center; gap:10px;">
                <div class="avatar">${r.name.charAt(0)}</div> ${r.name}
            </div>
        `;
        
        // Add Social Share Button (Dashboard Only)
        if(!isPublic) {
            const btn = document.createElement('button');
            btn.className = "btn btn-sm btn-outline";
            btn.style = "margin-top:10px; width:100%; border-color:#8b5cf6; color:#8b5cf6;";
            btn.innerHTML = `<i class="fa-brands fa-instagram"></i> Create Post`;
            btn.onclick = () => generateSocialImage(r.name, r.msg, r.rating);
            card.appendChild(btn);
        }

        div.appendChild(card);
    });

    // VIRAL LOOP BADGE (Public Only)
    if(isPublic) {
        const badge = document.createElement('div');
        badge.innerHTML = `<a href="${window.location.origin}" target="_blank" class="viral-badge">⚡ Powered by ReviewWall</a>`;
        div.appendChild(badge);
    }
}

// --- SOCIAL IMAGE GENERATOR (Canvas) ---
window.generateSocialImage = async (name, text, stars) => {
    const div = document.createElement('div');
    // Instagram Story Size style
    div.style = "position:fixed; top:0; left:0; width:1080px; height:1920px; background:linear-gradient(45deg, #6366f1, #ec4899); display:flex; flex-direction:column; justify-content:center; align-items:center; padding:100px; z-index:9999; text-align:center; font-family:sans-serif; color:white;";
    div.innerHTML = `
        <div style="font-size:120px; color:#fbbf24; margin-bottom:50px;">${"★".repeat(stars)}</div>
        <div style="font-size:70px; font-weight:bold; line-height:1.3; background:rgba(255,255,255,0.2); padding:60px; border-radius:40px; backdrop-filter:blur(10px);">
            "${text}"
        </div>
        <div style="font-size:50px; margin-top:60px; opacity:0.9;">- ${name}</div>
        <div style="position:absolute; bottom:100px; font-size:40px; opacity:0.6;">Verified Review via ReviewWall</div>
    `;
    document.body.appendChild(div);
    const canvas = await html2canvas(div);
    const link = document.createElement('a');
    link.download = `Story_${name}.png`;
    link.href = canvas.toDataURL();
    link.click();
    document.body.removeChild(div);
};

// --- SPY MODE (CSV Import) ---
window.importCSV = () => {
    const file = document.getElementById('csv-file').files[0];
    if(!file) return;
    Papa.parse(file, {
        header: true,
        complete: async (results) => {
            if(confirm(`Import ${results.data.length} reviews?`)) {
                const uid = auth.currentUser.uid;
                for(const row of results.data) {
                    if(row.Review && row.Name) {
                         await addDoc(collection(db, "reviews"), {
                            ownerId: uid,
                            name: row.Name,
                            msg: row.Review,
                            rating: parseInt(row.Rating) || 5,
                            contact: row.Email || "Imported",
                            date: Date.now()
                        });
                    }
                }
                alert("Import Complete!");
                location.reload();
            }
        }
    });
};

// --- FOMO MODE ---
async function startFomoMode(uid) {
    const q = query(collection(db, "reviews"), where("ownerId", "==", uid), orderBy("date", "desc"));
    const snap = await getDocs(q);
    const reviews = [];
    snap.forEach(d => reviews.push(d.data()));

    if(reviews.length === 0) return;

    let i = 0;
    setInterval(() => {
        const r = reviews[i];
        const toast = document.createElement('div');
        toast.className = 'fomo-toast';
        toast.innerHTML = `
            <div class="stars">${"★".repeat(r.rating)}</div>
            <div style="font-size:0.9rem;"><b>${r.name}</b> just said:</div>
            <div style="font-size:0.85rem; color:#555;">"${r.msg.substring(0, 40)}..."</div>
            <small>Verified by ReviewWall</small>
        `;
        document.body.appendChild(toast);
        // Animate In
        setTimeout(() => toast.classList.add('active'), 100);
        // Remove
        setTimeout(() => { toast.classList.remove('active'); setTimeout(()=>toast.remove(),500); }, 5000);
        
        i = (i + 1) % reviews.length;
    }, 8000); // Every 8 seconds
}
window.startFomoPreview = () => startFomoMode(auth.currentUser.uid);

// --- DESIGN & SETTINGS SAVING ---
window.saveSettings = async () => {
    await updateDoc(doc(db, "users", auth.currentUser.uid), {
        bizName: document.getElementById('set-bizname').value,
        welcomeMsg: document.getElementById('set-msg').value,
        couponCode: document.getElementById('set-coupon').value,
        webhookUrl: document.getElementById('set-webhook').value
    });
    alert("Saved! Coupons & Webhooks active.");
};

window.updateThemePreview = () => {
    const theme = document.getElementById('ds-theme').value;
    if(theme === 'dark') {
        document.getElementById('ds-wall-bg').value = '#0f172a';
        document.getElementById('ds-card-bg').value = '#1e293b';
        document.getElementById('ds-text').value = '#f8fafc';
    } else if (theme === 'cyber') {
        document.getElementById('ds-wall-bg').value = '#000000';
        document.getElementById('ds-card-bg').value = '#111111';
        document.getElementById('ds-text').value = '#00ff00';
        document.getElementById('ds-star').value = '#ff00ff';
    } else {
        document.getElementById('ds-wall-bg').value = '#f3f4f6';
        document.getElementById('ds-card-bg').value = '#ffffff';
        document.getElementById('ds-text').value = '#334155';
    }
};

function injectSEO(name, rating, count) {
    const json = {
        "@context": "https://schema.org/",
        "@type": "Product",
        "name": name,
        "aggregateRating": {
            "@type": "AggregateRating",
            "ratingValue": rating,
            "reviewCount": count
        }
    };
    const script = document.createElement('script');
    script.type = "application/ld+json";
    script.text = JSON.stringify(json);
    document.head.appendChild(script);
}

// ... (Keep existing auth/nav/redeem functions) ...
window.toggleSidebar = () => document.getElementById('sidebar').classList.toggle('open');
window.switchTab = (tab) => { document.querySelectorAll('[id^="tab-"]').forEach(el => el.classList.add('hidden')); document.getElementById('tab-' + tab).classList.remove('hidden'); document.getElementById('sidebar').classList.remove('open'); };
window.copyInput = (id) => { const el = document.getElementById(id); el.select(); document.execCommand('copy'); alert("Copied!"); };
window.copyLink = (t) => { const url = `${window.location.origin}${window.location.pathname}?${t==='wall'?'w':'f'}=${auth.currentUser.uid}`; if(t==='wall') window.open(url); else { navigator.clipboard.writeText(url); alert("Copied!"); }};
window.handleAuth = async () => { const e=document.getElementById('email').value, p=document.getElementById('pass').value; try { await signInWithEmailAndPassword(auth,e,p); } catch { try { const c=await createUserWithEmailAndPassword(auth,e,p); await setDoc(doc(db,"users",c.user.uid),{email:e,plan:'free'}); location.reload(); } catch(err){alert(err.message);} }};
window.redeemCode = async () => { const c=document.getElementById('license-code').value.trim().toUpperCase(); const q=query(collection(db,"licenses"),where("code","==",c)); const s=await getDocs(q); if(!s.empty&&s.docs[0].data().status==='active'){ await updateDoc(doc(db,"licenses",s.docs[0].id),{status:'used'}); await updateDoc(doc(db,"users",auth.currentUser.uid),{plan:'lifetime'}); location.reload(); } else alert("Invalid"); };
window.logout = () => signOut(auth).then(()=>location.reload());
window.saveDesign = async () => { await updateDoc(doc(db,"users",auth.currentUser.uid),{design:{ wallBg:document.getElementById('ds-wall-bg').value, cardBg:document.getElementById('ds-card-bg').value, textColor:document.getElementById('ds-text').value, starColor:document.getElementById('ds-star').value, font:document.getElementById('ds-font').value, size:document.getElementById('ds-size').value }}); alert("Saved"); };
function applyDesign(d) { const r=document.documentElement.style; if(d.wallBg)r.setProperty('--wall-bg',d.wallBg); if(d.cardBg)r.setProperty('--card-bg',d.cardBg); if(d.textColor)r.setProperty('--text-color',d.textColor); if(d.starColor)r.setProperty('--star-color',d.starColor); }
window.setStar = (n) => { currentRating = n; const s=document.getElementById('stars').children; for(let i=0;i<5;i++) s[i].style.color=i<n?'#f59e0b':'#ddd'; };
window.handleFileSelect = () => { const f=document.getElementById('rev-file').files[0]; if(f){ uploadQueue.push(f); renderPhotoPreviews(); }};
function renderPhotoPreviews() { document.getElementById('photo-previews').innerHTML = uploadQueue.map((f,i)=>`<div class="photo-thumb"><div class="remove-photo" onclick="window.removePhoto(${i})">×</div></div>`).join(''); }
window.removePhoto = (i) => { uploadQueue.splice(i,1); renderPhotoPreviews(); };
