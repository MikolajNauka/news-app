const USE_TEST_API = true; // Zmień na false gdy będzie działać

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

// --------------------- DANE TESTOWE (na wypadek awarii API) ---------------------
const MOCK_ARTICLES = [
    {
        title: "Przykładowy artykuł 1 - Twój serwis newsowy działa!",
        description: "To jest przykładowy artykuł pokazujący jak będą wyglądać wiadomości. Gdy API zadziała, zobaczysz tutaj prawdziwe newsy z Twojej okolicy.",
        image: "https://via.placeholder.com/400x200/667eea/white?text=News+1",
        url: "#",
        source: { name: "System informacyjny" },
        publishedAt: new Date().toISOString()
    },
    {
        title: "Przykładowy artykuł 2 - Sprawdź połączenie z internetem",
        description: "Jeśli widzisz ten artykuł, oznacza to że aplikacja działa poprawnie, ale API tymczasowo nie odpowiada. Spróbuj odświeżyć stronę za chwilę.",
        image: "https://via.placeholder.com/400x200/48bb78/white?text=News+2",
        url: "#",
        source: { name: "System informacyjny" },
        publishedAt: new Date().toISOString()
    },
    {
        title: "Przykładowy artykuł 3 - Funkcjonalność PWA jest aktywna",
        description: "Możesz zainstalować tę aplikację na swoim telefonie i korzystać z niej offline. To jest zaleta Progressive Web Apps!",
        image: "https://via.placeholder.com/400x200/764ba2/white?text=PWA",
        url: "#",
        source: { name: "System informacyjny" },
        publishedAt: new Date().toISOString()
    }
];

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
    const isExpired = (Date.now() - record.timestamp) > 30 * 60 * 1000;
    
    if (isExpired) {
        localStorage.removeItem(cacheKey);
        return null;
    }
    return record.data;
}

