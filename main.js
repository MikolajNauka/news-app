const BASE_URL = 'https://api.rss2json.com/v1/api.json';

// Polskie źródła RSS 
const POLISH_RSS_FEEDS = {
    general: 'https://www.pap.pl/feed/',
    technology: 'https://www.spidersweb.pl/feed',
    sports: 'https://sportowefakty.wp.pl/feed',
    business: 'https://www.bankier.pl/rss/wiadomosci.xml',
    health: 'https://www.medonet.pl/rss',
    science: 'https://www.national-geographic.pl/feed'
};

// Zmienne stanu aplikacji
let currentCity = 'Warszawa';
let currentCategory = 'general';
let currentPageSize = 9;
let isLoading = false;

// Elementy DOM
const cityInput = document.getElementById('cityInput');
const pageSizeSelect = document.getElementById('pageSizeSelect');
const searchBtn = document.getElementById('searchBtn');
const geoBtn = document.getElementById('geoBtn');
const categoryContainer = document.getElementById('categoryContainer');
const newsGrid = document.getElementById('newsGrid');
const statusArea = document.getElementById('statusArea');
const statusText = document.getElementById('statusText');
const loadingSpinner = document.getElementById('loadingSpinner');
const offlineBanner = document.getElementById('offlineBanner');

// --------------------- FUNKCJE POMOCNICZE ---------------------
function showLoading(show) {
    isLoading = show;
    if (show) {
        loadingSpinner.style.display = 'inline-block';
        statusText.innerText = 'Ładowanie najświeższych wiadomości... 🚀';
        newsGrid.innerHTML = '';
        statusArea.style.display = 'block';
    } else {
        loadingSpinner.style.display = 'none';
    }
}

function showError(message) {
    statusText.innerText = message;
    newsGrid.innerHTML = '';
    statusArea.style.display = 'block';
    loadingSpinner.style.display = 'none';
    isLoading = false;
}

function clearStatusMessage() {
    statusArea.style.display = 'block';
    statusText.innerText = '';
}

// Zapis i odczyt z localStorage (dla trybu offline / PWA)
function saveNewsToCache(city, category, newsData) {
    const cacheKey = `news_${city}_${category}`;
    const cacheRecord = {
        timestamp: Date.now(),
        data: newsData,
        city: city,
        category: category
    };
    localStorage.setItem(cacheKey, JSON.stringify(cacheRecord));
}

function getNewsFromCache(city, category) {
    const cacheKey = `news_${city}_${category}`;
    const cached = localStorage.getItem(cacheKey);
    if (!cached) return null;
    
    const record = JSON.parse(cached);
    // Cache wygasa po 30 minutach (1800000 ms)
    const isExpired = (Date.now() - record.timestamp) > 30 * 60 * 1000;
    
    if (isExpired) {
        localStorage.removeItem(cacheKey);
        return null;
    }
    return record.data;
}

// Renderowanie kart newsów
function renderNews(articles) {
    if (!articles || articles.length === 0) {
        newsGrid.innerHTML = '<div class="status-message">😢 Brak artykułów dla tego miasta i kategorii. Spróbuj innego miasta lub kategorii.</div>';
        return;
    }

    newsGrid.innerHTML = '';
    articles.forEach(article => {
        const card = document.createElement('div');
        card.className = 'news-card';
        
        // Kliknięcie otwiera artykuł w nowej karcie
        card.addEventListener('click', () => {
            if (article.url) window.open(article.url, '_blank');
        });

        // Obrazek lub placeholder
        const imageUrl = article.image || 'https://via.placeholder.com/400x200?text=Brak+zdjęcia';
        const sourceName = article.source?.name || 'Nieznane źródło';
        const pubDate = article.publishedAt ? new Date(article.publishedAt).toLocaleDateString('pl-PL') : 'brak daty';

        card.innerHTML = `
            <img class="news-image" src="${imageUrl}" alt="${article.title || 'News'}" loading="lazy" onerror="this.src='https://via.placeholder.com/400x200?text=Obrazek+niedostępny'">
            <div class="news-content">
                <div class="news-source">${sourceName} • ${pubDate}</div>
                <div class="news-title">${escapeHtml(article.title) || 'Bez tytułu'}</div>
                <div class="news-description">${escapeHtml(article.description) || 'Brak opisu. Kliknij, aby przeczytać cały artykuł.'}</div>
                <div class="news-footer">
                    <span>📖 Czytaj więcej</span>
                    <span class="read-more">→</span>
                </div>
            </div>
        `;
        newsGrid.appendChild(card);
    });
}

