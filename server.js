const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

// Fallback storage (in-memory + file backup)
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || '/tmp';
const DB_PATH = path.join(DATA_DIR, 'db.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize database
let db = { articles: [] };
try {
  if (fs.existsSync(DB_PATH)) {
    db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } else {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  }
} catch (e) {
  console.error('DB init error:', e);
}

function saveDB() {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error('DB save error:', e);
  }
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));


// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', '*');
  res.header('Access-Control-Allow-Methods', '*');
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    articles: db.articles.length,
    dataDir: DATA_DIR
  });
});

// Get all articles
app.get('/api/articles', (req, res) => {
  res.json(db.articles);
});

// Get single article
app.get('/api/articles/:slug', (req, res) => {
  const article = db.articles.find(a => a.slug === req.params.slug);
  if (article) {
    res.json(article);
  } else {
    res.status(404).json({ error: 'Article not found' });
  }
});

// Webhook: Receive article from n8n
app.post('/webhook/espana-hoy-stories', (req, res) => {
  const article = req.body;

  article.id = Date.now().toString();
  article.createdAt = new Date().toISOString();
  article.status = 'published';

  db.articles.unshift(article);
  saveDB();

  console.log('Article saved:', article.title);
  res.json({ success: true, id: article.id });
});

// Webhook: Get pending Facebook posts
app.get('/webhook/espana-hoy-publish-wp', (req, res) => {
  const pending = db.articles.filter(a => a.status === 'published' && !a.facebookPublished);
  res.json(pending);
});

// Mark article as published to Facebook
app.post('/webhook/espana-hoy-publish-wp/:id', (req, res) => {
  const article = db.articles.find(a => a.id === req.params.id);
  if (article) {
    article.facebookPublished = true;
    article.facebookPublishedAt = new Date().toISOString();
    saveDB();
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Article not found' });
  }
});

// Add sample articles
app.post('/api/fix-articles', (req, res) => {
  if (db.articles.length === 0) {
    const sampleArticles = [
      {
        id: '1',
        slug: 'spain-minimum-wage-2024',
        title: 'بشرى للعاملين في إسبانيا: رفع الحد الأدنى للأجور إلى 1134 يورو',
        titleSpanish: 'España sube el Salario Mínimo a 1.134 euros',
        category: 'Jobs',
        excerpt: 'خبر سار لكل العاملين في إسبانيا! 🇪🇸 زيادة رسمية في الحد الأدنى للأجور.',
        image: 'https://image.pollinations.ai/prompt/Spain%20minimum%20wage%20euro?width=800&height=400&nologo=true',
        createdAt: new Date().toISOString(),
        status: 'published',
        facebookPublished: true
      },
      {
        id: '2', 
        slug: 'spain-cheap-cities-2026',
        title: 'وداعاً لغلاء مدريد: أرخص 5 مدن للسكن في إسبانيا 2026',
        titleSpanish: 'Las 5 ciudades más baratas para vivir en España 2026',
        category: 'Housing',
        excerpt: 'هل أسعار مدريد وبرشلونة صدمتك؟ اكتشف 5 مدن سرية بإيجارات رخيصة!',
        image: 'https://image.pollinations.ai/prompt/Spain%20cheap%20cities%20housing?width=800&height=400&nologo=true',
        createdAt: new Date().toISOString(),
        status: 'published',
        facebookPublished: true
      },
      {
        id: '3',
        slug: 'spain-digital-nomad-visa',
        title: 'تأشيرة النوماد الرقمي في إسبانيا 2026: كل ما تحتاجه',
        titleSpanish: 'Visa de Nómada Digital en España 2026',
        category: 'Immigration',
        excerpt: '2300 يورو فقط شهرياً للحصول على إقامة إسبانيا كnomad رقمي!',
        image: 'https://image.pollinations.ai/prompt/Spain%20digital%20nomad%20visa%20laptop?width=800&height=400&nologo=true',
        createdAt: new Date().toISOString(),
        status: 'published',
        facebookPublished: false
      }
    ];
    db.articles = sampleArticles;
    saveDB();
    res.json({ success: true, count: sampleArticles.length });
  } else {
    res.json({ success: true, count: db.articles.length, message: 'Articles already exist' });
  }
});

// Sitemap
app.get('/sitemap.xml', (req, res) => {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  xml += '  <url><loc>https://espana-hoy-production.up.railway.app/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>\n';
  db.articles.forEach(article => {
    xml += `  <url><loc>https://espana-hoy-production.up.railway.app/article/${article.slug}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>\n`;
  });
  xml += '</urlset>';
  res.header('Content-Type', 'application/xml');
  res.send(xml);
});

// Robots.txt
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send('User-agent: *\nDisallow: /webhook/\nAllow: /\nSitemap: https://espana-hoy-production.up.railway.app/sitemap.xml');
});

// Ads.txt (managed by AdsTxtManager)
app.get('/ads.txt', (req, res) => {
  res.redirect(301, 'https://srv.adstxtmanager.com/19390/espaniaalyoum.com');
});

// Serve pages
app.get('/article/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'article.html'));
});

app.get(['/about', '/contact', '/privacy', '/category/:cat'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`España Hoy running on port ${PORT}`);
  console.log(`Articles: ${db.articles.length}`);
});
