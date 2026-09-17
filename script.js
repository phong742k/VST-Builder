// --- SUPABASE CONFIG ---
const SUPABASE_URL = 'https://znbsawlfrthwhchfetgv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpuYnNhd2xmcnRod2hjaGZldGd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5ODc4NzgsImV4cCI6MjEwMzU2Mzg3OH0.CiPtEJt0b0fd0W4ERzTobJl2VH3aJ6JHgEkhYFmuSog';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let hasCheckedProfile = false;
let allPlaces = []; 
let currentType = 'attraction';
let currentRegion = 'All';
let currentCity = 'All';
let dayCount = 0;
let currentItineraryId = null;
let currentTemplateId = null;

// Auth State Listener
supabaseClient.auth.onAuthStateChange(async(event, session) => {
    currentUser = session?.user || null;
    const authBtn = document.getElementById('auth-btn');
    const userEmail = document.getElementById('user-email');
    const profileBtn = document.getElementById('profile-btn');

    // Mở khóa giao diện - Dùng if để chống Crash nếu thẻ HTML không tồn tại trên mobile
    const guestLock = document.getElementById('guest-lock-screen');
    const dashSelector = document.getElementById('dashboard-selector');
    const mainApp = document.getElementById('main-app-container');
    
    if (guestLock) guestLock.style.display = 'none';
    if (dashSelector) dashSelector.style.display = 'none';
    if (mainApp) mainApp.style.display = 'flex';

    if (dayCount === 0) {
        initBoard();
    }

    if (currentUser) {
        if (userEmail) userEmail.innerText = currentUser.email;
        if (authBtn) {
            authBtn.innerText = 'Logout';
            authBtn.style.background = '#d32f2f';
        }
        if (profileBtn) profileBtn.style.display = 'inline-block';
        
        loadUserProfile();
        if (typeof checkAdminPermission === 'function') checkAdminPermission();
        await checkAndEnforceProfileName();
    } else {
        if (userEmail) userEmail.innerText = '';
        if (authBtn) {
            authBtn.innerText = 'Login with Google';
            authBtn.style.background = '#4caf50';
        }
        if (profileBtn) profileBtn.style.display = 'none';
    }

    // Tự động load dữ liệu Profile vào tab Mobile nếu đang chạy file mobile
    if (typeof renderMobileProfileStatus === 'function') renderMobileProfileStatus();
});

function showGuestLock() {
    document.getElementById('guest-lock-screen').style.display = 'block';
    document.getElementById('dashboard-selector').style.display = 'none';
    document.getElementById('main-app-container').style.display = 'none';
}

function showDashboardSelector() {
    document.getElementById('guest-lock-screen').style.display = 'none';
    document.getElementById('dashboard-selector').style.display = 'block';
    document.getElementById('main-app-container').style.display = 'none';
}

// --- TẠO MỚI LỊCH TRÌNH CÓ CHECK LƯU NHÁP ---
async function startNewItinerary() {
    // Kiểm tra xem bảng hiện tại có dữ liệu hay không (đã có ngày hoặc card nào chưa)
    const hasData = dayCount > 0 || document.querySelectorAll('.timeline-item').length > 0;

    if (hasData) {
        let wantToSave = confirm("Do you want to save the current itinerary draft before creating a new trip?");
        if (wantToSave) {
            await saveToCloud(); // Tự động lưu bản hiện tại lên mây
        }
    }

    // Reset sạch sẽ để tạo mới
    currentItineraryId = null;
    dayCount = 0;
    
    // Đóng các modal nếu đang mở
    const dashboardSel = document.getElementById('dashboard-selector');
    const draftsMod = document.getElementById('drafts-modal');
    if (dashboardSel) dashboardSel.style.display = 'none';
    if (draftsMod) draftsMod.style.display = 'none';

    document.getElementById('main-app-container').style.display = 'flex';
    
    initBoard();
    
    // ÉP CẬP NHẬT LẠI TỔNG CHI PHÍ VỀ 0
    if (typeof updateCostSummary === 'function') updateCostSummary();
}

async function handleAuth() {
    if (currentUser) {
        hasCheckedProfile = false; // Reset lại cờ khi logout
        await supabaseClient.auth.signOut();
        alert("Logged out successfully!");
        location.reload();
    } else {
        const { error } = await supabaseClient.auth.signInWithOAuth({ provider: 'google' });
        if (error) alert("Login error: " + error.message);
    }
}

// Fetch places library từ Supabase thay vì Google Sheet
async function fetchPlacesLibrary() {
    const { data, error } = await supabaseClient.from('places').select('*');
    if (error) {
        console.error("Lỗi tải địa điểm từ Supabase:", error.message);
        return;
    }
    allPlaces = (data || []).map(p => ({
        ...p,
        type: p.type ? p.type.toLowerCase().trim() : 'attraction',
        region: p.region ? p.region.charAt(0).toUpperCase() + p.region.slice(1).toLowerCase().trim() : 'North'
    }));
    setRegion('All');
}

// Gọi hàm fetch khi script khởi chạy
fetchPlacesLibrary();

function setType(type) {
    currentType = type;
    
    // Lấy 3 nút ra
    let btnAttr = document.getElementById('btn-type-attraction');
    let btnFood = document.getElementById('btn-type-food');
    let btnAct = document.getElementById('btn-type-activity');

    // Gỡ màu active cũ (dùng classList để giữ nguyên hình dáng nút)
    if (btnAttr) btnAttr.classList.remove('active-attraction');
    if (btnFood) btnFood.classList.remove('active-food');
    if (btnAct) btnAct.classList.remove('active-activity');

    // Đắp màu active mới tương ứng
    if (type === 'attraction' && btnAttr) btnAttr.classList.add('active-attraction');
    if (type === 'food' && btnFood) btnFood.classList.add('active-food');
    if (type === 'activity' && btnAct) btnAct.classList.add('active-activity');

    applyFilters();
}

function setRegion(region) {
    currentRegion = region;
    currentCity = 'All';
    
    // Gỡ class 'active' của toàn bộ nút miền
    const regButtons = ['All', 'North', 'Central', 'South'];
    regButtons.forEach(reg => {
        let btn = document.getElementById(`btn-reg-${reg}`);
        if (btn) {
            btn.classList.remove('active');
            // Cập nhật lại màu inline/class dự phòng cho chắc ăn
            if (reg === region) {
                btn.classList.add('active');
                btn.style.background = '#0f172a';
                btn.style.color = 'white';
                btn.style.borderColor = '#0f172a';
            } else {
                btn.style.background = 'white';
                btn.style.color = '#333';
                btn.style.borderColor = '#cbd5e1';
            }
        }
    });

    let cities = region === 'All' 
        ? [...new Set(allPlaces.filter(p => p.type === currentType).map(p => p.city))]
        : [...new Set(allPlaces.filter(p => p.region === region && p.type === currentType).map(p => p.city))];

    const cityContainer = document.getElementById('city-tabs-container');
    cityContainer.innerHTML = `<button onclick="setCity('All')" class="city-btn active" id="btn-city-All">All Cities</button>`;
    
    cities.forEach(city => {
        if (city) {
            const cityId = city.replace(/\s+/g, '-');
            cityContainer.innerHTML += `<button onclick="setCity('${city}')" class="city-btn" id="btn-city-${cityId}">${city}</button>`;
        }
    });
    applyFilters();
}

function setCity(city) {
    currentCity = city;
    document.querySelectorAll('#city-tabs-container button').forEach(btn => btn.classList.remove('active'));
    const cityId = city === 'All' ? 'All' : city.replace(/\s+/g, '-');
    document.getElementById(`btn-city-${cityId}`).classList.add('active');
    applyFilters();
}

function applyFilters() {
    let filtered = allPlaces.filter(p => p.type === currentType);
    if (currentRegion !== 'All') filtered = filtered.filter(p => p.region === currentRegion);
    if (currentCity !== 'All') filtered = filtered.filter(p => p.city === currentCity);
    renderLibrary(filtered);
}

function renderLibrary(places) {
    const list = document.getElementById('place-list');
    list.innerHTML = '';
    places.forEach(place => {
        const card = document.createElement('div');
        card.className = `place-card card-${place.type}`;
        card.setAttribute('draggable', 'true');
        
        card.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('application/json', JSON.stringify({ ...place, isCustom: false }));
        });

        card.addEventListener('click', (e) => {
            if(e.target.tagName === 'A') return; 
            showPlaceModal(place);
        });

        let addressHtml = place.address ? `<p style="font-size: 11px; color: #555; margin: 2px 0;">📍 ${place.address}</p>` : '';
        let mapButtonHtml = place.mapLink ? `<a href="${place.mapLink}" target="_blank" style="font-size: 11px; color: #2196f3; text-decoration: none; font-weight: bold; display: inline-block; margin-bottom: 4px;">🗺️ Open in Google Maps</a>` : '';

        // Nút Add to my Trip gọi riêng hàm addPlaceQuickly và chặn sự kiện click lan ra ngoài card
        let safeJson = encodeURIComponent(JSON.stringify(place));
        card.innerHTML = `
            <img src="${place.image}" alt="">
            <div class="place-info" style="flex-grow: 1;">
                <h4>${place.name}</h4>
                ${addressHtml}
                ${mapButtonHtml}
                <p style="margin-top: 4px;">⏱️ ${place.timeToVisit} mins | 💰 ${formatPriceDisplay(place)}</p>
                <p class="place-desc">${place.description}</p>
                <button onclick="event.stopPropagation(); addPlaceQuickly('${safeJson}')" style="margin-top: 6px; background: #0284c7; color: white; border: none; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: bold; cursor: pointer;">➕ Add to my Trip</button>
            </div>
        `;
        // Gắn sự kiện click mở modal chi tiết vào chính cái card
        card.onclick = () => showPlaceModal(place);

        list.appendChild(card);
    });
}

function dragCustom(e) {
    e.dataTransfer.setData('application/json', JSON.stringify({ isCustom: true }));
}

function initBoard() {
    const board = document.getElementById('itinerary-board');
    board.innerHTML = `
        <div class="add-day-btn" id="start-btn" onclick="addNewDay()">
            + Click to start building your itinerary
        </div>
    `;
    
    // --- THÊM ĐOẠN NÀY ĐỂ ẨN ---
    const costSummary = document.getElementById('itinerary-cost-summary');
    const actionBtns = document.querySelector('.static-action-buttons');
    if (costSummary) costSummary.style.display = 'none';
    if (actionBtns) actionBtns.style.display = 'none';
}

function addNewDay() {
    dayCount++;
    const board = document.getElementById('itinerary-board');
    const startBtn = document.getElementById('start-btn');
    if (startBtn) startBtn.remove(); 

    // --- THÊM ĐOẠN NÀY ĐỂ HIỆN RA ---
    const costSummary = document.getElementById('itinerary-cost-summary');
    const actionBtns = document.querySelector('.static-action-buttons');
    if (costSummary) costSummary.style.display = 'block';
    if (actionBtns) actionBtns.style.display = 'flex'; // class static-action-buttons xài flex

    let defaultDate = '';
    if (dayCount > 1) {
        const prevInput = document.querySelector(`#day-${dayCount - 1} .day-date-input`);
        if (prevInput && prevInput.value) {
            const prevDate = new Date(prevInput.value);
            prevDate.setDate(prevDate.getDate() + 1);
            defaultDate = prevDate.toISOString().split('T')[0];
        }
    }

    const dayId = `day-${dayCount}`;
    let dayHtml = `
        <div class="day-block" id="${dayId}">
            <div class="day-header">
                <div style="display:flex; align-items:center; gap:15px;">
                    <h3 class="day-title-text">Day ${dayCount}</h3>
                    <input type="date" class="day-date-input" value="${defaultDate}" onchange="updateSubsequentDates(${dayCount})">
                </div>
                <div style="display:flex; align-items:center; gap:15px;">
                    <div style="font-size: 13px; font-weight: bold; color: #555;">
                        Starts at: <input type="time" class="day-start-time" step="900" value="08:00" onchange="recalculateTime('${dayId}')">
                    </div>
                    <button class="btn-remove-day" onclick="removeDay('${dayId}')">🗑️ Remove Day</button>
                </div>
            </div>
            <div class="dropzone" id="drop-${dayId}"></div>
        </div>
    `;
    
    const addNextBtn = document.getElementById('add-next-day-btn');
    if (addNextBtn) {
        addNextBtn.insertAdjacentHTML('beforebegin', dayHtml);
    } else {
        board.innerHTML += dayHtml;
        board.innerHTML += `
            <div class="add-day-btn faded" id="add-next-day-btn" onclick="addNewDay()">
                + Click to add next day
            </div>
        `;
    }

    bindDropzoneEvents(document.getElementById(`drop-${dayId}`));
}