// Funkcja do bezpiecznego escape'owania HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Główna funkcja pobierania newsów
async function fetchNews(city, category, pageSize = 9, forceRefresh = false) {
    if (!city.trim()) {
        showError('❌ Wpisz nazwę miasta!');
        return;
    }

    clearStatusMessage();
    showLoading(true);

    // 1. Spróbuj pobrać z cache jeśli nie forceRefresh
    if (!forceRefresh && navigator.onLine !== false) {
        const cachedData = getNewsFromCache(city, category);
        if (cachedData && cachedData.articles && cachedData.articles.length > 0) {
            console.log('📦 Używam cache dla:', city, category);
            renderNews(cachedData.articles);
            showLoading(false);
            statusText.innerText = `📰 ${cachedData.articles.length} wiadomości z ${city} (z pamięci podręcznej)`;
            return;
        }
    }

    // 2. Jeśli offline i brak cache - komunikat
    if (!navigator.onLine) {
        showError('🌐 Brak połączenia z internetem i brak zapisanych wiadomości dla tego miasta. Połącz się z siecią.');
        showLoading(false);
        return;
    }

    // 3. Pobieranie z RSS API (działa bez CORS)
    try {
        // Wybierz odpowiedni RSS feed dla kategorii
        let rssUrl = POLISH_RSS_FEEDS[category] || POLISH_RSS_FEEDS.general;
        
        // Dla kategorii 'general' używajmy PAP
        if (category === 'general') {
            rssUrl = POLISH_RSS_FEEDS.general;
        }
        
        const url = `${BASE_URL}?rss_url=${encodeURIComponent(rssUrl)}`;
        console.log('🔄 Pobieram z RSS:', url);
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.items || data.items.length === 0) {
            throw new Error('Brak artykułów z RSS');
        }
        
        // Przetwórz artykuły do naszego formatu
        let articles = data.items.slice(0, pageSize).map(item => ({
            title: item.title || 'Bez tytułu',
            description: item.description ? item.description.replace(/<[^>]*>/g, '').substring(0, 200) + '...' : 'Brak opisu',
            image: item.thumbnail || 'https://via.placeholder.com/400x200?text=Brak+zdjęcia',
            url: item.link,
            source: { name: data.feed?.title || 'Polskie media' },
            publishedAt: item.pubDate
        }));
        
        // Jeśli nie ma artykułów, spróbuj z innym feedem
        if (articles.length === 0 && category !== 'general') {
            console.log('Brak artykułów z kategorii, próbuję z general...');
            const fallbackUrl = `${BASE_URL}?rss_url=${encodeURIComponent(POLISH_RSS_FEEDS.general)}`;
            const fallbackResponse = await fetch(fallbackUrl);
            const fallbackData = await fallbackResponse.json();
            articles = fallbackData.items.slice(0, pageSize).map(item => ({
                title: item.title,
                description: item.description ? item.description.replace(/<[^>]*>/g, '').substring(0, 200) + '...' : 'Brak opisu',
                image: item.thumbnail || 'https://via.placeholder.com/400x200',
                url: item.link,
                source: { name: fallbackData.feed?.title || 'Polskie media' },
                publishedAt: item.pubDate
            }));
        }
        
        if (articles.length === 0) {
            showError(`😢 Brak wiadomości dla "${city}". Spróbuj ponownie później.`);
            showLoading(false);
            return;
        }
        
        // Zapisz do cache
        const newsPackage = {
            articles: articles,
            totalArticles: articles.length,
            city: city,
            category: category
        };
        saveNewsToCache(city, category, newsPackage);
        
        renderNews(articles);
        statusText.innerText = `📰 Znaleziono ${articles.length} wiadomości z Polski ${category !== 'general' ? `(kategoria: ${category})` : ''}`;
        
    } catch (error) {
        console.error('❌ Błąd fetchNews:', error);
        
        // Próba odczytania z cache nawet jeśli wygasł (awaryjnie)
        const expiredCache = localStorage.getItem(`news_${city}_${category}`);
        if (expiredCache) {
            const oldRecord = JSON.parse(expiredCache);
            if (oldRecord.data && oldRecord.data.articles && oldRecord.data.articles.length > 0) {
                renderNews(oldRecord.data.articles);
                statusText.innerText = `⚠️ Tryb awaryjny: starsze wiadomości (${new Date(oldRecord.timestamp).toLocaleTimeString()})`;
                showLoading(false);
                return;
            }
        }
        
        showError(`Nie udało się pobrać newsów: ${error.message}. Spróbuj odświeżyć stronę.`);
    } finally {
        showLoading(false);
    }
}

