import { auth, db, storage } from './firebase-config.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, addDoc, orderBy, getCountFromServer } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// --- ⚠️ CHANGE THIS TO YOUR EMAIL ---
const ADMIN_EMAIL = "colombagesahan@gmail.com"; 

const params = new URLSearchParams(window.location.search);
const formUid = params.get('f');
const wallUid = params.get('w');
let currentRating = 5;
let uploadQueue = [];

// Country Codes
const countryCodes = {
    "AF": "+93", "AL": "+355", "DZ": "+213", "AS": "+1", "AD": "+376", "AO": "+244", "AI": "+1", "AG": "+1", "AR": "+54", "AM": "+374", "AW": "+297", "AU": "+61", "AT": "+43", "AZ": "+994", "BS": "+1", "BH": "+973", "BD": "+880", "BB": "+1", "BY": "+375", "BE": "+32", "BZ": "+501", "BJ": "+229", "BM": "+1", "BT": "+975", "BO": "+591", "BA": "+387", "BW": "+267", "BR": "+55", "IO": "+246", "VG": "+1", "BN": "+673", "BG": "+359", "BF": "+226", "BI": "+257", "KH": "+855", "CM": "+237", "CA": "+1", "CV": "+238", "KY": "+1", "CF": "+236", "TD": "+235", "CL": "+56", "CN": "+86", "CX": "+61", "CC": "+61", "CO": "+57", "KM": "+269", "CG": "+242", "CK": "+682", "CR": "+506", "HR": "+385", "CU": "+53", "CW": "+599", "CY": "+357", "CZ": "+420", "CD": "+243", "DK": "+45", "DJ": "+253", "DM": "+1", "DO": "+1", "TL": "+670", "EC": "+593", "EG": "+20", "SV": "+503", "GQ": "+240", "ER": "+291", "EE": "+372", "ET": "+251", "FK": "+500", "FO": "+298", "FJ": "+679", "FI": "+358", "FR": "+33", "GF": "+594", "PF": "+689", "GA": "+241", "GM": "+220", "GE": "+995", "DE": "+49", "GH": "+233", "GI": "+350", "GR": "+30", "GL": "+299", "GD": "+1", "GP": "+590", "GU": "+1", "GT": "+502", "GG": "+44", "GN": "+224", "GW": "+245", "GY": "+592", "HT": "+509", "HN": "+504", "HK": "+852", "HU": "+36", "IS": "+354", "IN": "+91", "ID": "+62", "IR": "+98", "IQ": "+964", "IE": "+353", "IM": "+44", "IL": "+972", "IT": "+39", "CI": "+225", "JM": "+1", "JP": "+81", "JE": "+44", "JO": "+962", "KZ": "+7", "KE": "+254", "KI": "+686", "KS": "+383", "KW": "+965", "KG": "+996", "LA": "+856", "LV": "+371", "LB": "+961", "LS": "+266", "LR": "+231", "LY": "+218", "LI": "+423", "LT": "+370", "LU": "+352", "MO": "+853", "MK": "+389", "MG": "+261", "MW": "+265", "MY": "+60", "MV": "+960", "ML": "+223", "MT": "+356", "MH": "+692", "MQ": "+596", "MR": "+222", "MU": "+230", "YT": "+262", "MX": "+52", "FM": "+691", "MD": "+373", "MC": "+377", "MN": "+976", "ME": "+382", "MS": "+1", "MA": "+212", "MZ": "+258", "MM": "+95", "NA": "+264", "NR": "+674", "NP": "+977", "NL": "+31", "NC": "+687", "NZ": "+64", "NI": "+505", "NE": "+227", "NG": "+234", "NU": "+683", "NF": "+672", "KP": "+850", "MP": "+1", "NO": "+47", "OM": "+968", "PK": "+92", "PW": "+680", "PS": "+970", "PA": "+507", "PG": "+675", "PY": "+595", "PE": "+51", "PH": "+63", "PL": "+48", "PT": "+351", "PR": "+1", "QA": "+974", "RE": "+262", "RO": "+40", "RU": "+7", "RW": "+250", "BL": "+590", "SH": "+290", "KN": "+1", "LC": "+1", "MF": "+590", "PM": "+508", "VC": "+1", "WS": "+685", "SM": "+378", "ST": "+239", "SA": "+966", "SN": "+221", "RS": "+381", "SC": "+248", "SL": "+232", "SG": "+65", "SX": "+1", "SK": "+421", "SI": "+386", "SB": "+677", "SO": "+252", "ZA": "+27", "KR": "+82", "SS": "+211", "ES": "+34", "LK": "+94", "SD": "+249", "SR": "+597", "SJ": "+47", "SZ": "+268", "SE": "+46", "CH": "+41", "SY": "+963", "TW": "+886", "TJ": "+992", "TZ": "+255", "TH": "+66", "TG": "+228", "TK": "+690", "TO": "+676", "TT": "+1", "TN": "+216", "TR": "+90", "TM": "+993", "TC": "+1", "TV": "+688", "UG": "+256", "UA": "+380", "AE": "+971", "GB": "+44", "US": "+1", "UY": "+598", "VI": "+1", "UZ": "+998", "VU": "+678", "VA": "+39", "VE": "+58", "VN": "+84", "WF": "+681", "YE": "+967", "ZM": "+260", "ZW": "+263"
};

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
        if(snap.exists()) {
            const d = snap.data();
            if(d.logoUrl) {
                document.getElementById('wall-logo').src = d.logoUrl;
                document.getElementById('wall-logo').style.display = 'inline-block';
            }
            if(d.design) applyDesign(d.design);
        }
        loadReviews(wallUid, 'wall-list');
        return; 
    }

    // 2. ADMIN & USER LOGIC
    if (user) {
        
        // --- SUPER ADMIN CHECK (Overrides everything) ---
        if(user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
            showView('view-admin');
            loadAdminStats();
            return;
        }

        // --- NORMAL USER CHECK ---
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists() && snap.data().plan === 'lifetime') {
            showView('view-dash');
            
            // Generate Links (Responsive Iframe)
            const root = window.location.origin + window.location.pathname;
            document.getElementById('link-form').value = `${root}?f=${user.uid}`;
            document.getElementById('embed-code').value = 
`<iframe src="${root}?w=${user.uid}" style="width:100%; min-width:100%; height:800px; border:none; display:block;" frameborder="0" scrolling="yes"></iframe>`;

            // Load Data
            document.getElementById('set-bizname').value = snap.data().bizName || "";
            document.getElementById('set-logo').value = snap.data().logoUrl || "";
            document.getElementById('set-msg').value = snap.data().welcomeMsg || "How was your experience?";
            
            // Load Reviews
            loadReviews(user.uid, 'reviews-list');
            loadReviewersList(user.uid);
            
            // Load Design
            const design = snap.data().design || {};
            if(design.wallBg) document.getElementById('ds-wall-bg').value = design.wallBg;
            if(design.cardBg) document.getElementById('ds-card-bg').value = design.cardBg;
            if(design.textColor) document.getElementById('ds-text').value = design.textColor;
            if(design.starColor) document.getElementById('ds-star').value = design.starColor;
            if(design.font) document.getElementById('ds-font').value = design.font;
            if(design.size) document.getElementById('ds-size').value = design.size;

        } else {
            showView('view-lock');
        }
    } else {
        showView('view-auth');
    }
});