// =========================================================================
// HÀM TẠO NGÀY RIÊNG BIỆT DÀNH CHO MOBILE (Không ảnh hưởng bản web)
// =========================================================================
function addMobileNewDay(startTime = '08:00') {
    dayCount++;
    const board = document.getElementById('itinerary-board');
    const startBtn = document.getElementById('start-btn');
    if (startBtn) startBtn.remove(); 
    
    const costSummary = document.getElementById('itinerary-cost-summary');
    if (costSummary) costSummary.style.display = 'block';

    let defaultDate = '';
    if (dayCount > 1) {
        const prevInput = document.querySelector(`#day-${dayCount - 1} .day-date-input`);
        if (prevInput && prevInput.value) {
            const prevDate = new Date(prevInput.value);
            prevDate.setDate(prevDate.getDate() + 1);
            defaultDate = prevDate.toISOString().split('T')[0];
        }
    }

    const dayId = `day-${dayCount}`;
    
    // Layout dạng dọc hoàn toàn cố định cho mobile, không flex ngang ngớ ngẩn
    let dayHtml = `
        <div class="day-block" id="${dayId}">
            <div class="day-header" style="display: flex; flex-direction: column; gap: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h3 class="day-title-text" style="margin: 0; color: #0f172a; font-size: 15px;">Day ${dayCount}</h3>
                    <button class="btn-remove-day" onclick="removeDay('${dayId}')" style="background: #fee2e2; color: #b91c1c; border: none; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: bold; cursor: pointer;">🗑️ Remove</button>
                </div>
                <div style="display: flex; flex-direction: column; gap: 6px;">
                    <input type="date" class="day-date-input" value="${defaultDate}" onchange="updateSubsequentDates(${dayCount})" style="padding: 6px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; width: 100%; box-sizing: border-box;">
                    <div style="font-size: 12px; font-weight: bold; color: #64748b; display: flex; align-items: center; gap: 5px;">
                        Starts at: <input type="time" class="day-start-time" step="900" value="${startTime}" onchange="recalculateTime('${dayId}')" style="padding: 6px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; flex-grow: 1;">
                    </div>
                </div>
            </div>
            <div class="dropzone" id="drop-${dayId}" style="min-height: 50px;"></div>
        </div>
    `;
    
    const addNextBtn = document.getElementById('add-next-day-btn');
    if (addNextBtn) {
        addNextBtn.insertAdjacentHTML('beforebegin', dayHtml);
    } else {
        board.innerHTML += dayHtml;
        board.innerHTML += `
            <div class="add-day-btn faded" id="add-next-day-btn" onclick="addMobileNewDay()">
                + Click to add next day
            </div>
        `;
    }

    // Tự động gắn nút Add Location riêng cho mobile ngay dưới dropzone
    setTimeout(() => {
        let dayBlock = document.getElementById(dayId);
        if (dayBlock && !dayBlock.querySelector('.mob-action-buttons')) {
            let dropzone = dayBlock.querySelector('.dropzone');
            let btnHtml = `
                <div class="mob-action-buttons" style="display: flex; gap: 8px; margin-top: 15px; padding-top: 12px; border-top: 1px dashed #e2e8f0;">
                    <button onclick="toggleInlinePicker('${dayId}')" style="flex:1; background: #e0f2fe; color: #0284c7; border: 1px dashed #0284c7; padding: 8px; border-radius: 8px; font-weight: bold; font-size: 12px;">➕ Add Location</button>
                    <button onclick="addBlankCardDirectly('${dayId}')" style="flex:1; background: #f8fafc; color: #475569; border: 1px dashed #94a3b8; padding: 8px; border-radius: 8px; font-weight: bold; font-size: 12px;">➕ Blank Card</button>
                </div>
            `;
            dropzone.insertAdjacentHTML('afterend', btnHtml);
        }
    }, 50);

    bindDropzoneEvents(document.getElementById(`drop-${dayId}`));
}

function removeDay(dayId) {
    const block = document.getElementById(dayId);
    if(block) block.remove();

    const allDays = document.querySelectorAll('.day-block');
    dayCount = 0;
    
    let baseDateStr = null;
    if(allDays.length > 0) {
        const firstInput = allDays[0].querySelector('.day-date-input');
        if(firstInput && firstInput.value) baseDateStr = firstInput.value;
    }

    allDays.forEach((d, index) => {
        dayCount++;
        const newId = `day-${dayCount}`;
        d.id = newId;
        d.querySelector('.day-title-text').innerText = `Day ${dayCount}`;
        d.querySelector('.day-start-time').setAttribute('onchange', `recalculateTime('${newId}')`);
        
        const dropzone = d.querySelector('.dropzone');
        dropzone.id = `drop-${newId}`;
        
        const dateInput = d.querySelector('.day-date-input');
        if (baseDateStr) {
            let newDate = new Date(baseDateStr);
            newDate.setDate(newDate.getDate() + index);
            dateInput.value = newDate.toISOString().split('T')[0];
        }
        dateInput.setAttribute('onchange', `updateSubsequentDates(${dayCount})`);

        // Cập nhật lại onclick cho nút remove đúng ID mới
        const removeBtn = d.querySelector('.btn-remove-day');
        if (removeBtn) removeBtn.setAttribute('onclick', `removeDay('${newId}')`);

        d.querySelectorAll('.duration-input').forEach(inp => {
            inp.setAttribute('onchange', `recalculateTime('${newId}')`);
        });
        
        recalculateTime(newId);
    });

    if (dayCount === 0) {
        initBoard();
    } else {
    }

    // THÊM DÒNG NÀY ĐỂ ÉP RESET TIỀN KHI XÓA NGÀY:
    if (typeof updateCostSummary === 'function') updateCostSummary();
}

function updateSubsequentDates(startDay) {
    const startInput = document.querySelector(`#day-${startDay} .day-date-input`);
    if (!startInput || !startInput.value) return;
    let currentDate = new Date(startInput.value);
    for (let i = startDay + 1; i <= dayCount; i++) {
        currentDate.setDate(currentDate.getDate() + 1);
        const nextInput = document.querySelector(`#day-${i} .day-date-input`);
        if (nextInput) nextInput.value = currentDate.toISOString().split('T')[0];
    }
}

let draggedInternalItem = null;
function handleDragStart(e, item) { draggedInternalItem = item; setTimeout(() => item.classList.add('dragging'), 0); }
function handleDragEnd(e, item) {
    item.classList.remove('dragging');
    draggedInternalItem = null;
    const dropzone = item.closest('.dropzone');
    if (dropzone) { cleanupTransits(dropzone); recalculateTime(dropzone.closest('.day-block').id); }
}
function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.place-item, .custom-item')].filter(el => el !== draggedInternalItem);
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) return { offset: offset, element: child };
        else return closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function bindDropzoneEvents(zone) {
    zone.addEventListener('dragover', e => { 
        e.preventDefault(); zone.classList.add('dragover'); 
        if (draggedInternalItem) {
            const afterElement = getDragAfterElement(zone, e.clientY);
            if (afterElement == null) zone.appendChild(draggedInternalItem);
            else zone.insertBefore(draggedInternalItem, afterElement);
        }
    });
    zone.addEventListener('dragleave', e => zone.classList.remove('dragover'));
    zone.addEventListener('drop', e => {
        e.preventDefault(); zone.classList.remove('dragover');
        if (draggedInternalItem) return; 
        const dataStr = e.dataTransfer.getData('application/json');
        if (dataStr) addPlaceToDay(zone, JSON.parse(dataStr), zone.closest('.day-block').id);
    });
}

const transitTemplate = `
    <div class="timeline-item transit-item">
        <div class="transit-module">
            🚕 <select class="transit-method" onchange="recalculateTime(this.closest('.day-block').id)">
                <option>Taxi / Grab</option>
                <option>Bus / Public Transport</option>
                <option>Walk</option>
            </select>
            <input type="number" class="transit-minutes" value="30" step="5" onchange="recalculateTime(this.closest('.day-block').id)"> mins
            <button class="btn-remove-transit" onclick="removeTransit(this)">Remove</button>
        </div>
    </div>
`;

function removeTransit(btn) {
    const dayId = btn.closest('.day-block').id;
    btn.closest('.transit-item').remove();
    recalculateTime(dayId);
    if (typeof updateCostSummary === 'function') updateCostSummary();
}

function addPlaceToDay(dropzone, placeData, dayId) {
    const wrapper = document.createElement('div');
    const colorClass = placeData.isCustom ? 'card-custom' : `card-${placeData.type}`;
    wrapper.className = placeData.isCustom ? 'timeline-item custom-item' : 'timeline-item place-item';
    wrapper.setAttribute('draggable', 'true');
    wrapper.addEventListener('dragstart', (e) => handleDragStart(e, wrapper));
    wrapper.addEventListener('dragend', (e) => handleDragEnd(e, wrapper));
    wrapper._placeData = placeData;

    if (placeData.isCustom) {
        // Cập nhật lại phần HTML của custom-item trong hàm addPlaceToDay()
        wrapper.innerHTML = `
            <div class="dropped-place ${colorClass}">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <div class="time-badge" style="margin-bottom: 0;">00:00 - 00:00</div>
                    <button class="btn-remove-item" onclick="removeItem(this)" style="background: #fee2e2; color: #b91c1c; border: none; padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; cursor: pointer;">Remove</button>
                </div>
                <div style="flex-grow: 1;">
                    <div class="custom-inputs">
                        <select class="custom-type" style="font-weight:bold; margin-bottom: 6px;" onchange="updateCostSummary()">
                            <option>🏨 Accommodation</option>
                            <option>🍽️ Food & Drink</option>
                            <option>🚙 Transport (Long distance / Car)</option>
                            <option>🎯 Activity/Destination</option>
                        </select>
                        <input type="text" class="custom-title" placeholder="Title (e.g., Hotel Name, Limousine bus to Sapa, ABC Café,...)">
                        
                        <div style="margin-bottom: 5px;">
                            <label style="font-size: 12px; cursor: pointer;">
                                <input type="checkbox" class="overnight-check" onchange="toggleOvernight(this); recalculateTime('${dayId}')"> 
                                🌙 Overnight stay / No duration
                            </label>
                        </div>

                        <div class="duration-wrapper" style="display:flex; gap:10px; align-items:center; margin-bottom:5px;">
                            <label style="font-size:12px;">Duration:</label>
                            <input type="number" class="duration-input" value="60" step="5" onchange="recalculateTime('${dayId}')" style="width:70px;"> mins
                        </div>
                        
                        <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 4px;">
                            <input type="text" class="custom-price" placeholder="Price (e.g. 500000)" oninput="onCustomPriceInput(this)" style="flex: 1; padding: 6px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 13px; box-sizing: border-box;">
                            <select class="custom-currency-select" onchange="onCustomPriceInput(this)" style="width: 80px; padding: 6px 4px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px; background: white; cursor: pointer;">
                                <option value="VND">VND</option>
                                <option value="USD">USD</option>
                            </select>
                        </div>
                        <div class="custom-price-hint" style="font-size: 11px; font-style: italic; color: #64748b; margin-bottom: 5px; min-height: 14px;"></div>

                        <input type="text" class="custom-link" placeholder="Map Link" style="margin-bottom: 6px;">
                        <input type="text" class="custom-note" placeholder="Personal Notes (Booking Ref, Regulations,...)">
                    </div>
                </div>
            </div>
        `;
    } else {
        wrapper.setAttribute('data-city', placeData.city || '');
        let priceDisplayStr = formatPriceDisplay(placeData); // Dùng hàm format chuẩn Min - Max hoặc Free
        
        wrapper.innerHTML = `
            <div class="dropped-place ${colorClass}">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <div class="time-badge" style="margin-bottom: 0;">00:00 - 00:00</div>
                    <button class="btn-remove-item" onclick="removeItem(this)" style="background: #fee2e2; color: #b91c1c; border: none; padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; cursor: pointer;">Remove</button>
                </div>
                <div style="flex-grow: 1;">
                    <h4 class="place-title" style="margin: 0 0 6px 0;">${placeData.name}</h4>
                    <div style="display:flex; align-items:center; gap:5px; margin-top:6px;">
                        <label style="font-size:12px; color:#555;">Duration:</label>
                        <input type="number" class="duration-input" value="${placeData.timeToVisit}" step="5" onchange="recalculateTime('${dayId}')" style="width:60px;"> 
                        <span style="font-size:12px; color:#555;">mins</span>
                        <span class="place-price" data-raw-min="${placeData.price_min || 0}" data-raw-max="${placeData.price_max || 0}" style="font-size:12px; color:#555; margin-left: 10px;">| Price: ${priceDisplayStr}</span>
                    </div>
                    <div style="margin-top: 6px;">
                        <input type="text" class="item-note" placeholder="Personal Note" style="width: 100%; box-sizing: border-box; padding: 4px; font-size: 12px; border: 1px solid #ccc; border-radius: 4px;">
                    </div>
                </div>
            </div>
        `;
    }

    dropzone.appendChild(wrapper);
    cleanupTransits(dropzone);
    recalculateTime(dayId);
    if (typeof updateCostSummary === 'function') updateCostSummary();
}

function toggleOvernight(checkbox) {
    const durationWrapper = checkbox.closest('.custom-inputs').querySelector('.duration-wrapper');
    durationWrapper.style.display = checkbox.checked ? 'none' : 'flex';
}

function removeItem(btn) {
    const dayId = btn.closest('.day-block').id;
    const dropzone = btn.closest('.dropzone');
    btn.closest('.timeline-item').remove();
    cleanupTransits(dropzone); 
    recalculateTime(dayId);
    if (typeof updateCostSummary === 'function') updateCostSummary();
}

function cleanupTransits(dropzone) {
    const children = Array.from(dropzone.children);
    let lastWasPlace = false;
    children.forEach(child => {
        if (child.classList.contains('place-item') || child.classList.contains('custom-item')) {
            if (lastWasPlace) {
                const prev = child.previousElementSibling;
                if (!prev || !prev.classList.contains('transit-item')) {
                    child.insertAdjacentHTML('beforebegin', transitTemplate);
                }
            }
            lastWasPlace = true;
        } else if (child.classList.contains('transit-item')) {
            if (!lastWasPlace) child.remove(); 
            else lastWasPlace = false; 
        }
    });
    if (dropzone.lastElementChild && dropzone.lastElementChild.classList.contains('transit-item')) {
        dropzone.lastElementChild.remove();
    }
}

