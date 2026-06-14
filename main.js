// --------------------- KONFIGURACJA -------------------------
// Używamy Google News RSS z zapytaniem o miasto
const RSS2JSON_API = 'https://api.rss2json.com/v1/api.json';

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
        statusText.innerText = 'Ładowanie wiadomości... 🚀';
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
        newsGrid.innerHTML = '<div class="status-message">😢 Brak artykułów dla tego miasta. Spróbuj innego.</div>';
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

// GŁÓWNA FUNKCJA - Google News z filtrowaniem po mieście
// GŁÓWNA FUNKCJA - Google News z pobieraniem obrazków z oryginalnych stron
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
            console.log('📦 Używam cache dla:', city);
            renderNews(cachedData.articles);
            showLoading(false);
            statusText.innerText = `📰 ${cachedData.articles.length} wiadomości z ${city} (z pamięci)`;
            return;
        }
    }

    if (!navigator.onLine) {
        showError('🌐 Brak połączenia. Połącz się z internetem.');
        showLoading(false);
        return;
    }

    try {
        // 1. Pobierz listę artykułów z Google News RSS
        const query = `${city} Polska`;
        const googleRssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=pl&gl=PL&ceid=PL:pl`;
        const url = `${RSS2JSON_API}?rss_url=${encodeURIComponent(googleRssUrl)}`;
        
        console.log('🔄 Szukam wiadomości dla miasta:', city);
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status !== 'ok' || !data.items || data.items.length === 0) {
            throw new Error(`Brak wiadomości dla miasta ${city}`);
        }
        
        // 2. Dla każdego artykułu pobierz obrazek z oryginalnej strony
        const articlesWithImages = await Promise.all(
            data.items.slice(0, pageSize).map(async (item) => {
                // Dekoduj przekierowany URL Google na oryginalny URL artykułu
                let originalUrl = item.link;
                try {
                    // URL z Google News wygląda jak: https://news.google.com/articles/...?hl=pl&gl=PL&ceid=PL:pl
                    // Próbujemy wydobyć oryginalny URL
                    const urlObj = new URL(item.link);
                    if (urlObj.hostname === 'news.google.com') {
                        // Możemy spróbować użyć API do przekierowania (ale to wymaga dodatkowych zapytań)
                        // Na razie zostawiamy jako jest - obrazek i tak pobierzemy z meta tagów
                    }
                } catch(e) {
                    console.warn('Nie udało się zdekodować URL:', e);
                }
                
                // Próbuj pobrać obrazek z oryginalnej strony
                let imageUrl = null;
                try {
                    // Używamy allorigins.win jako proxy CORS (darmowe, nie wymaga klucza)
                    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(item.link)}`;
                    const pageResponse = await fetch(proxyUrl, {
                        headers: {
                            'Accept': 'text/html'
                        }
                    });
                    
                    if (pageResponse.ok) {
                        const html = await pageResponse.text();
                        // Szukamy meta tagów z obrazkami
                        const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i) ||
                                            html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["'][^>]*>/i);
                        if (ogImageMatch && ogImageMatch[1]) {
                            imageUrl = ogImageMatch[1];
                        }
                        
                        // Jeśli nie znaleziono og:image, spróbuj twitter:image
                        if (!imageUrl) {
                            const twitterImageMatch = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["'][^>]*>/i) ||
                                                      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["'][^>]*>/i);
                            if (twitterImageMatch && twitterImageMatch[1]) {
                                imageUrl = twitterImageMatch[1];
                            }
                        }
                        
                        // Jeśli nadal nie ma, spróbuj pierwszego dużego obrazka
                        if (!imageUrl) {
                            const imgTagMatch = html.match(/<img[^>]*src=["']([^"']+)["'][^>]*>/i);
                            if (imgTagMatch && imgTagMatch[1]) {
                                // Sprawdź czy to nie jest ikona/logo (pomijamy małe obrazki)
                                if (!imgTagMatch[1].includes('logo') && !imgTagMatch[1].includes('icon') && !imgTagMatch[1].includes('avatar')) {
                                    imageUrl = imgTagMatch[1];
                                }
                            }
                        }
                    }
                } catch(imgError) {
                    console.warn('Nie udało się pobrać obrazka dla:', item.link, imgError);
                }
                
                // Jeśli nie udało się pobrać obrazka, użyj placeholder
                if (!imageUrl) {
                    imageUrl = `https://placehold.co/400x200/667eea/white?text=${encodeURIComponent(city)}`;
                }
                
                return {
                    title: item.title || 'Bez tytułu',
                    description: item.description ? item.description.replace(/<[^>]*>/g, '').substring(0, 200) + '...' : 'Brak opisu',
                    image: imageUrl,
                    url: item.link,
                    source: { name: data.feed?.title || 'Google News' },
                    publishedAt: item.pubDate
                };
            })
        );
        
        if (articlesWithImages.length === 0) {
            throw new Error('Brak artykułów po przetworzeniu');
        }
        
        // Zapisz do cache
        const newsPackage = {
            articles: articlesWithImages,
            totalArticles: articlesWithImages.length,
            city: city,
            category: category
        };
        saveNewsToCache(city, category, newsPackage);
        
        renderNews(articlesWithImages);
        statusText.innerText = `📰 Znaleziono ${articlesWithImages.length} wiadomości związanych z ${city}`;
        
    } catch (error) {
        console.error('❌ Błąd:', error);
        
        // Spróbuj z zapytaniem tylko o miasto (bez "Polska")
        try {
            const fallbackQuery = city;
            const fallbackRssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(fallbackQuery)}&hl=pl&gl=PL&ceid=PL:pl`;
            const fallbackUrl = `${RSS2JSON_API}?rss_url=${encodeURIComponent(fallbackRssUrl)}`;
            
            const fallbackResponse = await fetch(fallbackUrl);
            const fallbackData = await fallbackResponse.json();
            
            if (fallbackData.status === 'ok' && fallbackData.items && fallbackData.items.length > 0) {
                const articlesWithImages = await Promise.all(
                    fallbackData.items.slice(0, pageSize).map(async (item) => {
                        let imageUrl = null;
                        try {
                            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(item.link)}`;
                            const pageResponse = await fetch(proxyUrl);
                            if (pageResponse.ok) {
                                const html = await pageResponse.text();
                                const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i);
                                if (ogImageMatch && ogImageMatch[1]) {
                                    imageUrl = ogImageMatch[1];
                                }
                            }
                        } catch(e) {}
                        
                        return {
                            title: item.title,
                            description: item.description ? item.description.replace(/<[^>]*>/g, '').substring(0, 200) + '...' : 'Brak opisu',
                            image: imageUrl || `https://placehold.co/400x200/667eea/white?text=${encodeURIComponent(city)}`,
                            url: item.link,
                            source: { name: fallbackData.feed?.title || 'Google News' },
                            publishedAt: item.pubDate
                        };
                    })
                );
                
                saveNewsToCache(city, category, { articles: articlesWithImages, totalArticles: articlesWithImages.length });
                renderNews(articlesWithImages);
                statusText.innerText = `📰 Znaleziono ${articlesWithImages.length} wiadomości związanych z ${city}`;
                showLoading(false);
                return;
            }
        } catch (fallbackError) {
            console.error('Fallback też nie działa:', fallbackError);
        }
        
        showError(`😢 Nie znaleziono wiadomości dla miasta "${city}". Spróbuj innego miasta.`);
        newsGrid.innerHTML = '<div class="status-message">⚠️ Brak wyników. Spróbuj wpisać większe miasto (np. Warszawa, Kraków, Gdańsk).</div>';
        
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
                      'Warszawa';
            
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
                    statusText.innerText = `📡 Tryb OFFLINE – zapisane newsy dla ${currentCity}`;
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
    console.log('🚀 Aplikacja startuje (Google News - filtrowanie po mieście)...');
    
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