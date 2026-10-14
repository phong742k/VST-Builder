// --- 1. LOGIC CHUYỂN TAB ---
function switchTab(tabId) {
    // Ẩn tất cả các tab
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Hiện tab được chọn
    document.getElementById(`tab-${tabId}`).classList.add('active');
}

// --- 2. LOGIC RENDER BÀI VIẾT (Tương lai sẽ gọi từ Supabase) ---
// Giả lập dữ liệu trả về từ database của Admin
const mockPosts = [
    {
        title: "Tối ưu hóa năng lượng cho khách sạn quy mô nhỏ",
        category: "Tổ chức",
        summary: "Các bước thực tế để giảm thiểu rác thải và tiết kiệm điện nước dành cho homestay và boutique hotel.",
        imageUrl: "https://images.unsplash.com/photo-1596436889106-be35e843f974" // Ảnh minh họa
    },
    {
        title: "Làm sao để du lịch tự túc không để lại dấu chân carbon?",
        category: "Khách du lịch",
        summary: "Cẩm nang chọn phương tiện di chuyển và nơi lưu trú thân thiện với môi trường khi đi solo trip.",
        imageUrl: "https://images.unsplash.com/photo-1542601906990-b4d3fb778b09"
    },
    {
        title: "Xây dựng lối sống xanh từ những thói quen xê dịch",
        category: "Cá nhân",
        summary: "Góc nhìn từ founder VST Builder về việc biến du lịch bền vững thành phong cách sống thường ngày.",
        imageUrl: "https://images.unsplash.com/photo-1501504905252-473c47e087f8"
    }
];

// Hàm in bài viết ra màn hình
function renderNews() {
    const newsGrid = document.getElementById('news-grid');
    let htmlContent = '';

    mockPosts.forEach(post => {
        htmlContent += `
            <div class="card">
                <img src="${post.imageUrl}" alt="Cover" class="card-img">
                <div class="card-content">
                    <span class="badge">${post.category}</span>
                    <h3>${post.title}</h3>
                    <p>${post.summary}</p>
                </div>
            </div>
        `;
    });

    newsGrid.innerHTML = htmlContent;
}

// Chạy hàm render khi web vừa load xong
window.onload = renderNews;