function recalculateTime(dayId) {
    const dayBlock = document.getElementById(dayId);
    if(!dayBlock) return;
    const startTimeInput = dayBlock.querySelector('.day-start-time').value; 
    let [hours, mins] = startTimeInput.split(':').map(Number);
    let currentTotalMinutes = (hours * 60) + mins;

    const items = dayBlock.querySelectorAll('.timeline-item');
    items.forEach(item => {
        if (item.classList.contains('place-item') || item.classList.contains('custom-item')) {
            let startH = String(Math.floor(currentTotalMinutes / 60)).padStart(2, '0');
            let startM = String(currentTotalMinutes % 60).padStart(2, '0');
            
            const overnightCheck = item.querySelector('.overnight-check');
            const isOvernight = overnightCheck && overnightCheck.checked;

            if (isOvernight) {
                item.querySelector('.time-badge').innerText = `${startH}:${startM} - Overnight 🌙`;
            } else {
                const durationInput = item.querySelector('.duration-input');
                const duration = durationInput ? parseInt(durationInput.value) || 0 : 0;
                currentTotalMinutes += duration;

                let endH = String(Math.floor(currentTotalMinutes / 60)).padStart(2, '0');
                let endM = String(currentTotalMinutes % 60).padStart(2, '0');
                item.querySelector('.time-badge').innerText = `${startH}:${startM} - ${endH}:${endM}`;
            }
        } 
        else if (item.classList.contains('transit-item')) {
            const transitTime = parseInt(item.querySelector('.transit-minutes').value) || 0;
            currentTotalMinutes += transitTime;
        }
    });
}

function savePDF() {
    // Chặn ngay lập tức nếu khách chưa đăng nhập
    if (!currentUser) {
        let wantLogin = confirm("You need to sign in to export the itinerary as a PDF!");
        if (wantLogin) {
            handleAuth();
        }
        return;
    }

    const renderArea = document.getElementById('pdf-render-area');
    const days = document.querySelectorAll('.day-block');
    
    let routeCities = [];
    let citiesSet = new Set();
    days.forEach(day => {
        day.querySelectorAll('.place-item').forEach(item => {
            const city = item.getAttribute('data-city');
            if (city && !citiesSet.has(city)) {
                citiesSet.add(city);
                routeCities.push(city);
            }
        });
    });
    const routeString = routeCities.length > 0 ? routeCities.join(" -> ") : "Custom Itinerary";
    const totalDays = days.length;
    const totalNights = totalDays > 1 ? totalDays - 1 : 0;
    const durationString = totalDays > 0 ? `${totalDays}D${totalNights}N` : "N/A";

    let htmlContent = `
        <div style="padding: 30px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333;">
            <h1 style="text-align: center; color: #0d47a1; margin-bottom: 2px;">Your Vietnam Itinerary</h1>
            <p style="text-align: center; color: #e91e63; margin-top: 0; font-weight: bold; font-size: 14px;">from @vietnam.solotrip</p>
            
            <div style="background: #f8f9fa; border: 1px solid #ddd; padding: 12px; border-radius: 6px; margin-top: 20px; font-size: 14px; line-height: 1.5;">
                <p style="margin: 0 0 5px 0;"><strong>Route:</strong> ${routeString}</p>
                <p style="margin: 0;"><strong>Duration:</strong> ${durationString}</p>
            </div>
    `;

    const arrFrom = document.querySelector('.arr-from') ? document.querySelector('.arr-from').value.toUpperCase() : '';
    const arrTo = document.querySelector('.arr-to') ? document.querySelector('.arr-to').value.toUpperCase() : '';
    const arrDate = document.querySelector('.arr-date') ? document.querySelector('.arr-date').value : '';
    const arrTime = document.querySelector('.arr-time') ? document.querySelector('.arr-time').value : '';
    const arrHr = document.querySelector('.arr-dur-hr') ? document.querySelector('.arr-dur-hr').value : '0';
    const arrMin = document.querySelector('.arr-dur-min') ? document.querySelector('.arr-dur-min').value : '0';
    const arrPnr = document.querySelector('.arr-pnr') ? document.querySelector('.arr-pnr').value : '';
    const arrNote = document.querySelector('.arr-note') ? document.querySelector('.arr-note').value : '';
    const arrHasTransit = document.querySelector('.arr-has-transit') ? document.querySelector('.arr-has-transit').checked : false;
    
    let arrLayoversHtml = '';
    if (arrHasTransit) {
        const layovers = document.querySelectorAll('#arr-layovers-container .layover-item');
        layovers.forEach((lo, index) => {
            const apt = lo.querySelector('.layover-airport').value.toUpperCase();
            const hr = lo.querySelector('.layover-hr').value;
            const min = lo.querySelector('.layover-min').value;
            if(apt || hr > 0 || min > 0) {
                arrLayoversHtml += `<li><strong>Layover ${index + 1}:</strong> At ${apt || 'Unknown'} (${hr} hrs ${min} mins)</li>`;
            }
        });
    }
    
    if (arrFrom || arrTo || arrPnr) {
        htmlContent += `
            <div style="margin-top: 20px; background: #ede7f6; padding: 12px; border-radius: 6px; border-left: 4px solid #673ab7;">
                <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #555; line-height: 1.5;">
                    <li><strong>Date:</strong> ${arrDate ? new Date(arrDate).toLocaleDateString('en-GB') : 'TBD'} | <strong>Time:</strong> ${arrTime}</li>
                    <li><strong>Total Duration:</strong> ${arrHr} hrs ${arrMin} mins</li>
                    ${arrLayoversHtml}
                    ${arrPnr ? `<li><strong>Booking Ref:</strong> ${arrPnr}</li>` : ''}
                    ${arrNote ? `<li><strong>Note:</strong> ${arrNote}</li>` : ''}
                </ul>
            </div>
        `;
    }

    days.forEach(day => {
        const dayTitle = day.querySelector('h3').innerText;
        const dayDate = day.querySelector('.day-date-input').value;
        const dateString = dayDate ? new Date(dayDate).toLocaleDateString('en-GB') : 'TBD';

        htmlContent += `
            <div style="margin-top: 25px; border-bottom: 2px solid #2196f3; padding-bottom: 5px; margin-bottom: 15px;">
                <h2 style="margin: 0; color: #2196f3; font-size: 20px;">${dayTitle} - <span style="color:#555;">${dateString}</span></h2>
            </div>
        `;

        const items = day.querySelectorAll('.timeline-item');
        if(items.length === 0) {
            htmlContent += `<p style="color: #888; font-style: italic;">Free day / No activities planned yet.</p>`;
        }

        items.forEach(item => {
            if (item.classList.contains('transit-item')) {
                const method = item.querySelector('.transit-method').value;
                const time = item.querySelector('.transit-minutes').value;
                htmlContent += `
                    <div style="margin: 8px 0 8px 25px; padding-left: 10px; border-left: 2px dashed #bbb; color: #666; font-size: 13px; font-style: italic;">
                        🚕 Transit: ${method} (${time} mins)
                    </div>
                `;
            } else {
                const timeBadge = item.querySelector('.time-badge').innerText;
                const startTime = timeBadge.split(' - ')[0]; 
                
                let title = "";
                let detailsList = "";

                if (item.classList.contains('custom-item')) {
                    const customType = item.querySelector('.custom-type') ? item.querySelector('.custom-type').value : 'Event';
                    title = item.querySelector('.custom-title').value || customType;
                    const price = item.querySelector('.custom-price').value;
                    const note = item.querySelector('.custom-note').value;
                    const link = item.querySelector('.custom-link').value;
                    
                    detailsList += `<li><strong>Time:</strong> ${timeBadge}</li>`;
                    if (price) detailsList += `<li><strong>Price/Cost:</strong> ${price}</li>`;
                    if (note) detailsList += `<li><strong>Note:</strong> ${note}</li>`;
                    if (link) detailsList += `<li><strong>Booking/Link:</strong> ${link}</li>`;
                } else {
                    title = item.querySelector('.place-title').innerText;
                    const durationText = item.querySelector('.duration-input').value;
                    const priceText = item.querySelector('.place-price').innerText.replace('| Price: ', '');
                    const noteText = item.querySelector('.item-note').value;

                    detailsList += `<li><strong>Time:</strong> ${timeBadge}</li>`;
                    detailsList += `<li><strong>Duration:</strong> ${durationText} mins</li>`;
                    if (priceText && priceText !== 'Free') detailsList += `<li><strong>Price:</strong> ${priceText}</li>`;
                    if (noteText) detailsList += `<li><strong>Note:</strong> ${noteText}</li>`;
                }

                htmlContent += `
                    <div style="margin-bottom: 15px; background: #fafafa; border-radius: 6px; padding: 12px; border-left: 4px solid #4caf50;">
                        <h4 style="margin: 0 0 6px 0; color: #333; font-size: 15px;">
                            <span style="color: #d32f2f;">${startTime}</span> | ${title}
                        </h4>
                        <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #555; line-height: 1.5;">
                            ${detailsList}
                        </ul>
                    </div>
                `;
            }
        });
    });

    const depFrom = document.querySelector('.dep-from') ? document.querySelector('.dep-from').value.toUpperCase() : '';
    const depTo = document.querySelector('.dep-to') ? document.querySelector('.dep-to').value.toUpperCase() : '';
    const depDate = document.querySelector('.dep-date') ? document.querySelector('.dep-date').value : '';
    const depTime = document.querySelector('.dep-time') ? document.querySelector('.dep-time').value : '';
    const depHr = document.querySelector('.dep-dur-hr') ? document.querySelector('.dep-dur-hr').value : '0';
    const depMin = document.querySelector('.dep-dur-min') ? document.querySelector('.dep-dur-min').value : '0';
    const depPnr = document.querySelector('.dep-pnr') ? document.querySelector('.dep-pnr').value : '';
    const depNote = document.querySelector('.dep-note') ? document.querySelector('.dep-note').value : '';
    const depHasTransit = document.querySelector('.dep-has-transit') ? document.querySelector('.dep-has-transit').checked : false;

    let depLayoversHtml = '';
    if (depHasTransit) {
        const layovers = document.querySelectorAll('#dep-layovers-container .layover-item');
        layovers.forEach((lo, index) => {
            const apt = lo.querySelector('.layover-airport').value.toUpperCase();
            const hr = lo.querySelector('.layover-hr').value;
            const min = lo.querySelector('.layover-min').value;
            if(apt || hr > 0 || min > 0) {
                depLayoversHtml += `<li><strong>Layover ${index + 1}:</strong> At ${apt || 'Unknown'} (${hr} hrs ${min} mins)</li>`;
            }
        });
    }

    if (depFrom || depTo || depPnr) {
        htmlContent += `
            <div style="margin-top: 25px; background: #ede7f6; padding: 12px; border-radius: 6px; border-left: 4px solid #673ab7;">
                <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #555; line-height: 1.5;">
                    <li><strong>Date:</strong> ${depDate ? new Date(depDate).toLocaleDateString('en-GB') : 'TBD'} | <strong>Time:</strong> ${depTime}</li>
                    <li><strong>Total Duration:</strong> ${depHr} hrs ${depMin} mins</li>
                    ${depLayoversHtml}
                    ${depPnr ? `<li><strong>Booking Ref:</strong> ${depPnr}</li>` : ''}
                    ${depNote ? `<li><strong>Note:</strong> ${depNote}</li>` : ''}
                </ul>
            </div>
        `;
    }

    htmlContent += `</div>`;
    renderArea.innerHTML = htmlContent;
    renderArea.style.display = 'block';

    html2pdf().set({
        margin: 0.2,
        filename: 'Vietnam_Solo_Trip_Itinerary.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
    }).from(renderArea).save().then(() => {
        renderArea.style.display = 'none';
    });
}

let currentModalPlace = null; // Biến lưu tạm địa điểm đang mở trên modal chi tiết