// Geolokalizacja (dla "moja okolica")
function getUserLocationAndFetch() {
    if (!navigator.geolocation) {
        showError('Twoja przeglądarka nie wspiera geolokalizacji.');
        return;
    }
    
    statusText.innerText = '📍 Pobieranie lokalizacji...';
    showLoading(true);
    
    navigator.geolocation.getCurrentPosition(async (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        
        try {
            const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=pl`);
            const geoData = await geoRes.json();
            
            let city = geoData.address?.city || 
                      geoData.address?.town || 
                      geoData.address?.village || 
                      geoData.address?.county || 
                      'Warszawa';
            
            cityInput.value = city;
            currentCity = city;
            fetchNews(currentCity, currentCategory, currentPageSize, true);
        } catch (err) {
            console.error('Błąd geolokalizacji:', err);
            showError('Nie udało się odczytać miasta z lokalizacji. Wpisz ręcznie.');
            showLoading(false);
        }
    }, (err) => {
        showError('Nie można pobrać lokalizacji: ' + err.message);
        showLoading(false);
    });
}

// Obsługa filtrów kategorii
function setupCategoryFilters() {
    const chips = document.querySelectorAll('.category-chip');
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            chips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentCategory = chip.getAttribute('data-category');
            fetchNews(currentCity, currentCategory, currentPageSize, true);
        });
    });
}

// Obsługa PWA: wykryj zmianę online/offline
function handleNetworkStatus() {
    function updateOfflineUI() {
        if (!navigator.onLine) {
            offlineBanner.style.display = 'block';
            if (!isLoading && currentCity) {
                const cachedData = getNewsFromCache(currentCity, currentCategory);
                if (cachedData && cachedData.articles) {
                    renderNews(cachedData.articles);
                    statusText.innerText = `📡 Tryb OFFLINE – wyświetlam zapisane newsy dla ${currentCity}`;
                }
            }
        } else {
            offlineBanner.style.display = 'none';
            if (currentCity) {
                fetchNews(currentCity, currentCategory, currentPageSize, true);
            }
        }
    }
    
    window.addEventListener('online', updateOfflineUI);
    window.addEventListener('offline', updateOfflineUI);
    updateOfflineUI();
}

// Inicjalizacja i eventy
function init() {
    console.log('🚀 Aplikacja startuje...');
    
    setupCategoryFilters();
    
    // Przycisk wyszukiwania
    searchBtn.addEventListener('click', () => {
        currentCity = cityInput.value.trim();
        if (!currentCity) {
            showError('❌ Wpisz nazwę miasta.');
            return;
        }
        currentPageSize = parseInt(pageSizeSelect.value, 10);
        fetchNews(currentCity, currentCategory, currentPageSize, true);
    });

    // Przycisk geolokalizacji
    geoBtn.addEventListener('click', getUserLocationAndFetch);
    
    // Zmiana ilości artykułów
    pageSizeSelect.addEventListener('change', () => {
        currentPageSize = parseInt(pageSizeSelect.value, 10);
        if (currentCity) {
            fetchNews(currentCity, currentCategory, currentPageSize, true);
        }
    });

    // Obsługa statusu sieci (PWA offline)
    handleNetworkStatus();

    // Domyślne ładowanie
    currentCity = 'Warszawa';
    currentPageSize = 9;
    cityInput.value = 'Warszawa';
    fetchNews(currentCity, currentCategory, currentPageSize);
}

// Uruchom aplikację gdy DOM jest gotowy
document.addEventListener('DOMContentLoaded', init);