// --- SUPER ADMIN STATS ---
async function loadAdminStats() {
    const collUser = collection(db, "users");
    const snapshotUser = await getCountFromServer(collUser);
    document.getElementById('admin-users').innerText = snapshotUser.data().count;

    const collRev = collection(db, "reviews");
    const snapshotRev = await getCountFromServer(collRev);
    document.getElementById('admin-reviews').innerText = snapshotRev.data().count;

    const q = query(collection(db, "licenses"), where("status", "==", "used"));
    const snapshotLic = await getCountFromServer(q);
    document.getElementById('admin-licenses').innerText = snapshotLic.data().count;
}

// --- NAVIGATION ---
window.toggleSidebar = () => document.getElementById('sidebar').classList.toggle('open');
window.switchTab = (tab) => {
    document.querySelectorAll('[id^="tab-"]').forEach(el => el.classList.add('hidden'));
    document.getElementById('tab-' + tab).classList.remove('hidden');
    document.getElementById('sidebar').classList.remove('open');
};
window.copyInput = (id) => {
    const el = document.getElementById(id); el.select(); el.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(el.value); alert("Copied!");
};
window.copyLink = (type) => {
    const root = window.location.origin + window.location.pathname;
    const url = `${root}?${type === 'form' ? 'f' : 'w'}=${auth.currentUser.uid}`;
    if(type === 'wall') window.open(url, '_blank'); else { navigator.clipboard.writeText(url); alert("Copied!"); }
};