function showPlaceModal(place) {
    if (!place) return;
    window.currentModalPlace = place; 

    document.getElementById('modal-img').src = place.image || '';
    document.getElementById('modal-title').innerText = place.name || '';
    document.getElementById('modal-address').innerText = place.address ? `📍 ${place.address}` : '';
    document.getElementById('modal-time').innerText = place.timeToVisit || 60;
    document.getElementById('modal-price').innerText = formatPriceDisplay(place);
    
    // Đưa mô tả vào một box cố định chiều cao, bật scroll riêng, đồng thời ghim cứng cụm nút ở đáy modal
    const modalBox = document.querySelector('#place-modal > div');
    if (modalBox) {
        modalBox.style.display = 'flex';
        modalBox.style.flexDirection = 'column';
        modalBox.style.maxHeight = '85vh';
    }

    document.getElementById('modal-desc').innerText = place.description || 'Không có mô tả chi tiết.';
    
    // Cho phần mô tả có khung chứa scroll riêng biệt
    const descElement = document.getElementById('modal-desc');
    descElement.style.maxHeight = '120px';
    descElement.style.overflowY = 'auto';
    descElement.style.paddingRight = '5px';
    descElement.style.background = '#f8f9fa';
    descElement.style.padding = '8px';
    descElement.style.borderRadius = '4px';
    descElement.style.border = '1px solid #e2e8f0';

    document.getElementById('modal-map-btn').innerHTML = `
        <div style="display: flex; gap: 10px; justify-content: flex-end; align-items: center; margin-top: 15px; border-top: 1px solid #eee; padding-top: 12px;">
            <button onclick="addPlaceQuicklyFromModal()" style="background: #0284c7; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 13px;">➕ Add to my Trip</button>
            <a href="${place.mapLink || '#'}" target="_blank" style="background: #f1f5f9; color: #1e293b; padding: 8px 16px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 13px; border: 1px solid #cbd5e1;">🗺️ Open in Google Maps</a>
        </div>
    `;

    document.getElementById('place-modal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('place-modal').style.display = 'none';
}

window.addEventListener('click', (e) => {
    const modal = document.getElementById('place-modal');
    if (e.target === modal) {
        closeModal();
    }
});

// --- PROFILE MANAGEMENT ---
function openProfileModal() {
    document.getElementById('profile-modal').style.display = 'flex';
}

function closeProfileModal() {
    document.getElementById('profile-modal').style.display = 'none';
}

// --- DRAFTS MODAL & MANAGEMENT ---
function openDraftsModal() {
    if (!currentUser) {
        let wantLogin = confirm("Please sign in with Google to view your saved drafts. Would you like to sign in now?");
        if (wantLogin) {
            handleAuth();
        }
        return;
    }
    document.getElementById('drafts-modal').style.display = 'flex';
    fetchUserDrafts();
}

function closeDraftsModal() {
    document.getElementById('drafts-modal').style.display = 'none';
}

async function loadProfileData() {
    loadUserProfile();
}

async function loadUserProfile() {
    if (!currentUser) return;
    document.getElementById('prof-email').value = currentUser.email;

    const { data } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .maybeSingle();

    if (data) {
        document.getElementById('prof-name').value = data.full_name || '';
        document.getElementById('prof-country').value = data.country || '';
        if (data.preference) document.getElementById('prof-pref').value = data.preference;

        // Tách số điện thoại thành mã vùng và số phụ nếu có lưu trên DB dạng "+84 912345678"
        if (data.phone) {
            let parts = data.phone.trim().split(' ');
            if (parts.length >= 2) {
                document.getElementById('prof-country-code').value = parts[0];
                document.getElementById('prof-phone-number').value = parts.slice(1).join(' ');
            } else {
                document.getElementById('prof-phone-number').value = data.phone;
            }
        }
    }
}

async function checkAndEnforceProfileName() {
    if (!currentUser || hasCheckedProfile) return;
    
    const { data } = await supabaseClient
        .from('profiles')
        .select('full_name, phone, country, preference')
        .eq('id', currentUser.id)
        .maybeSingle();

    // Đánh dấu là đã check để không bị lặp lại lần 2 trong phiên này
    hasCheckedProfile = true;

    if (!data || !data.full_name || data.full_name.trim() === '') {
        alert("Welcome! Please enter your full name to complete your profile setup.");
        openProfileModal();
    } else {
        document.getElementById('prof-email').value = currentUser.email;
        document.getElementById('prof-name').value = data.full_name || '';
        document.getElementById('prof-country').value = data.country || '';
        if (data.preference) document.getElementById('prof-pref').value = data.preference;
        if (data.phone) {
            let parts = data.phone.trim().split(' ');
            if (parts.length >= 2) {
                document.getElementById('prof-country-code').value = parts[0];
                document.getElementById('prof-phone-number').value = parts.slice(1).join(' ');
            } else {
                document.getElementById('prof-phone-number').value = data.phone;
            }
        }
    }
}

async function saveProfileInfo() {
    if (!currentUser) return;
    
    let fullName = document.getElementById('prof-name').value.trim();
    if (!fullName) {
        alert("Full name is required!");
        return;
    }

    let countryCode = document.getElementById('prof-country-code').value;
    let phoneNumber = document.getElementById('prof-phone-number').value.trim();

    // Nếu có nhập số điện thoại nhưng country code đang để chữ "phone" hoặc "Country" (chưa chọn)
    if (phoneNumber && (countryCode === 'phone' || countryCode === 'Country' || !countryCode)) {
        alert("Please select a country code for your phone number!");
        return;
    }

    let fullPhone = phoneNumber ? `${countryCode} ${phoneNumber}` : '';

    const profileData = {
        id: currentUser.id,
        email: currentUser.email,
        full_name: fullName,
        phone: fullPhone,
        country: document.getElementById('prof-country').value,
        preference: document.getElementById('prof-pref').value,
        updated_at: new Date()
    };

    const { error } = await supabaseClient.from('profiles').upsert(profileData);
    if (error) {
        alert("Error saving profile: " + error.message);
    } else {
        alert("Profile saved successfully!");
        closeProfileModal();
    }
}

// --- CLOUD SAVE, FETCH & DELETE DRAFTS ---
async function saveToCloud() {
    if (!currentUser) {
        let wantLogin = confirm("Please sign in to save your itinerary draft!");
        if (wantLogin) {
            handleAuth();
        }
        return;
    }

    let autoTitle = `Draft - ${new Date().toLocaleString()}`;

    let daysData = [];
    document.querySelectorAll('.day-block').forEach(dayBlock => {
        let dateVal = dayBlock.querySelector('.day-date-input')?.value || '';
        let timeVal = dayBlock.querySelector('.day-start-time')?.value || '08:00';
        
        let itemsData = [];
        dayBlock.querySelectorAll('.timeline-item').forEach(item => {
            if (item.classList.contains('place-item')) {
                let placeType = 'attraction';
                let droppedPlaceDiv = item.querySelector('.dropped-place');
                if (droppedPlaceDiv) {
                    if (droppedPlaceDiv.classList.contains('card-food')) placeType = 'food';
                    else if (droppedPlaceDiv.classList.contains('card-activity')) placeType = 'activity';
                }

                let priceSpan = item.querySelector('.place-price');
                let rawMin = priceSpan ? parseFloat(priceSpan.getAttribute('data-raw-min')) || 0 : 0;
                let rawMax = priceSpan ? parseFloat(priceSpan.getAttribute('data-raw-max')) || rawMin : rawMin;

                itemsData.push({
                    isCustom: false,
                    city: item.getAttribute('data-city') || '',
                    name: item.querySelector('.place-title')?.innerText || '',
                    timeToVisit: item.querySelector('.duration-input')?.value || 60,
                    price_min: rawMin,
                    price_max: rawMax,
                    price: '', 
                    description: '',
                    note: item.querySelector('.item-note')?.value || '',
                    type: placeType
                });
            } else if (item.classList.contains('custom-item')) {
                itemsData.push({
                    isCustom: true,
                    customType: item.querySelector('.custom-type')?.value || '',
                    title: item.querySelector('.custom-title')?.value || '',
                    isOvernight: item.querySelector('.overnight-check')?.checked || false,
                    duration: item.querySelector('.duration-input')?.value || 60,
                    price: item.querySelector('.custom-price')?.value || '',
                    mapLink: item.querySelector('.custom-link')?.value || '',
                    note: item.querySelector('.custom-note')?.value || ''
                });
            } else if (item.classList.contains('transit-item')) {
                itemsData.push({
                    isTransit: true,
                    method: item.querySelector('.transit-method')?.value || '',
                    minutes: item.querySelector('.transit-minutes')?.value || 30
                });
            }
        });

        daysData.push({
            date: dateVal,
            startTime: timeVal,
            items: itemsData
        });
    });

    const payload = {
        dayCount: dayCount,
        days: daysData
    };

    let queryData = {
        user_id: currentUser.id,
        title: autoTitle,
        data_json: payload,
        updated_at: new Date()
    };

    let result;
    if (currentItineraryId) {
        result = await supabaseClient.from('itineraries').update(queryData).eq('id', currentItineraryId);
    } else {
        result = await supabaseClient.from('itineraries').insert([queryData]).select();
        if (result.data && result.data.length > 0) {
            currentItineraryId = result.data[0].id;
        }
    }

    if (result.error) {
        alert("Failed to save draft: " + result.error.message);
    } else {
        alert("☁️ Itinerary draft saved successfully!"); // Đã hiển thị lại popup thông báo lưu thành công
    }
}
async function fetchUserDrafts() {
    if (!currentUser) return;
    const container = document.getElementById('drafts-list-container');
    container.innerHTML = `<p style="color: #777; font-size: 13px;">Loading your drafts...</p>`;

    const { data, error } = await supabaseClient
        .from('itineraries')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('updated_at', { ascending: false });

    if (error) {
        container.innerHTML = `<p style="color: #d32f2f; font-size: 13px;">Error loading drafts: ${error.message}</p>`;
        return;
    }

    if (!data || data.length === 0) {
        container.innerHTML = `<p style="color: #777; font-size: 13px;">No saved drafts found. Start building one!</p>`;
        return;
    }

    container.innerHTML = '';
    data.forEach(draft => {
        let updateDate = draft.updated_at ? new Date(draft.updated_at).toLocaleString() : 'Just now';
        let draftTitle = draft.title || 'Untitled Itinerary';
        container.innerHTML += `
            <div style="background: #f8f9fa; border: 1px solid #ddd; padding: 12px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <div>
                    <h4 style="margin: 0 0 5px 0; color: #333; font-size: 14px;">${draftTitle}</h4>
                    <p style="margin: 0; font-size: 11px; color: #777;">Last updated: ${updateDate}</p>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button onclick="loadDraftById('${draft.id}')" style="background: #2196f3; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 12px;">Open</button>
                    <button onclick="deleteDraft('${draft.id}')" style="background: #d32f2f; color: white; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 12px;">Delete</button>
                </div>
            </div>
        `;
    });
}

async function deleteDraft(id) {
    if (!confirm("Are you sure you want to delete this draft?")) return;

    const { error } = await supabaseClient
        .from('itineraries')
        .delete()
        .eq('id', id);

    if (error) {
        alert("Failed to delete draft: " + error.message);
    } else {
        if (currentItineraryId === id) {
            currentItineraryId = null;
        }
        // Đã bỏ alert thông báo xoá thành công, chỉ làm mới danh sách luôn
        fetchUserDrafts(); 
    }
}

async function loadDraftById(id) {
    const { data, error } = await supabaseClient
        .from('itineraries')
        .select('*')
        .eq('id', id)
        .single();

    if (error || !data) {
        alert("Could not load selected draft.");
        return;
    }

    currentItineraryId = data.id;
    closeDraftsModal();
    
    document.getElementById('dashboard-selector').style.display = 'none';
    document.getElementById('guest-lock-screen').style.display = 'none';
    document.getElementById('main-app-container').style.display = 'flex';

    const board = document.getElementById('itinerary-board');
    board.innerHTML = '';
    dayCount = 0;

    let payload = data.data_json;
    if (!payload) {
        alert("Draft data is empty.");
        return;
    }

    if (payload.arrival) {
        setTimeout(() => {
            if(document.querySelector('.arr-from')) document.querySelector('.arr-from').value = payload.arrival.from || '';
            if(document.querySelector('.arr-to')) document.querySelector('.arr-to').value = payload.arrival.to || '';
            if(document.querySelector('.arr-date')) document.querySelector('.arr-date').value = payload.arrival.date || '';
            if(document.querySelector('.arr-time')) document.querySelector('.arr-time').value = payload.arrival.time || '08:00';
            if(document.querySelector('.arr-dur-hr')) document.querySelector('.arr-dur-hr').value = payload.arrival.hr || '2';
            if(document.querySelector('.arr-dur-min')) document.querySelector('.arr-dur-min').value = payload.arrival.min || '0';
            if(document.querySelector('.arr-pnr')) document.querySelector('.arr-pnr').value = payload.arrival.pnr || '';
            if(document.querySelector('.arr-note')) document.querySelector('.arr-note').value = payload.arrival.note || '';
        }, 50);
    }

    if (payload.days && Array.isArray(payload.days)) {
        payload.days.forEach((dayData) => {
            addNewDay();
            let currentDayBlock = document.getElementById(`day-${dayCount}`);
            if (currentDayBlock) {
                if (dayData.date && currentDayBlock.querySelector('.day-date-input')) {
                    currentDayBlock.querySelector('.day-date-input').value = dayData.date;
                }
                if (dayData.startTime && currentDayBlock.querySelector('.day-start-time')) {
                    currentDayBlock.querySelector('.day-start-time').value = dayData.startTime;
                }

                let dropzone = currentDayBlock.querySelector('.dropzone');
                if (dayData.items && dropzone) {
                    dayData.items.forEach(item => {
                        if (item.isTransit) {
                            let transitEl = document.createElement('div');
                            transitEl.className = 'timeline-item transit-item';
                            transitEl.innerHTML = `
                                <div class="transit-module">
                                    🚕 <select class="transit-method" onchange="recalculateTime(this.closest('.day-block').id)">
                                        <option ${item.method==='Taxi / Grab'?'selected':''}>Taxi / Grab</option>
                                        <option ${item.method==='Bus / Public Transport'?'selected':''}>Bus / Public Transport</option>
                                        <option ${item.method==='Walk'?'selected':''}>Walk</option>
                                    </select>
                                    <input type="number" class="transit-minutes" value="${item.minutes || 30}" step="5" onchange="recalculateTime(this.closest('.day-block').id)"> mins
                                    <button class="btn-remove-transit" onclick="removeTransit(this)">Remove</button>
                                </div>
                            `;
                            dropzone.appendChild(transitEl);
                        } else if (item.isCustom) {
                            addPlaceToDay(dropzone, { isCustom: true }, currentDayBlock.id);
                            let lastItem = dropzone.lastElementChild;
                            if (lastItem) {
                                if(lastItem.querySelector('.custom-type')) lastItem.querySelector('.custom-type').value = item.customType;
                                if(lastItem.querySelector('.custom-title')) lastItem.querySelector('.custom-title').value = item.title;
                                if(lastItem.querySelector('.overnight-check')) lastItem.querySelector('.overnight-check').checked = item.isOvernight;
                                if(lastItem.querySelector('.duration-input')) lastItem.querySelector('.duration-input').value = item.duration;
                                if(lastItem.querySelector('.custom-price')) lastItem.querySelector('.custom-price').value = item.price;
                                if(lastItem.querySelector('.custom-link')) lastItem.querySelector('.custom-link').value = item.mapLink;
                                if(lastItem.querySelector('.custom-note')) lastItem.querySelector('.custom-note').value = item.note;
                                if(item.isOvernight) toggleOvernight(lastItem.querySelector('.overnight-check'));
                            }
                        } else {
                            addPlaceToDay(dropzone, {
                                isCustom: false,
                                type: item.type || 'attraction',
                                name: item.name,
                                city: item.city,
                                timeToVisit: item.timeToVisit,
                                price_min: item.price_min !== undefined ? item.price_min : (item.price ? parseFloat(item.price.toString().replace(/[^0-9.]/g, '')) || 0 : 0),
                                price_max: item.price_max !== undefined ? item.price_max : (item.price ? parseFloat(item.price.toString().replace(/[^0-9.]/g, '')) || 0 : 0),
                                price: item.price || 'Free',
                                description: ''
                            }, currentDayBlock.id);
                            let lastItem = dropzone.lastElementChild;
                            if(lastItem && item.note) {
                                let noteInp = lastItem.querySelector('.item-note');
                                if(noteInp) noteInp.value = item.note;
                            }
                        }
                    });
                }
                recalculateTime(currentDayBlock.id);
            }
        });
    }

    if (payload.departure) {
        setTimeout(() => {
            if(document.querySelector('.dep-from')) document.querySelector('.dep-from').value = payload.departure.from || '';
            if(document.querySelector('.dep-to')) document.querySelector('.dep-to').value = payload.departure.to || '';
            if(document.querySelector('.dep-date')) document.querySelector('.dep-date').value = payload.departure.date || '';
            if(document.querySelector('.dep-time')) document.querySelector('.dep-time').value = payload.departure.time || '18:00';
            if(document.querySelector('.dep-dur-hr')) document.querySelector('.dep-dur-hr').value = payload.departure.hr || '2';
            if(document.querySelector('.dep-dur-min')) document.querySelector('.dep-dur-min').value = payload.departure.min || '0';
            if(document.querySelector('.dep-pnr')) document.querySelector('.dep-pnr').value = payload.departure.pnr || '';
            if(document.querySelector('.dep-note')) document.querySelector('.dep-note').value = payload.departure.note || '';
        }, 100);
    }
}

// Cấu hình email Admin của mày (Thay email thật của mày vào đây)
const ADMIN_EMAIL = "phong.neu60@gmail.com"; // Hoặc email Google mày hay dùng đăng nhập

// Kiểm tra hiển thị thanh công cụ Admin khi login thành công
function checkAdminPermission() {
    const adminBar = document.getElementById('admin-actions-bar');
    if (!adminBar) return;
    
    if (currentUser && currentUser.email === ADMIN_EMAIL) {
        adminBar.style.display = 'flex'; // Đúng mail admin thì hiện dạng flex ngang
    } else {
        adminBar.style.display = 'none'; // Chưa login hoặc sai mail thì bắt buộc ẩn hẳn
    }
}

function openSampleTripsModal() {
    document.getElementById('sample-trips-modal').style.display = 'flex';
    fetchSampleTrips('All');
}

function closeSampleTripsModal() {
    const modal = document.getElementById('sample-trips-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

async function fetchSampleTrips() {
    const grid = document.getElementById('sample-trips-grid');
    grid.innerHTML = `<p style="color: #777; font-size: 13px;">Loading itineraries...</p>`;

    const { data, error } = await supabaseClient
        .from('itinerary_templates')
        .select('*')
        .order('id', { ascending: false });

    if (error) {
        grid.innerHTML = `<p style="color: #d32f2f; font-size: 13px;">Error loading trips: ${error.message}</p>`;
        return;
    }

    allSampleTrips = data || [];
    renderTagFilterButtons(allSampleTrips);
    filterAndRenderSampleTrips();
}

function filterSampleTrips(duration) {
    // Đổi màu active cho các nút filter
    document.querySelectorAll('.sample-filter-btn').forEach(btn => {
        btn.style.background = '#fff';
        btn.style.color = '#333';
    });
    event.target.style.background = '#333';
    event.target.style.color = '#white';

    fetchSampleTrips(duration);
}

let activeDetailTrip = null;

// Giới hạn mô tả tối đa 3 dòng bằng CSS line-clamp
function renderSampleTripsGrid(trips) {
    const grid = document.getElementById('sample-trips-grid');
    if (!trips || trips.length === 0) {
        grid.innerHTML = `<p style="color: #777; font-size: 13px;">No sample itineraries available.</p>`;
        return;
    }

    grid.innerHTML = '';
    trips.forEach(tpl => {
        let coverImg = tpl.image_url ? tpl.image_url : 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=600&q=80';
        grid.innerHTML += `
            <div onclick="openTourDetail('${tpl.id}')" style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 2px 5px rgba(0,0,0,0.05); cursor: pointer; transition: 0.2s;">
                <img src="${coverImg}" alt="${tpl.title}" style="width: 100%; height: 140px; object-fit: cover;">
                <div style="padding: 12px; display: flex; flex-direction: column; flex-grow: 1;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <h4 style="margin: 0; color: #333; font-size: 14px;">${tpl.title}</h4>
                        <span style="background: #2196f3; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold;">${tpl.duration}</span>
                    </div>
                    <p style="margin: 0; font-size: 11px; color: #666; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis;">${tpl.description || 'Explore Vietnam with this curated route.'}</p>
                </div>
            </div>
        `;
    });
}

function openTourDetail(id) {
    activeDetailTrip = allSampleTrips.find(t => t.id == id);
    if (!activeDetailTrip) return;

    let payload = activeDetailTrip.data_json || {};
    let htmlContent = `
        <h2 style="margin-top: 0; color: #0d47a1; margin-bottom: 5px;">${activeDetailTrip.title}</h2>
        <p style="color: #e91e63; font-weight: bold; font-size: 13px; margin-top: 0;">Duration: ${activeDetailTrip.duration}</p>
        <p style="color: #666; font-size: 13px; margin-bottom: 20px;">${activeDetailTrip.description || ''}</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin-bottom: 15px;">
    `;

    // Render danh sách các ngày và địa điểm bên trong mẫu
    if (payload.days && Array.isArray(payload.days)) {
        payload.days.forEach((day, index) => {
            htmlContent += `
                <div style="background: #f9f9f9; border: 1px solid #ddd; padding: 12px; border-radius: 6px; margin-bottom: 10px;">
                    <h4 style="margin: 0 0 8px 0; color: #2196f3; font-size: 14px;">Day ${index + 1} (${day.date || 'TBD'}) - Starts at: ${day.startTime || '08:00'}</h4>
            `;
            if (day.items && day.items.length > 0) {
                day.items.forEach(item => {
                    if (item.isTransit) {
                        htmlContent += `<div style="font-size: 12px; color: #666; font-style: italic; margin: 4px 0;">🚕 Transit: ${item.method} (${item.minutes} mins)</div>`;
                    } else if (item.isCustom) {
                        htmlContent += `<div style="font-size: 12px; color: #333; margin: 4px 0; padding-left: 10px; border-left: 3px solid #9e9e9e;"><strong>${item.title || item.customType}</strong> (${item.duration} mins)</div>`;
                    } else {
                        htmlContent += `<div style="font-size: 12px; color: #333; margin: 4px 0; padding-left: 10px; border-left: 3px solid #4caf50;"><strong>${item.name}</strong> - ⏱️ ${item.timeToVisit} mins</div>`;
                    }
                });
            } else {
                htmlContent += `<p style="font-size: 12px; color: #888; margin: 0;">Free day</p>`;
            }
            htmlContent += `</div>`;
        });
    }

    document.getElementById('tour-detail-content').innerHTML = htmlContent;
    document.getElementById('tour-detail-modal').style.display = 'flex';
}

function closeTourDetailModal() {
    document.getElementById('tour-detail-modal').style.display = 'none';
}

// Nút 1: Use This Sample (Đem ra workspace chính)
function useCurrentDetailSample() {
    if (!activeDetailTrip) return;
    closeTourDetailModal();
    closeSampleTripsModal();
    useSampleTrip(activeDetailTrip.id);
}

// Nút 2: Save as My Draft (Tự lưu thẳng vào bảng draft của user)
async function saveCurrentDetailAsDraft() {
    if (!currentUser) {
        let wantLogin = confirm("Please sign in with Google to save this sample as your draft!");
        if (wantLogin) handleAuth();
        return;
    }
    if (!activeDetailTrip) return;

    let queryData = {
        user_id: currentUser.id,
        title: `Copy of ${activeDetailTrip.title}`,
        data_json: activeDetailTrip.data_json,
        updated_at: new Date()
    };

    const { error } = await supabaseClient.from('itineraries').insert([queryData]);
    if (error) {
        alert("Failed to save draft: " + error.message);
    } else {
        alert("✨ Successfully saved this sample into your personal drafts!");
    }
}

// Nút 3: Export PDF trực tiếp từ tour mẫu
function exportCurrentDetailPDF() {
    if (!activeDetailTrip) return;
    // Tạm thời load dữ liệu vào workspace ẩn hoặc dùng trực tiếp payload để render PDF
    useCurrentDetailSample();
    setTimeout(() => {
        savePDF();
    }, 500);
}

// Hàm Clone / Đắp dữ liệu mẫu vào workspace của user
async function useSampleTrip(id) {
    const tpl = allSampleTrips.find(t => t.id == id);
    if (!tpl) return;

    let confirmUse = confirm(`Do you want to load "${tpl.title}" into your workspace? Your current unsaved changes will be replaced.`);
    if (!confirmUse) return;

    closeSampleTripsModal();

    // Reset workspace hiện tại
    currentItineraryId = null; // Đặt thành null để khi save nó lưu thành draft mới của user
    document.getElementById('dashboard-selector').style.display = 'none';
    document.getElementById('guest-lock-screen').style.display = 'none';
    document.getElementById('main-app-container').style.display = 'flex';

    const board = document.getElementById('itinerary-board');
    board.innerHTML = '';
    dayCount = 0;

    let payload = tpl.data_json;
    if (!payload) {
        alert("Template data structure is empty.");
        return;
    }

    if (payload.arrival) {
        setTimeout(() => {
            if(document.querySelector('.arr-from')) document.querySelector('.arr-from').value = payload.arrival.from || '';
            if(document.querySelector('.arr-to')) document.querySelector('.arr-to').value = payload.arrival.to || '';
            if(document.querySelector('.arr-date')) document.querySelector('.arr-date').value = payload.arrival.date || '';
            if(document.querySelector('.arr-time')) document.querySelector('.arr-time').value = payload.arrival.time || '08:00';
            if(document.querySelector('.arr-dur-hr')) document.querySelector('.arr-dur-hr').value = payload.arrival.hr || '2';
            if(document.querySelector('.arr-dur-min')) document.querySelector('.arr-dur-min').value = payload.arrival.min || '0';
            if(document.querySelector('.arr-pnr')) document.querySelector('.arr-pnr').value = payload.arrival.pnr || '';
            if(document.querySelector('.arr-note')) document.querySelector('.arr-note').value = payload.arrival.note || '';
        }, 50);
    }

    if (payload.days && Array.isArray(payload.days)) {
        payload.days.forEach((dayData) => {
            addNewDay();
            let currentDayBlock = document.getElementById(`day-${dayCount}`);
            if (currentDayBlock) {
                if (dayData.date && currentDayBlock.querySelector('.day-date-input')) {
                    currentDayBlock.querySelector('.day-date-input').value = dayData.date;
                }
                if (dayData.startTime && currentDayBlock.querySelector('.day-start-time')) {
                    currentDayBlock.querySelector('.day-start-time').value = dayData.startTime;
                }

                let dropzone = currentDayBlock.querySelector('.dropzone');
                if (dayData.items && dropzone) {
                    dayData.items.forEach(item => {
                        if (item.isTransit) {
                            let transitEl = document.createElement('div');
                            transitEl.className = 'timeline-item transit-item';
                            transitEl.innerHTML = `
                                <div class="transit-module">
                                    🚕 <select class="transit-method" onchange="recalculateTime(this.closest('.day-block').id)">
                                        <option ${item.method==='Taxi / Grab'?'selected':''}>Taxi / Grab</option>
                                        <option ${item.method==='Bus / Public Transport'?'selected':''}>Bus / Public Transport</option>
                                        <option ${item.method==='Walk'?'selected':''}>Walk</option>
                                    </select>
                                    <input type="number" class="transit-minutes" value="${item.minutes || 30}" step="5" onchange="recalculateTime(this.closest('.day-block').id)"> mins
                                    <button class="btn-remove-transit" onclick="removeTransit(this)">Remove</button>
                                </div>
                            `;
                            dropzone.appendChild(transitEl);
                        } else if (item.isCustom) {
                            addPlaceToDay(dropzone, { isCustom: true }, currentDayBlock.id);
                            let lastItem = dropzone.lastElementChild;
                            if (lastItem) {
                                if(lastItem.querySelector('.custom-type')) lastItem.querySelector('.custom-type').value = item.customType;
                                if(lastItem.querySelector('.custom-title')) lastItem.querySelector('.custom-title').value = item.title;
                                if(lastItem.querySelector('.overnight-check')) lastItem.querySelector('.overnight-check').checked = item.isOvernight;
                                if(lastItem.querySelector('.duration-input')) lastItem.querySelector('.duration-input').value = item.duration;
                                if(lastItem.querySelector('.custom-price')) lastItem.querySelector('.custom-price').value = item.price;
                                if(lastItem.querySelector('.custom-link')) lastItem.querySelector('.custom-link').value = item.mapLink;
                                if(lastItem.querySelector('.custom-note')) lastItem.querySelector('.custom-note').value = item.note;
                                if(item.isOvernight) toggleOvernight(lastItem.querySelector('.overnight-check'));
                            }
                        } else {
                            addPlaceToDay(dropzone, {
                                isCustom: false,
                                type: item.type || 'attraction',
                                name: item.name,
                                city: item.city,
                                timeToVisit: item.timeToVisit,
                                price_min: item.price_min !== undefined ? item.price_min : (item.price ? parseFloat(item.price.toString().replace(/[^0-9.]/g, '')) || 0 : 0),
                                price_max: item.price_max !== undefined ? item.price_max : (item.price ? parseFloat(item.price.toString().replace(/[^0-9.]/g, '')) || 0 : 0),
                                price: item.price || 'Free',
                                description: ''
                            }, currentDayBlock.id);
                            let lastItem = dropzone.lastElementChild;
                            if(lastItem && item.note) {
                                let noteInp = lastItem.querySelector('.item-note');
                                if(noteInp) noteInp.value = item.note;
                            }
                        }
                    });
                }
                recalculateTime(currentDayBlock.id);
            }
        });
    }

    if (payload.departure) {
        setTimeout(() => {
            if(document.querySelector('.dep-from')) document.querySelector('.dep-from', '') .value = payload.departure.from || '';
            if(document.querySelector('.dep-to')) document.querySelector('.dep-to').value = payload.departure.to || '';
            if(document.querySelector('.dep-date')) document.querySelector('.dep-date').value = payload.departure.date || '';
            if(document.querySelector('.dep-time')) document.querySelector('.dep-time').value = payload.departure.time || '18:00';
            if(document.querySelector('.dep-dur-hr')) document.querySelector('.dep-dur-hr').value = payload.departure.hr || '2';
            if(document.querySelector('.dep-dur-min')) document.querySelector('.dep-dur-min').value = payload.departure.min || '0';
            if(document.querySelector('.dep-pnr')) document.querySelector('.dep-pnr').value = payload.departure.pnr || '';
            if(document.querySelector('.dep-note')) document.querySelector('.dep-note').value = payload.departure.note || '';
        }, 100);
    }

    alert(`Successfully loaded "${tpl.title}". You can now customize and save it as your own draft!`);
}

// --- HỆ THỐNG TAG CHO SAMPLE TRIPS ---
let selectedTagFilter = 'All';

function renderTagFilterButtons(trips) {
    let tagSet = new Set();
    trips.forEach(tpl => {
        if (tpl.tags) {
            tpl.tags.split(' ').forEach(t => {
                let cleanTag = t.trim();
                if (cleanTag.startsWith('#')) tagSet.add(cleanTag);
            });
        }
    });

    const filterContainer = document.getElementById('sample-filter-tags');
    if (!filterContainer) return;

    let html = `<button onclick="filterByTag('All')" style="padding: 5px 10px; border: 1px solid #ccc; background: ${selectedTagFilter === 'All' ? '#333' : '#fff'}; color: ${selectedTagFilter === 'All' ? '#fff' : '#333'}; border-radius: 15px; cursor: pointer; font-size: 11px; font-weight: bold;">All Tags</button>`;
    
    tagSet.forEach(tag => {
        let isActive = selectedTagFilter === tag;
        html += `<button onclick="filterByTag('${tag}')" style="padding: 5px 10px; border: 1px solid #ccc; background: ${isActive ? '#333' : '#fff'}; color: ${isActive ? '#fff' : '#333'}; border-radius: 15px; cursor: pointer; font-size: 11px; font-weight: bold;">${tag}</button>`;
    });

    filterContainer.innerHTML = html;
}

function filterByTag(tag) {
    selectedTagFilter = tag;
    renderTagFilterButtons(allSampleTrips);
    filterAndRenderSampleTrips();
}

function filterAndRenderSampleTrips() {
    let filtered = allSampleTrips;
    if (selectedTagFilter !== 'All') {
        filtered = allSampleTrips.filter(tpl => tpl.tags && tpl.tags.includes(selectedTagFilter));
    }
    renderSampleTripsGrid(filtered);
}

function renderSampleTripsGrid(trips) {
    const grid = document.getElementById('sample-trips-grid');
    if (!trips || trips.length === 0) {
        grid.innerHTML = `<p style="color: #777; font-size: 13px;">No sample itineraries found for this tag.</p>`;
        return;
    }

    grid.innerHTML = '';
    trips.forEach(tpl => {
        let coverImg = tpl.image_url ? tpl.image_url : 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=600&q=80';
        
        let tagsHtml = '';
        if (tpl.tags) {
            tpl.tags.split(' ').forEach(t => {
                if (t.trim().startsWith('#')) {
                    tagsHtml += `<span style="background: #e3f2fd; color: #1565c0; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: bold; margin-right: 4px;">${t.trim()}</span>`;
                }
            });
        }

        grid.innerHTML += `
            <div onclick="openTourDetail('${tpl.id}')" style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 2px 5px rgba(0,0,0,0.05); cursor: pointer; transition: 0.2s;">
                <img src="${coverImg}" alt="${tpl.title}" style="width: 100%; height: 140px; object-fit: cover;">
                <div style="padding: 12px; display: flex; flex-direction: column; flex-grow: 1;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <h4 style="margin: 0; color: #333; font-size: 14px;">${tpl.title}</h4>
                        <span style="background: #2196f3; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold;">${tpl.duration}</span>
                    </div>
                    <div style="margin-bottom: 6px; display: flex; flex-wrap: wrap; gap: 2px;">${tagsHtml}</div>
                    <p style="margin: 0; font-size: 11px; color: #666; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis;">${tpl.description || 'Explore Vietnam with this curated route.'}</p>
                </div>
            </div>
        `;
    });
}

// --- 1. HÀM THÊM NHANH ĐỊA ĐIỂM VÀO NGÀY ĐANG LÀM VIỆC ---
function addPlaceQuickly(encodedPlace) {
    let place = JSON.parse(decodeURIComponent(encodedPlace));
    
    // Tìm ngày cuối cùng hoặc ngày đang có trên bảng để nhét vào
    let dayBlocks = document.querySelectorAll('.day-block');
    let targetDropzone;

    if (dayBlocks.length === 0) {
        // Nếu chưa có ngày nào thì tự động tạo Day 1 mới tinh
        targetDropzone = addNewDay();
    } else {
        // Mặc định ném vào ngày cuối cùng hiện có trên board
        let lastDayBlock = dayBlocks[dayBlocks.length - 1];
        targetDropzone = lastDayBlock.querySelector('.dropzone');
    }

    if (targetDropzone) {
        let dayId = targetDropzone.closest('.day-block').id;
        addPlaceToDay(targetDropzone, place, dayId);
        
        // Thông báo nhẹ hoặc hiệu ứng phản hồi
        alert(`✨ Added "${place.name}" to your itinerary!`);
    }
}

// --- 2. HÀM ĐẢO VỊ TRÍ LÊN / XUỐNG TRONG LỊCH TRÌNH ---
function moveItem(btn, direction) {
    let item = btn.closest('.timeline-item');
    let dropzone = item.closest('.dropzone');
    let dayId = dropzone.closest('.day-block').id;

    if (direction === 'up') {
        let prevItem = item.previousElementSibling;
        // Bỏ qua nếu phía trước là transit item thì lùi lên trên nữa
        if (prevItem && prevItem.classList.contains('transit-item')) {
            prevItem = prevItem.previousElementSibling;
        }
        if (prevItem) {
            dropzone.insertBefore(item, prevItem);
        }
    } else if (direction === 'down') {
        let nextItem = item.nextElementSibling;
        // Bỏ qua nếu phía sau là transit item thì tiến xuống dưới nữa
        if (nextItem && nextItem.classList.contains('transit-item')) {
            nextItem = nextItem.nextElementSibling;
        }
        if (nextItem) {
            dropzone.insertBefore(nextItem, item);
        }
    }

    // Dọn dẹp lại transit và tính lại giờ giấc
    cleanupTransits(dropzone);
    recalculateTime(dayId);
}

// --- 2. MODAL CHỌN NGÀY VÀ XỬ LÝ THÊM NHANH ---
function ensurePlacePickerModalExists() {
    if (document.getElementById('place-picker-modal')) return;
    
    const modalHtml = `
        <div id="place-picker-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); z-index: 3000; justify-content: center; align-items: center;">
            <div style="background: white; width: 350px; max-width: 90%; border-radius: 8px; padding: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); position: relative;">
                <button onclick="closePlacePickerModal()" style="position: absolute; top: 12px; right: 12px; background: none; border: none; font-size: 16px; cursor: pointer; font-weight: bold;">✕</button>
                <h3 style="margin-top: 0; color: #0d47a1; font-size: 16px; margin-bottom: 10px;">Select Day to Add</h3>
                <p id="picker-place-name" style="font-size: 13px; color: #555; margin-bottom: 15px; font-weight: bold;"></p>
                <div id="picker-days-list" style="display: flex; flex-direction: column; gap: 8px; max-height: 200px; overflow-y: auto; margin-bottom: 15px;"></div>
                <button onclick="addNewDayAndAddPlace()" style="width: 100%; background: #f0f2f5; color: #2196f3; border: 1px dashed #2196f3; padding: 8px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 12px;">➕ Add as a New Day</button>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

let pendingPlaceData = null;
window.currentModalPlace = window.currentModalPlace || null;

// Hàm phụ trợ tạo ngày mới và trả về dropzone chuẩn xác
function createAndGetNewDropzone() {
    addNewDay(); 
    let allDayBlocks = document.querySelectorAll('.day-block');
    if (allDayBlocks.length === 0) return null;
    
    let lastBlock = allDayBlocks[allDayBlocks.length - 1];
    let dropzone = lastBlock.querySelector('.dropzone');
    if (!dropzone.id) {
        dropzone.id = `drop-${lastBlock.id}`;
    }
    return { dropzone: dropzone, dayId: lastBlock.id };
}

function addPlaceQuickly(encodedPlace) {
    ensurePlacePickerModalExists();
    pendingPlaceData = JSON.parse(decodeURIComponent(encodedPlace));

    let dayBlocks = document.querySelectorAll('.day-block');
    let listContainer = document.getElementById('picker-days-list');
    listContainer.innerHTML = '';

    // TRƯỜNG HỢP 1: Lịch chưa có ngày nào -> hỏi xác nhận tự tạo Day 1 và add luôn
    if (dayBlocks.length === 0) {
        let confirmAdd = confirm(`You don't have any days in your itinerary yet.\nClick OK to create a new day and add "${pendingPlaceData.name}"!`);
        if (confirmAdd) {
            let res = createAndGetNewDropzone();
            if (res && res.dropzone) {
                addPlaceToDay(res.dropzone, pendingPlaceData, res.dayId);
            }
        }
        return;
    }

    // TRƯỜNG HỢP 2: Đã có ngày -> hiện modal chọn Day
    document.getElementById('picker-place-name').innerText = `📍 ${pendingPlaceData.name}`;

    dayBlocks.forEach((block, index) => {
        let dayNum = index + 1;
        let dayId = block.id;
        let dateInput = block.querySelector('.day-date-input');
        let dateStr = dateInput && dateInput.value ? ` (${dateInput.value})` : '';

        listContainer.innerHTML += `
            <button onclick="confirmAddPlaceToDay('${dayId}', '${dayNum}')" style="background: #e3f2fd; color: #0d47a1; border: 1px solid #bbdefb; padding: 10px; border-radius: 6px; font-weight: bold; cursor: pointer; text-align: left; font-size: 13px;">
                🗓️ Day ${dayNum}${dateStr}
            </button>
        `;
    });

    document.getElementById('place-picker-modal').style.display = 'flex';
}

function addPlaceQuicklyFromModal() {
    if (!window.currentModalPlace) return;
    closeModal();
    addPlaceQuickly(encodeURIComponent(JSON.stringify(window.currentModalPlace)));
}

function closePlacePickerModal() {
    const modal = document.getElementById('place-picker-modal');
    if (modal) modal.style.display = 'none';
}

function confirmAddPlaceToDay(dayId, dayNum) {
    if (!pendingPlaceData) return;
    let dropzone = document.getElementById(`drop-${dayId}`);
    if (dropzone) {
        addPlaceToDay(dropzone, pendingPlaceData, dayId);
    }
    closePlacePickerModal();
}

function addNewDayAndAddPlace() {
    if (!pendingPlaceData) return;
    let res = createAndGetNewDropzone();
    if (res && res.dropzone) {
        addPlaceToDay(res.dropzone, pendingPlaceData, res.dayId);
    }
    closePlacePickerModal();
}

async function openSupportModal() {
    if (!currentUser) {
        let wantLogin = confirm("Please sign in with Google to send a support request!");
        if (wantLogin) handleAuth();
        return;
    }

    // Auto-fill thông tin từ tài khoản hiện tại
    document.getElementById('req-email').value = currentUser.email || '';
    
    // Lấy thêm tên và số điện thoại đã lưu trong bảng profiles nếu có
    const { data: profile } = await supabaseClient
        .from('profiles')
        .select('full_name, phone')
        .eq('id', currentUser.id)
        .maybeSingle();

    if (profile) {
        document.getElementById('req-name').value = profile.full_name || '';
        document.getElementById('req-phone').value = profile.phone || 'N/A';
    } else {
        document.getElementById('req-phone').value = 'N/A';
    }

    document.getElementById('support-modal').style.display = 'flex';
}

function closeSupportModal() {
    document.getElementById('support-modal').style.display = 'none';
}

async function submitSupportRequest() {
    if (!currentUser) return;

    let type = document.getElementById('req-type').value;
    let name = document.getElementById('req-name').value.trim();
    let email = document.getElementById('req-email').value.trim();
    let phone = document.getElementById('req-phone').value.trim();
    let message = document.getElementById('req-message').value.trim();

    if (!name || !email || !phone || !message) {
        alert("Please fill in all required fields!");
        return;
    }

    const { error } = await supabaseClient.from('customer_requests').insert([{
        user_id: currentUser.id,
        name: name,
        email: email,
        phone: phone,
        request_type: type,
        message: message,
        status: 'pending',
        created_at: new Date()
    }]);

    if (error) {
        alert("Failed to submit request: " + error.message);
    } else {
        alert("✨ Your request has been sent successfully! Our team will contact you soon.");
        document.getElementById('req-message').value = '';
        closeSupportModal();
    }
}

// --- 1. TỶ GIÁ VÀ TIỆN ÍCH TIỀN TỆ ---
let currentExchangeRate = 25000; // Giá trị mặc định
let currentCurrencyUnit = 'VND'; // Mặc định ban đầu là VND

// Gọi fetch tỷ giá ngay khi trang khởi động
async function initUserCurrencySettings() {
    if (typeof supabaseClient !== 'undefined') {
        const { data, error } = await supabaseClient.from('settings').select('*').eq('key', 'exchange_rate').maybeSingle();
        if (!error && data && data.value) {
            currentExchangeRate = parseFloat(data.value) || 25000;
        }
    }
}
initUserCurrencySettings();

// Hàm xử lý khi user bấm chọn VND hoặc USD trên giao diện
function switchUserCurrency(unit) {
    currentCurrencyUnit = unit;
    
    // Đổi màu cho 2 nút VND / USD ở menu nổi góc phải
    const vndBtn = document.getElementById('float-curr-vnd');
    const usdBtn = document.getElementById('float-curr-usd');
    
    if (vndBtn && usdBtn) {
        if (unit === 'VND') {
            vndBtn.style.background = '#0f172a';
            vndBtn.style.color = 'white';
            usdBtn.style.background = 'transparent';
            usdBtn.style.color = '#64748b';
        } else {
            usdBtn.style.background = '#0f172a';
            usdBtn.style.color = 'white';
            vndBtn.style.background = 'transparent';
            vndBtn.style.color = '#64748b';
        }
    }

    // Cập nhật lại giá tiền trên modal và toàn bộ card bên ngoài
    const modalPriceEl = document.getElementById('modal-price');
    if (modalPriceEl && typeof currentActivePlace !== 'undefined' && currentActivePlace) {
        modalPriceEl.innerText = formatPriceDisplay(currentActivePlace.price);
    }

    if (typeof applyFilters === 'function') {
        applyFilters();
    }
    if (typeof updateCostSummary === 'function') updateCostSummary();

    // Bổ sung đoạn này vào bên trong hàm switchUserCurrency(unit)
    document.querySelectorAll('.day-block .timeline-item').forEach(item => {
        // 1. Cập nhật card địa điểm chuẩn trong lịch trình
        let priceSpan = item.querySelector('.place-price');
        if (priceSpan) {
            // Lấy lại giá gốc từ thuộc tính hoặc text, ở đây ta gọi format lại dựa vào text hiện tại
            let rawText = priceSpan.getAttribute('data-raw-price') || priceSpan.innerText.replace('| Price: ', '').trim();
            priceSpan.setAttribute('data-raw-price', rawText); // Lưu vết giá gốc
            priceSpan.innerText = `| Price: ${formatPriceDisplay(rawText)}`;
        }
    });

    // Thêm đoạn này vào bên trong hàm switchUserCurrency(unit)
    document.querySelectorAll('.day-block .timeline-item.place-item').forEach(item => {
        let priceSpan = item.querySelector('.place-price');
        if (priceSpan) {
            let min = parseFloat(priceSpan.getAttribute('data-raw-min')) || 0;
            let max = parseFloat(priceSpan.getAttribute('data-raw-max')) || min;
            
            // Tạo lại object giả lập để gọi hàm formatPriceDisplay theo unit mới
            let tempPlace = { price_min: min, price_max: max };
            priceSpan.innerText = `| Price: ${formatPriceDisplay(tempPlace, unit)}`;
        }
    });
}

// --- 2. HÀM FORMAT GIÁ TIỀN (XỬ LÝ MIN - MAX, FREE, SỐ 0) ---
// Thay thế hoặc cập nhật hàm formatPriceDisplay cũ bằng hàm này:
function formatPriceDisplay(place, currency = currentCurrencyUnit) {
    let min = parseFloat(place.price_min) || 0;
    let max = parseFloat(place.price_max) || min;

    if (min === 0 && max === 0) return 'Free';

    let formattedMin = convertSinglePrice(min, currency);
    let formattedMax = convertSinglePrice(max, currency);

    if (min === max || max === 0) {
        return formattedMin;
    }
    return `${formattedMin} - ${formattedMax}`;
}

function convertSinglePrice(numVND, targetCurrency) {
    let num = parseFloat(numVND) || 0;

    if (targetCurrency === 'USD') {
        let valInUSD = num / currentExchangeRate;
        return `$${valInUSD.toFixed(2)}`;
    } else {
        return Math.round(num).toLocaleString('vi-VN') + ' VND';
    }
}

// --- BƯỚC 2: HÀM TÍNH TOÁN VÀ CẬP NHẬT TỔNG CHI PHÍ REAL-TIME ---
function updateCostSummary() {
    let totals = {
        attraction: { min: 0, max: 0 },
        food: { min: 0, max: 0 },
        transit: { min: 0, max: 0 }
    };

    const dayBlocks = document.querySelectorAll('.day-block');
    dayBlocks.forEach(block => {
        const items = block.querySelectorAll('.timeline-item');
        items.forEach(item => {
            // 1. Card địa điểm từ thư viện
            if (item.classList.contains('place-item')) {
                let placeData = item._placeData || {}; // Lưu object place gốc khi drop card vào
                let isFood = placeData.type === 'food';
                
                let min = parseFloat(placeData.price_min) || 0;
                let max = parseFloat(placeData.price_max) || min;

                let target = isFood ? totals.food : totals.attraction;
                target.min += min;
                target.max += max;
            } 
            // 2. Thẻ trống (Custom Card) do user tự nhập
            else if (item.classList.contains('custom-item')) {
                let priceStr = item.querySelector('.custom-price')?.value || '';
                let customType = item.querySelector('.custom-type')?.value || '';
                let currSelect = item.querySelector('.custom-currency-select');
                let itemCurr = currSelect ? currSelect.value : 'VND';
                
                let range = extractPriceRangeRaw(priceStr + ' ' + itemCurr);
                
                if (customType.includes('Food')) {
                    totals.food.min += range.min;
                    totals.food.max += range.max;
                } else if (customType.includes('Transport')) {
                    totals.transit.min += range.min;
                    totals.transit.max += range.max;
                } else {
                    totals.attraction.min += range.min;
                    totals.attraction.max += range.max;
                }
            } 
            // 3. Phần di chuyển (Transit)
            else if (item.classList.contains('transit-item')) {
                let transitInputPrice = item.querySelector('.transit-price');
                let priceStr = transitInputPrice ? transitInputPrice.value : '';
                let range = extractPriceRangeRaw(priceStr);
                totals.transit.min += range.min;
                totals.transit.max += range.max;
            }
        });
    });

    let grandMin = totals.attraction.min + totals.food.min + totals.transit.min;
    let grandMax = totals.attraction.max + totals.food.max + totals.transit.max;

    document.getElementById('cost-sub-attraction').innerText = formatRangeDisplay(totals.attraction.min, totals.attraction.max);
    document.getElementById('cost-sub-food').innerText = formatRangeDisplay(totals.food.min, totals.food.max);
    document.getElementById('cost-sub-transit').innerText = formatRangeDisplay(totals.transit.min, totals.transit.max);
    document.getElementById('cost-total-amount').innerText = formatRangeDisplay(grandMin, grandMax);
}

// Hàm phụ trợ bóc tách khoảng giá thô cho custom card (quy đổi hết về VND gốc)
function extractPriceRangeRaw(str) {
    if (!str) return { min: 0, max: 0 };
    let cleanStr = str.toString().trim();
    let parts = cleanStr.split('-').map(p => parseFloat(p.replace(/[^0-9.]/g, '')) || 0);
    
    let minVal = parts[0] || 0;
    let maxVal = parts.length > 1 ? (parts[1] || minVal) : minVal;
    if (minVal > maxVal) { let t = minVal; minVal = maxVal; maxVal = t; }

    let isUSD = cleanStr.toUpperCase().includes('USD') || (!cleanStr.toUpperCase().includes('VND') && minVal > 0 && minVal < 1000);

    return {
        min: isUSD ? minVal * currentExchangeRate : minVal,
        max: isUSD ? maxVal * currentExchangeRate : maxVal
    };
}

// Hàm hiển thị khoảng giá tổng chi phí
function formatRangeDisplay(min, max) {
    let formattedMin = convertSinglePriceNum(min, currentCurrencyUnit);
    let formattedMax = convertSinglePriceNum(max, currentCurrencyUnit);
    
    if (min === max || max === 0) {
        return formattedMin;
    }
    return `${formattedMin} - ${formattedMax}`;
}

// Hàm format thô để hiển thị tiền theo đúng unit đang chọn
function formatPriceDisplay(place, currency = currentCurrencyUnit) {
    let min = parseFloat(place.price_min) || 0;
    let max = parseFloat(place.price_max) || min;

    if (min === 0 && max === 0) return 'Free'; // Card thường vẫn hiện Free nếu 0đ

    let formattedMin = convertSinglePriceNum(min, currency);
    let formattedMax = convertSinglePriceNum(max, currency);

    if (min === max || max === 0) {
        return formattedMin;
    }
    return `${formattedMin} - ${formattedMax}`;
}

// Hàm chuyển đổi số không bị gí chữ Free
function convertSinglePriceNum(numVND, targetCurrency) {
    let num = parseFloat(numVND) || 0;
    if (targetCurrency === 'USD') {
        let valInUSD = num / currentExchangeRate;
        return `$${valInUSD.toFixed(2)}`;
    } else {
        return Math.round(num).toLocaleString('vi-VN') + ' VND';
    }
}

function onCustomPriceInput(element) {
    let container = element.closest('.custom-inputs');
    let priceInput = container.querySelector('.custom-price');
    let currSelect = container.querySelector('.custom-currency-select');
    let hintDiv = container.querySelector('.custom-price-hint');

    let rawVal = priceInput.value.trim();
    let selectedCurr = currSelect.value;

    if (!rawVal) {
        hintDiv.innerText = '';
        updateCostSummary();
        return;
    }

    let range = extractPriceRange(rawVal + ' ' + selectedCurr);
    
    // Nếu đơn vị chính đang hiển thị ở tổng hệ thống khác với đơn vị user chọn trong thẻ, hoặc cần hiển thị dòng phụ chú chéo
    if (currentCurrencyUnit === 'USD' && selectedCurr === 'VND') {
        // Hệ thống đang USD, thẻ nhập VND -> Hiện dòng phụ chú VND sang USD nhỏ bên dưới
        let converted = formatRangeDisplay(range.min, range.max); // Hàm này tự quy đổi theo currentCurrencyUnit
        hintDiv.innerText = `≈ ${converted}`;
    } else if (currentCurrencyUnit === 'VND' && selectedCurr === 'USD') {
        // Hệ thống đang VND, thẻ nhập USD -> Hiện dòng phụ chú USD sang VND nhỏ bên dưới
        let converted = formatRangeDisplay(range.min, range.max);
        hintDiv.innerText = `≈ ${converted}`;
    } else {
        // Trùng đơn vị hiển thị thì không cần hiện dòng phụ chú nữa
        hintDiv.innerText = '';
    }

    updateCostSummary();
}

function openBlankCardPicker() {
    ensurePlacePickerModalExists();
    // Đánh dấu đây là thẻ custom trống
    pendingPlaceData = { isCustom: true, name: 'Custom Blank Card' };

    let dayBlocks = document.querySelectorAll('.day-block');
    let listContainer = document.getElementById('picker-days-list');
    listContainer.innerHTML = '';

    if (dayBlocks.length === 0) {
        let confirmAdd = confirm(`You don't have any days in your itinerary yet.\nClick OK to create a new day and add a Blank Card!`);
        if (confirmAdd) {
            let res = createAndGetNewDropzone();
            if (res && res.dropzone) {
                addPlaceToDay(res.dropzone, pendingPlaceData, res.dayId);
            }
        }
        return;
    }

    document.getElementById('picker-place-name').innerText = `➕ Add Blank Card to Day`;

    dayBlocks.forEach((block, index) => {
        let dayNum = index + 1;
        let dayId = block.id;
        let dateInput = block.querySelector('.day-date-input');
        let dateStr = dateInput && dateInput.value ? ` (${dateInput.value})` : '';

        listContainer.innerHTML += `
            <button onclick="confirmAddPlaceToDay('${dayId}', '${dayNum}')" style="background: #e3f2fd; color: #0d47a1; border: 1px solid #bbdefb; padding: 10px; border-radius: 6px; font-weight: bold; cursor: pointer; text-align: left; font-size: 13px;">
                🗓️ Day ${dayNum}${dateStr}
            </button>
        `;
    });

    document.getElementById('place-picker-modal').style.display = 'flex';
}

// =========================================================================
// MÃ XỬ LÝ DÀNH RIÊNG CHO GIAO DIỆN MOBILE APP (Hoạt động trên mobile_builder.html)
// =========================================================================

// 1. Logic chuyển đổi giữa 4 Tab chính (Itinerary, Library, Samples, Profile)
function activateMobileTab(tabName) {
    // Ẩn tất cả nội dung tab
    document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
    // Bỏ màu active của tất cả các nút
    document.querySelectorAll('.mob-tab-btn').forEach(btn => btn.classList.remove('active'));

    // Bật tab tương ứng
    const targetTab = document.getElementById(`tab-${tabName}`);
    if (targetTab) targetTab.classList.add('active');

    const targetBtn = document.getElementById(`btn-tab-${tabName}`);
    if (targetBtn) targetBtn.classList.add('active');

    // Chạy các hàm fetch dữ liệu khi vào tab
    if (tabName === 'samples') fetchSampleTrips('All');
    if (tabName === 'profile') {
        renderMobileProfileStatus();
        fetchUserDrafts(); 
    }
}

// 2. Logic Nút ➕ New ở thanh điều hướng đáy
async function mobileActionNewTrip() {
    const hasData = dayCount > 0 || document.querySelectorAll('.timeline-item').length > 0;
    if (hasData) {
        let wantToSave = confirm("Do you want to save the current itinerary draft before creating a new trip?");
        if (wantToSave) await saveToCloud();
    }
    startNewItinerary();
    activateMobileTab('itinerary'); // Nhảy về tab lịch trình
}

// 3. Render giao diện Profile Tab và Ẩn/Hiện Drafts
function renderMobileProfileStatus() {
    const statusBox = document.getElementById('mobile-auth-status');
    if (!statusBox) return;

    if (currentUser) {
        statusBox.innerHTML = `
            <div style="background: white; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; text-align: center; margin-bottom: 20px;">
                <div style="width: 60px; height: 60px; background: #0284c7; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: bold; margin: 0 auto 10px auto;">
                    ${currentUser.email.charAt(0).toUpperCase()}
                </div>
                <p style="margin: 0 0 15px 0; font-size: 14px; font-weight: bold; color: #0f172a;">${currentUser.email}</p>
                <div style="display: flex; gap: 10px; justify-content: center;">
                    <button onclick="openProfileModal()" style="background: #e0f2fe; color: #0284c7; border: 1px solid #bae6fd; padding: 8px 15px; border-radius: 20px; font-weight: bold; font-size: 12px;">Edit Details</button>
                    <button onclick="handleAuth()" style="background: #fee2e2; color: #b91c1c; border: none; padding: 8px 15px; border-radius: 20px; font-weight: bold; font-size: 12px;">Logout</button>
                </div>
            </div>
            
            <h4 style="margin: 0 0 15px 0; color: #0f172a; border-bottom: 1px solid #eee; padding-bottom: 5px;">📂 My Saved Drafts</h4>
            <div id="drafts-list-container" style="display: flex; flex-direction: column; gap: 10px;"></div>
        `;
    } else {
        statusBox.innerHTML = `
            <div style="background: white; padding: 30px 20px; border-radius: 12px; border: 1px solid #e2e8f0; text-align: center;">
                <p style="color: #64748b; font-size: 14px; margin: 0 0 15px 0;">Sign in to view your profile and access cloud drafts.</p>
                <button onclick="handleAuth()" style="background: #10b981; color: white; border: none; padding: 12px 25px; border-radius: 25px; font-weight: bold; font-size: 14px; width: 100%;">Login with Google</button>
            </div>
        `;
    }
}

// 4. KIỂM TRA MÔI TRƯỜNG VÀ GHI ĐÈ HÀM CHO MOBILE APP
if (window.location.pathname.includes('m_itinerary_builder.html')) {
    
    const bottomBar = document.getElementById('mobile-bottom-bar');
    if(bottomBar) bottomBar.style.display = 'flex';

    // Ghi đè addNewDay: Thay vì nút dẫn sang tab Library, ta đổi thành mở Inline Picker tại chỗ
    const originalAddNewDay = window.addNewDay;
    window.addNewDay = function() {
        addMobileNewDay();
        
        let allDays = document.querySelectorAll('.day-block');
        if (allDays.length > 0) {
            let lastDay = allDays[allDays.length - 1];
            let dropzone = lastDay.querySelector('.dropzone');
            
            if (dropzone && !lastDay.querySelector('.mob-action-buttons')) {
                let btnHtml = `
                    <div class="mob-action-buttons" style="display: flex; gap: 8px; margin-top: 15px; padding-top: 15px; border-top: 1px dashed #e2e8f0;">
                        <button onclick="toggleInlinePicker('${lastDay.id}')" style="flex:1; background: #e0f2fe; color: #0284c7; border: 1px dashed #0284c7; padding: 10px; border-radius: 8px; font-weight: bold; font-size: 13px;">➕ Add Location</button>
                        <button onclick="addBlankCardDirectly('${lastDay.id}')" style="flex:1; background: #f8fafc; color: #475569; border: 1px dashed #94a3b8; padding: 10px; border-radius: 8px; font-weight: bold; font-size: 13px;">➕ Blank Card</button>
                    </div>
                `;
                dropzone.insertAdjacentHTML('afterend', btnHtml);
            }
        }
    };

// HÀM 1: Bật/Tắt hộp chọn địa điểm ngay trong ngày (Đã tích hợp đủ Region & City)
    window.toggleInlinePicker = function(dayId) {
        let dayBlock = document.getElementById(dayId);
        if (!dayBlock) return;

        let existingPicker = dayBlock.querySelector('.inline-picker-container');
        if (existingPicker) {
            existingPicker.remove();
            return;
        }

        document.querySelectorAll('.inline-picker-container').forEach(el => el.remove());

        let pickerHtml = `
            <div class="inline-picker-container" id="picker-${dayId}" data-current-type="attraction" data-current-region="All" data-current-city="All">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <strong style="font-size: 13px; color: #0284c7;">Select a Location to Add</strong>
                    <button onclick="document.getElementById('picker-${dayId}').remove()" style="background:none; border:none; font-weight:bold; cursor:pointer; color:#64748b;">✕</button>
                </div>
                <!-- 1. Hàng chọn Loại hình (Locations, F&B, Activities) -->
                <div style="display: flex; gap: 4px; margin-bottom: 6px;">
                    <button onclick="filterInlinePickerType('${dayId}', 'attraction')" class="type-btn active-attraction" style="padding:4px; font-size:11px;">Locations</button>
                    <button onclick="filterInlinePickerType('${dayId}', 'food')" class="type-btn" style="padding:4px; font-size:11px;">F&B</button>
                    <button onclick="filterInlinePickerType('${dayId}', 'activity')" class="type-btn" style="padding:4px; font-size:11px;">Activities</button>
                </div>
                <!-- 2. Hàng chọn Miền (All, North, Central, South) -->
                <div style="display: flex; gap: 4px; margin-bottom: 6px; overflow-x: auto; padding-bottom: 2px;">
                    <button onclick="filterInlinePickerRegion('${dayId}', 'All')" class="picker-reg-btn active-reg" style="padding:3px 8px; border-radius:10px; border:1px solid #cbd5e1; background:#0f172a; color:white; font-size:10px; cursor:pointer; white-space:nowrap;">All</button>
                    <button onclick="filterInlinePickerRegion('${dayId}', 'North')" class="picker-reg-btn" style="padding:3px 8px; border-radius:10px; border:1px solid #cbd5e1; background:white; color:#333; font-size:10px; cursor:pointer; white-space:nowrap;">North</button>
                    <button onclick="filterInlinePickerRegion('${dayId}', 'Central')" class="picker-reg-btn" style="padding:3px 8px; border-radius:10px; border:1px solid #cbd5e1; background:white; color:#333; font-size:10px; cursor:pointer; white-space:nowrap;">Central</button>
                    <button onclick="filterInlinePickerRegion('${dayId}', 'South')" class="picker-reg-btn" style="padding:3px 8px; border-radius:10px; border:1px solid #cbd5e1; background:white; color:#333; font-size:10px; cursor:pointer; white-space:nowrap;">South</button>
                </div>
                <!-- 3. Hàng chọn Thành phố (Tự động sinh theo miền) -->
                <div id="picker-city-container-${dayId}" style="display: flex; gap: 4px; margin-bottom: 8px; overflow-x: auto; padding-bottom: 2px;"></div>
                
                <!-- 4. Ô tìm kiếm theo tên -->
                <input type="text" class="picker-search-input" placeholder="Search location name..." oninput="filterInlinePickerQuery('${dayId}', this.value)">
                
                <!-- 5. Danh sách kết quả -->
                <div class="picker-results-list" id="results-${dayId}"></div>
            </div>
        `;

        let actionDiv = dayBlock.querySelector('.mob-action-buttons');
        actionDiv.insertAdjacentHTML('afterend', pickerHtml);
        
        // Khởi tạo hiển thị thành phố theo mặc định (All Region, All Type)
        updatePickerCityList(dayId, 'All', 'attraction');
        renderInlinePickerResults(dayId);
    };

    // HÀM 2: Lọc theo Loại hình
    window.filterInlinePickerType = function(dayId, type) {
        let picker = document.getElementById(`picker-${dayId}`);
        if (!picker) return;
        picker.setAttribute('data-current-type', type);

        let buttons = picker.querySelectorAll(':scope > div:nth-child(2) .type-btn');
        buttons.forEach(b => {
            b.className = 'type-btn';
            if (b.innerText.toLowerCase().includes(type) || (type === 'attraction' && b.innerText === 'Locations')) {
                if (type === 'attraction') b.classList.add('active-attraction');
                if (type === 'food') b.classList.add('active-food');
                if (type === 'activity') b.classList.add('active-activity');
            }
        });

        let currentReg = picker.getAttribute('data-current-region') || 'All';
        updatePickerCityList(dayId, currentReg, type);
        renderInlinePickerResults(dayId);
    };

    // HÀM 3: Lọc theo Miền (North, Central, South, All)
    window.filterInlinePickerRegion = function(dayId, region) {
        let picker = document.getElementById(`picker-${dayId}`);
        if (!picker) return;
        picker.setAttribute('data-current-region', region);
        picker.setAttribute('data-current-city', 'All'); // Reset city về All khi đổi miền

        picker.querySelectorAll('.picker-reg-btn').forEach(b => {
            b.style.background = 'white';
            b.style.color = '#333';
            b.style.borderColor = '#cbd5e1';
        });
        let activeBtn = event.target;
        activeBtn.style.background = '#0f172a';
        activeBtn.style.color = 'white';
        activeBtn.style.borderColor = '#0f172a';

        let currentType = picker.getAttribute('data-current-type') || 'attraction';
        updatePickerCityList(dayId, region, currentType);
        renderInlinePickerResults(dayId);
    };

    // HÀM 4: Cập nhật danh sách nút Thành phố tương ứng
    window.updatePickerCityList = function(dayId, region, type) {
        let cityContainer = document.getElementById(`picker-city-container-${dayId}`);
        if (!cityContainer) return;

        let filtered = allPlaces.filter(p => p.type === type);
        if (region !== 'All') {
            filtered = filtered.filter(p => p.region === region);
        }
        let cities = [...new Set(filtered.map(p => p.city))].filter(Boolean);

        let html = `<button onclick="filterInlinePickerCity('${dayId}', 'All')" class="picker-city-btn active-city" style="padding:2px 8px; border-radius:10px; border:1px solid #cbd5e1; background:#0f172a; color:white; font-size:10px; cursor:pointer; white-space:nowrap;">All Cities</button>`;
        cities.forEach(city => {
            html += `<button onclick="filterInlinePickerCity('${dayId}', '${city}')" class="picker-city-btn" style="padding:2px 8px; border-radius:10px; border:1px solid #cbd5e1; background:white; color:#333; font-size:10px; cursor:pointer; white-space:nowrap;">${city}</button>`;
        });
        cityContainer.innerHTML = html;
    };

    // HÀM 5: Lọc theo Thành phố cụ thể
    window.filterInlinePickerCity = function(dayId, city) {
        let picker = document.getElementById(`picker-${dayId}`);
        if (!picker) return;
        picker.setAttribute('data-current-city', city);

        picker.querySelectorAll('.picker-city-btn').forEach(b => {
            b.style.background = 'white';
            b.style.color = '#333';
            b.style.borderColor = '#cbd5e1';
        });
        event.target.style.background = '#0f172a';
        event.target.style.color = 'white';
        event.target.style.borderColor = '#0f172a';

        renderInlinePickerResults(dayId);
    };

    // HÀM 6: Lọc theo từ khóa tìm kiếm
    window.filterInlinePickerQuery = function(dayId, query) {
        renderInlinePickerResults(dayId, query);
    };

    // HÀM 7: Tổng hợp điều kiện và Render kết quả ra danh sách
    window.renderInlinePickerResults = function(dayId, searchOverride) {
        let picker = document.getElementById(`picker-${dayId}`);
        if (!picker) return;

        let type = picker.getAttribute('data-current-type') || 'attraction';
        let region = picker.getAttribute('data-current-region') || 'All';
        let city = picker.getAttribute('data-current-city') || 'All';
        let queryInput = picker.querySelector('.picker-search-input').value;
        let query = searchOverride !== undefined ? searchOverride : queryInput;

        let filtered = allPlaces.filter(p => p.type === type);
        if (region !== 'All') filtered = filtered.filter(p => p.region === region);
        if (city !== 'All') filtered = filtered.filter(p => p.city === city);
        if (query && query.trim() !== '') {
            let q = query.toLowerCase();
            filtered = filtered.filter(p => p.name.toLowerCase().includes(q) || (p.city && p.city.toLowerCase().includes(q)));
        }

        let resultsContainer = document.getElementById(`results-${dayId}`);
        if (!resultsContainer) return;

        if (filtered.length === 0) {
            resultsContainer.innerHTML = `<p style="font-size: 11px; color: #64748b; text-align: center; margin: 10px 0;">No locations found.</p>`;
            return;
        }

        let html = '';
        filtered.forEach(place => {
            let safeJson = encodeURIComponent(JSON.stringify(place));
            html += `
                <div class="picker-item-card" onclick="addPlaceFromInlinePicker('${dayId}', '${safeJson}')">
                    <img src="${place.image || ''}" alt="">
                    <div class="picker-item-info">
                        <h5>${place.name}</h5>
                        <p>📍 ${place.city || 'N/A'} | ⏱️ ${place.timeToVisit}m</p>
                    </div>
                </div>
            `;
        });
        resultsContainer.innerHTML = html;
    };

    // HÀM 8: Bấm chọn địa điểm -> Tự add thẳng vào ngày đó và đóng khung chọn
    window.addPlaceFromInlinePicker = function(dayId, encodedPlace) {
        let place = JSON.parse(decodeURIComponent(encodedPlace));
        let dropzone = document.getElementById(`drop-${dayId}`);
        if (dropzone) {
            addPlaceToDay(dropzone, place, dayId);
            let picker = document.getElementById(`picker-${dayId}`);
            if (picker) picker.remove();
        }
    };
}

function checkAndShowMobilePopup() {
    const isSmallScreen = window.innerWidth <= 768;
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    const hasDismissed = sessionStorage.getItem('hideMobilePopup');

    if (isSmallScreen && isTouch && !hasDismissed) {
        const popup = document.getElementById('mobile-suggest-popup');
        // ĐỔI 'block' THÀNH 'flex' ĐỂ NÓ CĂN GIỮA NHÉ
        if (popup) popup.style.display = 'flex'; 
    }
}

function dismissMobilePopup() {
    document.getElementById('mobile-suggest-popup').style.display = 'none';
    sessionStorage.setItem('hideMobilePopup', 'true');
}

window.addEventListener('DOMContentLoaded', checkAndShowMobilePopup);