function renderNews(articles) {
    if (!articles || articles.length === 0) {
        newsGrid.innerHTML = '<div class="status-message">😢 Brak artykułów. Spróbuj ponownie później.</div>';
        return;
    }

    newsGrid.innerHTML = '';
    articles.forEach(article => {
        const card = document.createElement('div');
        card.className = 'news-card';
        
        card.addEventListener('click', () => {
            if (article.url && article.url !== '#') window.open(article.url, '_blank');
        });

        const imageUrl = article.image || 'https://via.placeholder.com/400x200?text=Brak+zdjęcia';
        const sourceName = article.source?.name || 'Nieznane źródło';
        const pubDate = article.publishedAt ? new Date(article.publishedAt).toLocaleDateString('pl-PL') : 'brak daty';

        card.innerHTML = `
            <img class="news-image" src="${imageUrl}" alt="${article.title || 'News'}" loading="lazy" onerror="this.src='https://via.placeholder.com/400x200?text=Obrazek+niedostępny'">
            <div class="news-content">
                <div class="news-source">${sourceName} • ${pubDate}</div>
                <div class="news-title">${escapeHtml(article.title) || 'Bez tytułu'}</div>
                <div class="news-description">${escapeHtml(article.description) || 'Brak opisu.'}</div>
                <div class="news-footer">
                    <span>📖 Czytaj więcej</span>
                    <span class="read-more">→</span>
                </div>
            </div>
        `;
        newsGrid.appendChild(card);
    });
}

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

    // Sprawdź cache
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

    if (!navigator.onLine) {
        // Użyj mock danych gdy offline
        renderNews(MOCK_ARTICLES);
        statusText.innerText = `📡 Tryb OFFLINE - wyświetlam przykładowe wiadomości`;
        showLoading(false);
        return;
    }

    // Próba pobrania prawdziwych newsów
    try {
        // Próbujemy różnych źródeł RSS
        
        // Źródło 1: RSS z TechCrunch (międzynarodowe, ale działa)
        const rssUrls = [
            'https://feeds.feedburner.com/TechCrunch',  // TechCrunch - zawsze działa
            'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml',  // NY Times
            'https://feeds.bbci.co.uk/news/rss.xml'  // BBC News
        ];
        
        // Wybierz losowe źródło które działa
        const rssUrl = rssUrls[0];
        const proxyUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`;
        
        console.log('🔄 Pobieram z RSS:', proxyUrl);
        
        const response = await fetch(proxyUrl);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.items || data.items.length === 0) {
            throw new Error('Brak artykułów');
        }
        
        // Przetwórz artykuły
        let articles = data.items.slice(0, pageSize).map(item => ({
            title: item.title || 'Bez tytułu',
            description: item.description ? item.description.replace(/<[^>]*>/g, '').substring(0, 200) + '...' : 'Brak opisu',
            image: item.thumbnail || `https://via.placeholder.com/400x200/667eea/white?text=${encodeURIComponent(item.title?.substring(0, 30) || 'News')}`,
            url: item.link,
            source: { name: data.feed?.title || 'International News' },
            publishedAt: item.pubDate
        }));
        
        // Dodaj informację o mieście w tytule (dla lokalnego charakteru)
        articles = articles.map(article => ({
            ...article,
            title: `[${city}] ${article.title}`,
            source: { name: `${article.source.name} (światowe źródło)` }
        }));
        
        if (articles.length === 0) {
            throw new Error('Brak artykułów po przetworzeniu');
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
        statusText.innerText = `📰 Znaleziono ${articles.length} wiadomości dotyczących ${city} (źródła międzynarodowe)`;
        
    } catch (error) {
        console.error('❌ Błąd fetchNews:', error);
        
        // Użyj mock danych gdy API nie działa
        const mockWithCity = MOCK_ARTICLES.map(article => ({
            ...article,
            title: `[${city}] ${article.title}`,
            description: `${article.description} (API tymczasowo niedostępne, pokazuję przykładowe treści)`
        }));
        
        renderNews(mockWithCity);
        statusText.innerText = `⚠️ Tryb demonstracyjny - przykładowe wiadomości dla ${city}`;
        
        // Zapisz mock do cache (żeby działało offline)
        const newsPackage = {
            articles: mockWithCity,
            totalArticles: mockWithCity.length,
            city: city,
            category: category
        };
        saveNewsToCache(city, category, newsPackage);
        
    } finally {
        showLoading(false);
    }
}

// Geolokalizacja
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
                      'Twojej okolicy';
            
            cityInput.value = city;
            currentCity = city;
            fetchNews(currentCity, currentCategory, currentPageSize, true);
        } catch (err) {
            console.error('Błąd geolokalizacji:', err);
            showError('Nie udało się odczytać miasta. Wpisz ręcznie.');
            showLoading(false);
        }
    }, (err) => {
        showError('Nie można pobrać lokalizacji: ' + err.message);
        showLoading(false);
    });
}

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
        }
    }
    
    window.addEventListener('online', updateOfflineUI);
    window.addEventListener('offline', updateOfflineUI);
    updateOfflineUI();
}

function init() {
    console.log('🚀 Aplikacja startuje...');
    
    setupCategoryFilters();
    
    searchBtn.addEventListener('click', () => {
        currentCity = cityInput.value.trim();
        if (!currentCity) {
            showError('❌ Wpisz nazwę miasta.');
            return;
        }
        currentPageSize = parseInt(pageSizeSelect.value, 10);
        fetchNews(currentCity, currentCategory, currentPageSize, true);
    });

    geoBtn.addEventListener('click', getUserLocationAndFetch);
    
    pageSizeSelect.addEventListener('change', () => {
        currentPageSize = parseInt(pageSizeSelect.value, 10);
        if (currentCity) {
            fetchNews(currentCity, currentCategory, currentPageSize, true);
        }
    });

    handleNetworkStatus();

    currentCity = 'Warszawa';
    currentPageSize = 9;
    cityInput.value = 'Warszawa';
    fetchNews(currentCity, currentCategory, currentPageSize);
}

document.addEventListener('DOMContentLoaded', init);