// --- AUTH & LICENSE ---
window.handleAuth = async () => {
    const e = document.getElementById('email').value; const p = document.getElementById('pass').value;
    try { await signInWithEmailAndPassword(auth, e, p); } 
    catch { try { const c = await createUserWithEmailAndPassword(auth, e, p); await setDoc(doc(db, "users", c.user.uid), { email: e, plan: 'free' }); location.reload(); } catch(err) { alert(err.message); } }
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

// --- SETTINGS & DESIGN ---
window.saveSettings = async () => {
    await updateDoc(doc(db, "users", auth.currentUser.uid), {
        bizName: document.getElementById('set-bizname').value,
        logoUrl: document.getElementById('set-logo').value,
        welcomeMsg: document.getElementById('set-msg').value
    });
    alert("Saved!");
};
window.saveDesign = async () => {
    const design = {
        wallBg: document.getElementById('ds-wall-bg').value,
        cardBg: document.getElementById('ds-card-bg').value,
        textColor: document.getElementById('ds-text').value,
        starColor: document.getElementById('ds-star').value,
        font: document.getElementById('ds-font').value,
        size: document.getElementById('ds-size').value
    };
    await updateDoc(doc(db, "users", auth.currentUser.uid), { design });
    alert("Saved!");
};
function applyDesign(d) {
    const r = document.documentElement.style;
    if(d.wallBg) r.setProperty('--wall-bg', d.wallBg);
    if(d.cardBg) r.setProperty('--card-bg', d.cardBg);
    if(d.textColor) r.setProperty('--text-color', d.textColor);
    if(d.starColor) r.setProperty('--star-color', d.starColor);
    if(d.font) r.setProperty('--font-family', d.font);
    if(d.size) r.setProperty('--font-size', d.size);
}

// --- REVIEW LOGIC ---
window.setStar = (n) => {
    currentRating = n;
    const stars = document.getElementById('stars').children;
    for(let i=0; i<5; i++) stars[i].style.color = i < n ? '#f59e0b' : '#ddd';
};
window.handleFileSelect = () => {
    const fileInput = document.getElementById('rev-file');
    const errorBox = document.getElementById('file-error');
    if(fileInput.files.length > 0) {
        if(fileInput.files[0].size > 1048576) { errorBox.style.display = 'block'; fileInput.value = ""; return; }
        else { errorBox.style.display = 'none'; }
        if(uploadQueue.length >= 3) return alert("Max 3 photos");
        uploadQueue.push(fileInput.files[0]);
        renderPhotoPreviews();
    }
};
function renderPhotoPreviews() {
    const container = document.getElementById('photo-previews'); container.innerHTML = '';
    uploadQueue.forEach((file, index) => {
        const div = document.createElement('div'); div.className = 'photo-thumb';
        div.innerHTML = `<img src="${URL.createObjectURL(file)}"><div class="remove-photo" onclick="window.removePhoto(${index})">×</div>`;
        container.appendChild(div);
    });
}
window.removePhoto = (index) => { uploadQueue.splice(index, 1); renderPhotoPreviews(); };

window.submitReview = async () => {
    const name = document.getElementById('rev-name').value;
    const country = document.getElementById('rev-country').value;
    let contact = document.getElementById('rev-contact').value;
    const msg = document.getElementById('rev-text').value; 
    const btn = document.getElementById('sub-btn');

    if(!name || !country || !contact || !msg) return alert("All fields marked * are required.");
    
    // Email/Phone Check
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
    const isPhone = /^[0-9+\- ]{7,15}$/.test(contact);
    if(!isEmail && !isPhone) return alert("Please enter a valid Email or Phone Number.");

    if(isPhone && !contact.includes("+") && countryCodes[country]) {
        contact = countryCodes[country] + " " + contact;
    }

    btn.innerText = "Uploading..."; btn.disabled = true;

    try {
        let imageUrls = [];
        for(const file of uploadQueue) {
            const sRef = ref(storage, `reviews/${Date.now()}_${file.name}`);
            await uploadBytes(sRef, file);
            imageUrls.push(await getDownloadURL(sRef));
        }

        await addDoc(collection(db, "reviews"), {
            ownerId: formUid, name, contact, country, msg, rating: currentRating, photos: imageUrls, date: Date.now()
        });
        document.getElementById('view-form').innerHTML = `<div class='card-box'><h2>Thank You!</h2><p>Review Submitted.</p></div>`;
    } catch (e) {
        console.error(e); alert("Error: " + e.message); btn.innerText = "Submit Review"; btn.disabled = false;
    }
};

// --- DATA LOADING ---
async function loadReviews(uid, divId) {
    try {
        const q = query(collection(db, "reviews"), where("ownerId", "==", uid), orderBy("date", "desc"));
        const snap = await getDocs(q);
        let reviews = []; let totalStars = 0;
        snap.forEach(d => { const r = d.data(); reviews.push(r); totalStars += r.rating; });

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
            div.innerHTML += `
                <div class="review-card">
                    <div class="stars">${stars}</div>
                    <p style="line-height:1.5;">"${r.msg}"</p>
                    ${imgHtml}
                    <div style="margin-top:15px; font-weight:bold; font-size:0.9rem;">- ${r.name}</div>
                </div>`;
        });
    } catch(e) { console.error(e); }
}

