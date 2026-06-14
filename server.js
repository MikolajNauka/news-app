// server.js - backend Node.js
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Serwuje pliki statyczne (index.html, main.js, itp.)

// TWOJ KLUCZ API GNEWS - WPISZ SWÓJ PRAWDZIWY KLUCZ
const GNEWS_API_KEY = 'a7142e3ae69ca2af595e522a78ddf860'; // <-- TU WPISZ SWÓJ KLUCZ

// Endpoint API dla newsów
app.get('/api/news', async (req, res) => {
    const { city, category, pageSize = 9 } = req.query;
    
    console.log(`📢 Zapytanie: miasto=${city}, kategoria=${category}, limit=${pageSize}`);
    
    try {
        if (!city) {
            return res.status(400).json({ error: 'Brak parametru city' });
        }
        
        // Budowanie zapytania do GNews
        let query = `${city} Polska`;
        if (category && category !== 'general') {
            const categoryMap = {
                'technology': 'technology',
                'sports': 'sports',
                'business': 'business',
                'health': 'health',
                'science': 'science',
                'entertainment': 'entertainment'
            };
            const englishCategory = categoryMap[category] || category;
            query = `${city} ${englishCategory} Polska`;
        }
        
        const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=pl&country=pl&max=${pageSize}&sortby=relevance&apikey=${GNEWS_API_KEY}`;
        console.log('🔄 Zapytanie do GNews:', url);
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (!response.ok) {
            console.error('❌ Błąd GNews:', data);
            return res.status(response.status).json({ 
                error: data.errors ? data.errors[0] : 'Błąd API GNews',
                status: response.status
            });
        }
        
        console.log(`✅ Znaleziono ${data.articles?.length || 0} artykułów`);
        res.json(data);
        
    } catch (error) {
        console.error('❌ Błąd serwera:', error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint zdrowia (do testowania)
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Uruchom serwer
app.listen(PORT, () => {
    console.log(`
    ╔═══════════════════════════════════════════════════╗
    ║   🚀 Serwer Node.js uruchomiony!                  ║
    ║   📡 Nasłuchuje na porcie: ${PORT}                    ║
    ║   🌐 Otwórz: http://localhost:${PORT}              ║
    ╚═══════════════════════════════════════════════════╝
    `);
});