async function loadReviewersList(uid) {
    const q = query(collection(db, "reviews"), where("ownerId", "==", uid), orderBy("date", "desc"));
    const snap = await getDocs(q);
    const container = document.getElementById('reviewers-list');
    container.innerHTML = "";

    if(snap.empty) { container.innerHTML = "<p>No data yet.</p>"; return; }

    let currentMonth = "";
    let monthDiv = null;

    snap.forEach(d => {
        const r = d.data();
        const dateObj = new Date(r.date);
        const monthStr = dateObj.toLocaleString('default', { month: 'long', year: 'numeric' });

        if(monthStr !== currentMonth) {
            currentMonth = monthStr;
            const header = document.createElement('div');
            header.className = "month-group";
            header.innerHTML = `<div class="month-header">${currentMonth}</div>`;
            container.appendChild(header);
            monthDiv = header;
        }

        const stars = "★".repeat(r.rating);
        const row = document.createElement('div');
        row.className = "reviewer-row";
        row.innerHTML = `
            <div style="display:flex; justify-content:space-between;">
                <strong>${r.name} <span style="color:#f59e0b">${stars}</span></strong>
                <span style="font-size:0.8rem; color:#888;">${dateObj.toLocaleDateString()}</span>
            </div>
            <div style="font-style:italic; font-size:0.9rem;">"${r.msg}"</div>
            <div class="reviewer-meta">
                <span>Country: ${r.country || 'N/A'}</span>
            </div>
            <div class="reviewer-contact"><i class="fa-solid fa-address-book"></i> ${r.contact}</div>
        `;
        monthDiv.appendChild(row);
    });
}

function showView(id) {
    document.querySelectorAll('[id^="view-"]').forEach(el => el.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}
